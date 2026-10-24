import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import { plans } from './plans.js';

const { Pool } = pg;
const port = Number(process.env.PORT || 10000);
const paymentEnvironment = String(process.env.PESAPAL_ENVIRONMENT || '').trim().toLowerCase();
const environmentConfigured = paymentEnvironment === 'live' || paymentEnvironment === 'sandbox';
const live = paymentEnvironment === 'live';
const base = live ? 'https://pay.pesapal.com/v3' : 'https://cybqa.pesapal.com/pesapalv3';
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, max: Math.min(10, Math.max(2, Number(process.env.PG_POOL_MAX || 5))), idleTimeoutMillis: 10000, connectionTimeoutMillis: 3000, statement_timeout: 8000, query_timeout: 9000, application_name: 'tikvtv-payment-api' }) : null;
const cataloguePool = process.env.IPTV_DATABASE_URL ? new Pool({ connectionString: process.env.IPTV_DATABASE_URL, ssl: { rejectUnauthorized: true }, max: 3, connectionTimeoutMillis: 3000, statement_timeout: 8000, application_name: 'tikvtv-approved-catalogue' }) : null;
// Optional second approved catalogue. Set this to infinity-vpn's dedicated Postgres connection string.
// Never use a browser anon key here; this connection stays server-side.
const infinityCataloguePool = process.env.INFINITY_IPTV_DATABASE_URL ? new Pool({ connectionString: process.env.INFINITY_IPTV_DATABASE_URL, ssl: { rejectUnauthorized: true }, max: 2, connectionTimeoutMillis: 3000, statement_timeout: 8000, application_name: 'tikvtv-infinity-catalogue' }) : null;
const cataloguePools = [
  ...(cataloguePool ? [{ pool: cataloguePool, prefix: '' }] : []),
  ...(infinityCataloguePool ? [{ pool: infinityCataloguePool, prefix: 'infinity-' }] : []),
];
const allowedOrigins = new Set((process.env.CORS_ORIGINS || 'https://streamora.co.ke,https://www.streamora.co.ke').split(',').map(x => x.trim()).filter(Boolean));
const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }); res.end(JSON.stringify(data)); };
const configured = () => Boolean(environmentConfigured && process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET && process.env.PESAPAL_IPN_ID);
const authConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
function requireDb() { if (!pool) throw Object.assign(new Error('Database is not configured'), { status: 503 }); }
async function readBody(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 32000) throw Object.assign(new Error('Request too large'), { status: 413 }); }
  if (!raw) return {}; try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
async function token() {
  if (!configured()) throw new Error('Pesapal credentials or IPN ID not configured');
  const response = await fetch(base + '/api/Auth/RequestToken', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ consumer_key: process.env.PESAPAL_CONSUMER_KEY, consumer_secret: process.env.PESAPAL_CONSUMER_SECRET }), signal: AbortSignal.timeout(15000) });
  const data = await response.json(); if (!response.ok || !data.token) throw new Error('Pesapal authentication failed'); return data.token;
}
async function pesapal(path, method = 'GET', body) {
  const auth = await token(); const response = await fetch(base + path, { method, headers: { authorization: 'Bearer ' + auth, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error('Pesapal API request failed'); return data;
}
// Validate the existing session with the identity provider; client-supplied user IDs are never trusted.
async function authenticate(req) {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ') || !authConfigured()) throw Object.assign(new Error('Sign in required or account validation is not configured'), { status: 401 });
  const response = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', { headers: { apikey: process.env.SUPABASE_ANON_KEY, authorization }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Object.assign(new Error('Session is invalid or expired'), { status: 401 });
  const user = await response.json(); if (!user?.id) throw Object.assign(new Error('Session is invalid'), { status: 401 }); return user;
}
async function initOrder(user, body) {
  requireDb();
  const planCode = body.plan_code || 'month'; const plan = plans[planCode];
  if (!plan) throw Object.assign(new Error('Choose a valid subscription plan'), { status: 400 });
  const merchantReference = 'TTV-' + crypto.randomUUID();
  const insert = await pool.query("INSERT INTO payment_orders (merchant_reference,user_id,plan_code,amount_kes,currency,status) VALUES ($1,$2,$3,$4,'KES','pending') RETURNING id,merchant_reference,plan_code,amount_kes", [merchantReference, user.id, planCode, plan.amount]);
  const order = insert.rows[0];
  try {
    const appUrl = (process.env.APP_URL || 'https://streamora.co.ke').replace(/\/$/, '');
    if (!appUrl.startsWith('https://')) throw new Error('Secure callback URL must use HTTPS');
    const result = await pesapal('/api/Transactions/SubmitOrderRequest', 'POST', {
      id: merchantReference, currency: 'KES', amount: plan.amount, description: 'TikVTV ' + plan.label,
      callback_url: appUrl + '/payment-callback', notification_id: process.env.PESAPAL_IPN_ID,
      billing_address: { email_address: user.email || '', first_name: user.user_metadata?.first_name || user.email?.split('@')[0] || 'TikVTV', last_name: user.user_metadata?.last_name || 'Customer' }
    });
    if (!result.order_tracking_id || !result.redirect_url || !(new URL(result.redirect_url).hostname === 'pesapal.com' || new URL(result.redirect_url).hostname.endsWith('.pesapal.com')) || new URL(result.redirect_url).protocol !== 'https:') throw new Error('Pesapal did not return a valid secure checkout order');
    await pool.query('UPDATE payment_orders SET order_tracking_id=$1,pesapal_redirect_url=$2 WHERE id=$3', [result.order_tracking_id, result.redirect_url, order.id]);
    return { order_tracking_id: result.order_tracking_id, merchant_reference: merchantReference, redirect_url: result.redirect_url, amount_kes: plan.amount, plan_code: planCode };
  } catch (error) {
    await pool.query("UPDATE payment_orders SET status='failed' WHERE id=$1 AND status='pending'", [order.id]);
    throw error;
  }
}
async function verifyAndActivate(tracking, suppliedReference = '') {
  requireDb();
  if (typeof tracking !== 'string' || !tracking.trim()) throw Object.assign(new Error('Payment tracking ID is required'), { status: 400 });
  const orderResult = await pool.query('SELECT * FROM payment_orders WHERE order_tracking_id=$1 LIMIT 1', [tracking.trim()]);
  const order = orderResult.rows[0];
  if (!order) throw Object.assign(new Error('Payment order not found'), { status: 404 });
  if (suppliedReference && suppliedReference !== order.merchant_reference) {
    throw Object.assign(new Error('Payment reference does not match the order'), { status: 400 });
  }
  // An already committed order must remain idempotent even during a Pesapal outage.
  if (order.status === 'completed') {
    const existing = await pool.query('SELECT expires_at FROM subscriptions WHERE user_id=$1 AND expires_at>NOW() ORDER BY expires_at DESC LIMIT 1', [order.user_id]);
    return { payment_status_description: 'Completed', active: existing.rowCount > 0, ends_at: existing.rows[0]?.expires_at || null, order_tracking_id: order.order_tracking_id };
  }
  const verified = await pesapal('/api/Transactions/GetTransactionStatus?orderTrackingId=' + encodeURIComponent(order.order_tracking_id));
  const status = String(verified.payment_status_description || '').toLowerCase();
  const amount = Number(verified.amount); const currency = String(verified.currency || '').toUpperCase();
  const complete = status === 'completed' && amount === Number(order.amount_kes) && currency === 'KES' && String(verified.merchant_reference || '') === order.merchant_reference;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO pesapal_ipn_events (notification_id,order_tracking_id,merchant_reference,verification_status,payload) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (notification_id,order_tracking_id,verification_status) DO NOTHING', [process.env.PESAPAL_IPN_ID || 'status-poll', order.order_tracking_id, order.merchant_reference, status || 'unknown', JSON.stringify({ status: verified.payment_status_description, amount: verified.amount, currency: verified.currency, confirmation_code: verified.confirmation_code || null })]);
    const locked = await client.query('SELECT * FROM payment_orders WHERE id=$1 FOR UPDATE', [order.id]);
    const current = locked.rows[0];
    if (complete && current.status !== 'completed') {
      const plan = plans[current.plan_code]; if (!plan) throw new Error('Stored plan is invalid');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [current.user_id]);
      const now = new Date();
      const sub = await client.query('SELECT starts_at,expires_at FROM subscriptions WHERE user_id=$1 FOR UPDATE', [current.user_id]);
      const existing = sub.rows[0]; const start = existing && new Date(existing.expires_at) > now ? new Date(existing.expires_at) : now;
      const expires = new Date(start.getTime() + plan.durationMs);
      await client.query("UPDATE payment_orders SET status='completed',paid_at=NOW(),pesapal_payment_method=$2,pesapal_confirmation_code=$3,raw_ipn=$4::jsonb WHERE id=$1", [current.id, verified.payment_method || null, verified.confirmation_code || null, JSON.stringify(verified)]);
      await client.query("INSERT INTO subscriptions (user_id,plan_code,starts_at,expires_at,source_order_id,updated_at) VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT (user_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,source_order_id=EXCLUDED.source_order_id,updated_at=NOW()", [current.user_id, current.plan_code, start, expires, current.id]);
    } else if (['failed','invalid','reversed','cancelled'].includes(status) && current.status === 'pending') {
      await client.query("UPDATE payment_orders SET status='failed',raw_ipn=$2::jsonb WHERE id=$1", [current.id, JSON.stringify(verified)]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  const entitlement = await pool.query('SELECT expires_at FROM subscriptions WHERE user_id=$1 AND expires_at>NOW()', [order.user_id]);
  return { payment_status_description: verified.payment_status_description || 'Pending', active: entitlement.rows.length > 0, ends_at: entitlement.rows[0]?.expires_at || null, order_tracking_id: order.order_tracking_id };
}

// Recover completed payments even when the browser closes or Pesapal's IPN is delayed.
// A single worker tick is bounded; verifyAndActivate locks the order and account
// transactionally so IPN, status polling and this worker cannot double-credit.
let reconciliationRunning = false;
let recoveryCursor = 0;
// Rotate through outstanding orders rather than repeatedly checking the oldest
// ten: an unresolved checkout must never starve newer customers' payments.
async function reconcileRecentOrders() {
  if (reconciliationRunning || !pool || !configured()) return;
  reconciliationRunning = true;
  try {
    const query = "SELECT id,order_tracking_id FROM payment_orders WHERE order_tracking_id IS NOT NULL AND status IN ('pending','failed') AND created_at > NOW() - INTERVAL '2 days' AND id > $1 ORDER BY id ASC LIMIT 10";
    let candidates = await pool.query(query, [recoveryCursor]);
    if (!candidates.rowCount && recoveryCursor) {
      recoveryCursor = 0;
      candidates = await pool.query(query, [recoveryCursor]);
    }
    for (const row of candidates.rows) {
      recoveryCursor = Number(row.id);
      try { await verifyAndActivate(row.order_tracking_id); }
      catch (error) { console.error('Payment recovery retry failed:', error.message); }
    }
  } catch (error) { console.error('Payment recovery scan failed:', error.message); }
  finally { reconciliationRunning = false; }
}
const recoveryTimer = setInterval(() => { void reconcileRecentOrders(); }, 60_000);
recoveryTimer.unref();

// All access surfaces use the same verified account entitlement. Never trust a
// client-side payment result; reconcile only known orders owned by this account.
async function activeEntitlement(userId, reconcile = true) {
  let paid = await pool.query('SELECT plan_code,starts_at,expires_at FROM subscriptions WHERE user_id=$1 AND expires_at>NOW() ORDER BY expires_at DESC LIMIT 1', [userId]);
  if (!paid.rowCount && reconcile && configured()) {
    const pending = await pool.query("SELECT order_tracking_id FROM payment_orders WHERE user_id=$1 AND order_tracking_id IS NOT NULL AND status IN ('pending','failed') AND created_at > NOW()-INTERVAL '2 days' ORDER BY created_at DESC LIMIT 5", [userId]);
    for (const order of pending.rows) {
      try { await verifyAndActivate(order.order_tracking_id); }
      catch (error) { console.error('Entitlement reconciliation failed:', error.message); }
      paid = await pool.query('SELECT plan_code,starts_at,expires_at FROM subscriptions WHERE user_id=$1 AND expires_at>NOW() ORDER BY expires_at DESC LIMIT 1', [userId]);
      if (paid.rowCount) break;
    }
  }
  return paid.rows[0] || null;
}

const secret = () => crypto.randomBytes(32).toString('base64url');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const pairingError = (message, status = 400) => Object.assign(new Error(message), { status });
async function tvDevice(req) {
  requireDb();
  const bearer = (req.headers.authorization || '').match(/^Bearer ([A-Za-z0-9_-]{32,})$/)?.[1];
  if (!bearer) throw pairingError('TV pairing required', 401);
  const result = await pool.query("SELECT id,user_id FROM tv_pairings WHERE device_token_hash=$1 AND approved_at IS NOT NULL AND revoked_at IS NULL", [digest(bearer)]);
  if (!result.rowCount) throw pairingError('TV connection revoked', 401);
  return result.rows[0];
}
async function tvRoute(req, res, url) {
  requireDb();
  const path = url.pathname;
  if (req.method === 'POST' && path === '/v1/tv/pair/start') {
    const challenge = secret(), pollToken = secret(), id = crypto.randomUUID();
    const code = String(crypto.randomInt(100000, 1000000));
    await pool.query("INSERT INTO tv_pairings(id,challenge_hash,poll_hash,display_code,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '5 minutes')", [id,digest(challenge),digest(pollToken),code]);
    return json(res, 201, { challenge, poll_token: pollToken, display_code: code, expires_in_seconds: 300 });
  }
  if (req.method === 'POST' && path === '/v1/tv/pair/approve') {
    const user = await authenticate(req), body = await readBody(req);
    if (typeof body.challenge !== 'string' || !/^[A-Za-z0-9_-]{32,}$/.test(body.challenge)) throw pairingError('Invalid QR pairing challenge');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query("SELECT id,display_code FROM tv_pairings WHERE challenge_hash=$1 AND approved_at IS NULL AND revoked_at IS NULL AND expires_at>NOW() FOR UPDATE", [digest(body.challenge)]);
      if (!result.rowCount) throw pairingError('Pairing code expired or already used', 410);
      if (body.display_code !== result.rows[0].display_code) throw pairingError('TV confirmation code does not match');
      await client.query("UPDATE tv_pairings SET user_id=$1,approved_at=NOW() WHERE id=$2", [user.id,result.rows[0].id]);
      await client.query('COMMIT');
      return json(res, 200, { connected: true, pairing_id: result.rows[0].id });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  if (req.method === 'POST' && path === '/v1/tv/pair/status') {
    const body = await readBody(req);
    if (typeof body.poll_token !== 'string' || !/^[A-Za-z0-9_-]{32,}$/.test(body.poll_token)) throw pairingError('Invalid TV polling credential', 401);
    const result = await pool.query("SELECT id,approved_at,expires_at,revoked_at,claimed_at FROM tv_pairings WHERE poll_hash=$1", [digest(body.poll_token)]);
    if (!result.rowCount || result.rows[0].revoked_at) throw pairingError('Pairing not found or revoked', 410);
    const row = result.rows[0];
    if (!row.approved_at && new Date(row.expires_at).getTime() < Date.now()) throw pairingError('Pairing expired', 410);
    // Polling is only proof of possession of the TV private credential. Issue a new
    // device token atomically once, then retain it via the private poll response.
    if (!row.approved_at) return json(res, 200, { connected: false });
    if (row.claimed_at) return json(res, 200, { connected: true, already_claimed: true, pairing_id: row.id });
    const token = secret();
    const claimed = await pool.query("UPDATE tv_pairings SET device_token_hash=$1,claimed_at=NOW(),last_seen_at=NOW() WHERE id=$2 AND claimed_at IS NULL RETURNING id", [digest(token),row.id]);
    if (!claimed.rowCount) return json(res, 200, { connected: true, already_claimed: true, pairing_id: row.id });
    return json(res, 200, { connected: true, device_token: token, pairing_id: row.id });
  }
  if (req.method === 'GET' && path === '/v1/tv/device/viewing-access') {
    const device = await tvDevice(req);
    const channelId = url.searchParams.get('channel_id')?.trim();
    if (!channelId || channelId.length > 200) throw pairingError('Valid channel_id is required');
    const paid = await activeEntitlement(device.user_id);
    if (paid) return json(res,200,{active:true,allowed:true,ends_at:paid.expires_at,preview_ends_at:null,previews_used:0,previews_limit:7});
    const prior = await pool.query('SELECT expires_at FROM subscriptions WHERE user_id=$1 LIMIT 1',[device.user_id]);
    if (prior.rowCount) return json(res,200,{active:false,allowed:false,expired:true,ends_at:prior.rows[0].expires_at,preview_ends_at:null,previews_used:7,previews_limit:7});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['preview:'+device.user_id]);
      let preview = await client.query('SELECT expires_at FROM free_channel_previews WHERE user_id=$1 AND channel_id=$2',[device.user_id,channelId]);
      const count = await client.query('SELECT COUNT(*)::int AS used FROM free_channel_previews WHERE user_id=$1',[device.user_id]);
      const used = count.rows[0].used;
      if (!preview.rowCount && used < 7) preview = await client.query("INSERT INTO free_channel_previews(user_id,channel_id,started_at,expires_at) VALUES($1,$2,NOW(),NOW()+INTERVAL '15 minutes') ON CONFLICT(user_id,channel_id) DO UPDATE SET channel_id=EXCLUDED.channel_id RETURNING expires_at",[device.user_id,channelId]);
      await client.query('COMMIT');
      const expiry=preview.rows[0]?.expires_at || null;
      return json(res,200,{active:false,allowed:Boolean(expiry && new Date(expiry).getTime()>Date.now()),ends_at:null,preview_ends_at:expiry,previews_used:used,previews_limit:7});
    } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  if (req.method === 'GET' && path === '/v1/tv/device/subscription') {
    const device = await tvDevice(req);
    const entitlement = await activeEntitlement(device.user_id);
    return json(res, 200, { active: Boolean(entitlement), plan_code: entitlement?.plan_code || null, ends_at: entitlement?.expires_at || null });
  }
  if (req.method === 'GET' && path === '/v1/tv/remote/poll') {
    const device = await tvDevice(req);
    const after = Number(url.searchParams.get('after') || 0);
    if (!Number.isSafeInteger(after) || after<0) throw pairingError('Invalid cursor');
    const result = await pool.query("SELECT id,command FROM tv_remote_commands WHERE pairing_id=$1 AND id>$2 AND created_at>NOW()-INTERVAL '30 seconds' ORDER BY id ASC LIMIT 30", [device.id,after]);
    return json(res, 200, { commands: result.rows });
  }
  if (req.method === 'POST' && path === '/v1/tv/remote/send') {
    const user = await authenticate(req), body = await readBody(req);
    if (typeof body.pairing_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.pairing_id) || !['up','down','left','right','select','back','home','play_pause','next','previous'].includes(body.command)) throw pairingError('Invalid remote command');
    const result = await pool.query("INSERT INTO tv_remote_commands(pairing_id,command) SELECT id,$3 FROM tv_pairings WHERE id=$1 AND user_id=$2 AND approved_at IS NOT NULL AND revoked_at IS NULL RETURNING id", [body.pairing_id,user.id,body.command]);
    if (!result.rowCount) throw pairingError('TV not connected to this account', 403);
    return json(res, 202, { accepted: true, command_id: result.rows[0].id });
  }
  if (req.method === 'GET' && path === '/v1/tv/devices') {
    const user = await authenticate(req);
    const result = await pool.query("SELECT id,display_code,approved_at,last_seen_at FROM tv_pairings WHERE user_id=$1 AND approved_at IS NOT NULL AND revoked_at IS NULL ORDER BY approved_at DESC LIMIT 20", [user.id]);
    return json(res, 200, { devices: result.rows });
  }
  if (req.method === 'POST' && path === '/v1/tv/revoke') {
    const user = await authenticate(req), body = await readBody(req);
    const result = await pool.query("UPDATE tv_pairings SET revoked_at=NOW(),device_token_hash=NULL WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id", [body.pairing_id,user.id]);
    if (!result.rowCount) throw pairingError('Connected TV not found', 404);
    return json(res, 200, { revoked: true });
  }
  throw pairingError('TV endpoint not found', 404);
}


async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/v1/tv/')) {
    try { return await tvRoute(req,res,url); }
    catch(e) { console.error('TV pairing request failed:', e.message); return json(res,e.status || 503,{error:e.message || 'TV pairing unavailable'}); }
  }
  // One server-owned catalogue drives both checkout validation and the Premium UI.
  if (req.method === 'GET' && url.pathname === '/v1/plans') {
    return json(res, 200, {
      currency: 'KES',
      plans: Object.entries(plans).map(([code, plan]) => ({
        code,
        amount_kes: plan.amount,
        label: plan.displayName,
        duration_label: plan.durationLabel,
        duration_ms: plan.durationMs,
      })),
    });
  }
  // Both catalogues use the same fail-closed publication gate. Infinity additions remain hidden
  // until their source is enabled, rights are approved, and health is verified.
  if (req.method === 'GET' && url.pathname === '/v1/catalogue') {
    try {
      if (!cataloguePools.length) return json(res, 503, { error: 'Approved catalogue database is not configured' });
      const rawLimit = url.searchParams.get('limit') || '30';
      const rawCursor = url.searchParams.get('after') || '0';
      if (!/^\d+$/.test(rawLimit) || !/^\d+$/.test(rawCursor)) return json(res, 400, { error: 'Invalid catalogue pagination' });
      const requestedLimit = Number(rawLimit);
      const cursor = Number(rawCursor);
      if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || !Number.isSafeInteger(cursor) || cursor < 0 || cursor > 50000) return json(res, 400, { error: 'Invalid catalogue pagination' });
      const limit = Math.min(100, requestedLimit);
      // The API cursor is a global offset across the merged catalogue, not a database row ID.
      // Overscan each source so cross-source URL deduplication does not prematurely end a page.
      const scanLimit = Math.min(50000, cursor + limit + 5000);
      const sourceResults = await Promise.allSettled(cataloguePools.map(async ({ pool, prefix }, sourceIndex) => {
        const result = await pool.query(`SELECT id,name,stream_url,country,logo_url,category,language,url_hash FROM (
            SELECT DISTINCT ON (t.url_hash) t.id,t.name,t.stream_url,t.country,t.logo_url,t.category,t.language,t.url_hash
            FROM iptv.streams t JOIN iptv.sources s ON s.id=t.source_id
            WHERE s.enabled=TRUE AND s.publication_approved=TRUE AND t.rights_status='approved' AND t.health_status='healthy'
              AND t.stream_url LIKE 'https://%'
            ORDER BY t.url_hash,t.id
          ) approved ORDER BY id LIMIT $1`, [scanLimit]);
        return result.rows.map(row => ({ ...row, id: prefix + String(row.id), _sourceIndex: sourceIndex, _numericId: Number(row.id) || 0 }));
      }));
      const sourceRows = sourceResults.filter(result => result.status === 'fulfilled').map(result => result.value);
      sourceResults.forEach((result, index) => {
        if (result.status !== 'rejected') return;
        const error = result.reason;
        // Log only PostgreSQL's structured error code, never messages, SQL, URLs or credentials.
        const code = typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'CONNECTION_OR_QUERY_ERROR';
        console.error('Approved catalogue source failed', { source: index === 0 ? (cataloguePool ? 'primary' : 'infinity') : 'infinity', code });
      });
      if (!sourceRows.length) return json(res, 503, { error: 'Catalogue temporarily unavailable' });
      const seen = new Set();
      const merged = sourceRows.flat()
        .sort((a, b) => a._sourceIndex - b._sourceIndex || a._numericId - b._numericId)
        .filter(row => {
          if (seen.has(row.url_hash)) return false;
          seen.add(row.url_hash);
          return true;
        });
      const page = merged.slice(cursor, cursor + limit);
      const hasMore = merged.length > cursor + page.length || scanLimit === 50000;
      const channels = page.map(({ url_hash, _sourceIndex, _numericId, ...channel }) => channel);
      return json(res, 200, {
        channels,
        next_cursor: hasMore && page.length ? cursor + page.length : null,
        publication: 'approved_only',
      });
    } catch (e) { console.error('Catalogue query failed:', e.message); return json(res, 503, { error: 'Catalogue temporarily unavailable' }); }
  }
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok', service: 'tikvtv-payment-backend', database_configured: Boolean(pool), auth_validation_configured: authConfigured(), pesapal_credentials_present: configured(), environment: environmentConfigured ? paymentEnvironment : 'invalid' });
  if (req.method === 'GET' && url.pathname === '/pesapal/readiness') {
    if (!pool || !configured() || !authConfigured()) return json(res, 503, { ready: false, reason: !pool ? 'database_missing' : !environmentConfigured ? 'pesapal_environment_invalid' : !configured() ? 'pesapal_configuration_missing' : 'account_validation_configuration_missing' });
    try {
      await pool.query('SELECT 1');
      const schema = await pool.query(`
        SELECT
          to_regclass('public.payment_orders') IS NOT NULL AS payment_orders,
          to_regclass('public.subscriptions') IS NOT NULL AS subscriptions,
          to_regclass('public.pesapal_ipn_events') IS NOT NULL AS pesapal_ipn_events,
          to_regclass('public.free_preview_sessions') IS NOT NULL AS free_preview_sessions,
          to_regclass('public.free_channel_previews') IS NOT NULL AS free_channel_previews,
          to_regclass('public.guest_preview_installations') IS NOT NULL AS guest_preview_installations,
          to_regclass('public.guest_channel_previews') IS NOT NULL AS guest_channel_previews,
          to_regclass('public.pesapal_ipn_events_notification_tracking_status_key') IS NOT NULL AS ipn_status_history_index,
          (SELECT is_nullable = 'YES' FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_orders' AND column_name = 'order_tracking_id') AS order_tracking_id_nullable,
          (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_orders' AND column_name IN ('pesapal_payment_method','pesapal_confirmation_code','raw_ipn','paid_at')) AS payment_activation_columns
      `);
      if (!schema.rows[0]?.payment_orders || !schema.rows[0]?.subscriptions || !schema.rows[0]?.pesapal_ipn_events || !schema.rows[0]?.free_preview_sessions || !schema.rows[0]?.free_channel_previews || !schema.rows[0]?.guest_preview_installations || !schema.rows[0]?.guest_channel_previews || !schema.rows[0]?.ipn_status_history_index || schema.rows[0]?.order_tracking_id_nullable !== true || schema.rows[0]?.payment_activation_columns !== 4) {
        return json(res, 503, { ready: false, reason: 'payment_schema_missing' });
      }
      await token();
      return json(res, 200, { ready: true, database: true, payment_schema: true, pesapal: true, account_validation: true, premium_activation_enabled: true, environment: live ? 'live' : 'sandbox' });
    } catch { return json(res, 503, { ready: false, reason: 'dependency_check_failed' }); }
  }
  if (req.method === 'GET' && url.pathname === '/pesapal/ipn') {
    const tracking = url.searchParams.get('OrderTrackingId'); if (!tracking || !configured() || !pool) return json(res, 503, { error: 'Callback not ready' });
    try { const result = await verifyAndActivate(tracking, url.searchParams.get('OrderMerchantReference') || ''); return json(res, 200, { orderNotificationType: url.searchParams.get('OrderNotificationType') || 'IPNCHANGE', orderTrackingId: tracking, orderMerchantReference: url.searchParams.get('OrderMerchantReference') || '', status: 200, payment_status_description: result.payment_status_description }); }
    catch (error) { console.error('Pesapal IPN verification failed:', error.message); return json(res, 503, { error: 'Transaction verification failed; retry callback' }); }
  }
  if (req.method === 'POST' && url.pathname === '/v1/checkout') {
    try { const user = await authenticate(req); const body = await readBody(req); return json(res, 201, await initOrder(user, body)); }
    catch (e) { console.error('Checkout failed:', e.message); return json(res, e.status || 502, { error: e.message || 'Checkout failed' }); }
  }
  if (req.method === 'POST' && url.pathname === '/v1/payment/status') {
    try { const user = await authenticate(req); const body = await readBody(req); if (typeof body.order_tracking_id !== 'string' || !body.order_tracking_id) return json(res, 400, { error: 'order_tracking_id is required' });
      requireDb(); const owned = await pool.query('SELECT 1 FROM payment_orders WHERE order_tracking_id=$1 AND user_id=$2', [body.order_tracking_id, user.id]); if (!owned.rowCount) return json(res, 404, { error: 'Payment order not found' });
      return json(res, 200, await verifyAndActivate(body.order_tracking_id));
    } catch (e) { console.error('Payment status check failed:', e.message); return json(res, e.status || 502, { error: e.message || 'Status check failed' }); }
  }
  if (req.method === 'POST' && url.pathname === '/v1/guest/start') {
    try {
      requireDb();
      const secret = crypto.randomBytes(32).toString('base64url');
      const hash = crypto.createHash('sha256').update(secret).digest('hex');
      await pool.query('INSERT INTO guest_preview_installations(token_hash) VALUES($1)', [hash]);
      return json(res, 201, { guest_token: secret, previews_limit: 3 });
    } catch (e) { return json(res, 503, { error: 'Guest preview unavailable' }); }
  }
  if (req.method === 'GET' && url.pathname === '/v1/guest/viewing-access') {
    try {
      requireDb();
      const secret = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return json(res, 401, { error: 'Guest session required' });
      const hash = crypto.createHash('sha256').update(secret).digest('hex');
      const channel = url.searchParams.get('channel_id')?.trim();
      if (!channel || channel.length > 200) return json(res, 400, { error: 'Invalid channel' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const guest = await client.query('SELECT claimed_user_id FROM guest_preview_installations WHERE token_hash=$1 FOR UPDATE', [hash]);
        if (!guest.rowCount || guest.rows[0].claimed_user_id) { await client.query('ROLLBACK'); return json(res, 403, { error: 'Guest session unavailable; sign in to continue' }); }
        let preview = await client.query('SELECT expires_at FROM guest_channel_previews WHERE token_hash=$1 AND channel_id=$2', [hash, channel]);
        const existingPreview = preview.rowCount > 0;
        const count = await client.query('SELECT COUNT(*)::int AS used FROM guest_channel_previews WHERE token_hash=$1', [hash]);
        const used = count.rows[0].used;
        if (!preview.rowCount && used < 3) preview = await client.query("INSERT INTO guest_channel_previews(token_hash,channel_id) VALUES($1,$2) RETURNING expires_at", [hash,channel]);
        const allocated = used + (preview.rowCount && used < 3 && !existingPreview ? 1 : 0);
        await client.query('COMMIT');
        const expiry = preview.rows[0]?.expires_at || null;
        return json(res, 200, { active:false, allowed: Boolean(expiry && new Date(expiry).getTime()>Date.now()), preview_ends_at:expiry, previews_used:allocated, previews_limit:3, stage:'guest' });
      } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch(e) { console.error('Guest preview failed:',e.message); return json(res,503,{error:'Guest preview unavailable'}); }
  }
  if (req.method === 'POST' && url.pathname === '/v1/guest/claim') {
    try {
      const user = await authenticate(req); requireDb();
      const body = await readBody(req);
      if (typeof body.guest_token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.guest_token)) return json(res,400,{error:'Invalid guest token'});
      const hash = crypto.createHash('sha256').update(body.guest_token).digest('hex');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const guest = await client.query('SELECT claimed_user_id FROM guest_preview_installations WHERE token_hash=$1 FOR UPDATE',[hash]);
        if (!guest.rowCount || (guest.rows[0].claimed_user_id && guest.rows[0].claimed_user_id!==user.id)) { await client.query('ROLLBACK'); return json(res,403,{error:'Guest preview already claimed or missing'}); }
        const prior = await client.query('SELECT 1 FROM subscriptions WHERE user_id=$1',[user.id]);
        const previous = await client.query('SELECT 1 FROM free_channel_previews WHERE user_id=$1 LIMIT 1',[user.id]);
        if (prior.rowCount || previous.rowCount) { await client.query('ROLLBACK'); return json(res,409,{error:'Existing account preview cannot be reset'}); }
        const other = await client.query('SELECT 1 FROM guest_preview_installations WHERE claimed_user_id=$1 AND token_hash<>$2',[user.id,hash]);
        if (other.rowCount) { await client.query('ROLLBACK'); return json(res,409,{error:'Account already claimed a guest preview'}); }
        await client.query('UPDATE guest_preview_installations SET claimed_user_id=$1,claimed_at=COALESCE(claimed_at,NOW()) WHERE token_hash=$2',[user.id,hash]);
        await client.query('COMMIT');
        return json(res,200,{claimed:true,previews_limit:7});
      } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch(e) { console.error('Guest claim failed:',e.message); return json(res,e.status||503,{error:'Guest claim unavailable'}); }
  }
  if (req.method === 'GET' && url.pathname === '/v1/viewing-access') {
    try {
      const user = await authenticate(req);
      requireDb();
      const channelId = url.searchParams.get('channel_id')?.trim();
      if (!channelId || channelId.length > 200) return json(res, 400, { error: 'Valid channel_id is required' });
      // Check the paid entitlement first: every paid plan unlocks every channel.
      const paid = await activeEntitlement(user.id);
      if (paid) return json(res, 200, { active: true, allowed: true, ends_at: paid.expires_at, preview_ends_at: null, previews_used: 0, previews_limit: 7 });
      // A previously paid account must lock immediately at expiry, not silently fall back to a new free preview.
      const prior = await pool.query('SELECT expires_at FROM subscriptions WHERE user_id=$1 LIMIT 1', [user.id]);
      if (prior.rowCount) return json(res, 200, { active: false, allowed: false, expired: true, ends_at: prior.rows[0].expires_at, preview_ends_at: null, previews_used: 7, previews_limit: 7 });
      // Serialize allocations per account, including simultaneous web/APK requests.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['preview:' + user.id]);
        let preview = await client.query('SELECT expires_at FROM free_channel_previews WHERE user_id=$1 AND channel_id=$2', [user.id, channelId]);
        const count = await client.query('SELECT COUNT(*)::int AS used FROM free_channel_previews WHERE user_id=$1', [user.id]);
        const used = count.rows[0].used;
        const claimed = await client.query('SELECT token_hash FROM guest_preview_installations WHERE claimed_user_id=$1',[user.id]);
        const guestChannel = claimed.rowCount ? await client.query('SELECT expires_at FROM guest_channel_previews WHERE token_hash=$1 AND channel_id=$2',[claimed.rows[0].token_hash,channelId]) : {rowCount:0};
        // Claiming a guest session preserves its original three channel deadlines.
        // Those channels are separate from the seven additional signed-in previews.
        if (guestChannel.rowCount) {
          await client.query('COMMIT');
          const expiry = guestChannel.rows[0].expires_at;
          return json(res, 200, { active:false, allowed:new Date(expiry).getTime()>Date.now(), ends_at:null, preview_ends_at:expiry, previews_used:used, previews_limit:7, stage:'claimed_guest' });
        }
        if (!preview.rowCount && used < 7 && !guestChannel.rowCount) {
          preview = await client.query("INSERT INTO free_channel_previews (user_id,channel_id,started_at,expires_at) VALUES ($1,$2,NOW(),NOW()+INTERVAL '15 minutes') ON CONFLICT (user_id,channel_id) DO UPDATE SET channel_id=EXCLUDED.channel_id RETURNING expires_at", [user.id,channelId]);
        }
        await client.query('COMMIT');
        const expiry = preview.rows[0]?.expires_at || null;
        return json(res, 200, { active: false, allowed: Boolean(expiry && new Date(expiry).getTime() > Date.now()), ends_at: null, preview_ends_at: expiry, previews_used: used, previews_limit: 7 });
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    } catch (e) {
      console.error('Viewing access lookup failed:', e.message);
      return json(res, e.status || 503, { error: e.message || 'Viewing access lookup failed' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/v1/subscription') {
    try { const user = await authenticate(req); requireDb(); const row = await activeEntitlement(user.id); return json(res, 200, { active: Boolean(row), plan_code: row?.plan_code || null, starts_at: row?.starts_at || null, ends_at: row?.expires_at || null }); }
    catch (e) { console.error('Subscription lookup failed:', e.message); return json(res, e.status || 503, { error: e.message || 'Subscription lookup failed' }); }
  }
  return json(res, 404, { error: 'Not found' });
}
const server = http.createServer((req, res) => {
  // API responses must not be cached or embedded; TLS terminates at the trusted
  // HTTPS ingress, while backend-to-Pesapal and backend-to-DB verify TLS.
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-TV-Pairing-Secret'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  } else if (origin && !allowedOrigins.has(origin)) return json(res, 403, { error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  route(req, res).catch(error => { console.error('Unhandled payment API error:', error.message); if (!res.headersSent) json(res, 500, { error: 'Internal server error' }); });
});
server.listen(port, '0.0.0.0');
process.on('SIGTERM', async () => { server.close(); await Promise.allSettled([pool?.end(), cataloguePool?.end(), infinityCataloguePool?.end()]); });
