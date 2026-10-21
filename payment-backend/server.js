import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import { plans } from './plans.js';

const { Pool } = pg;
const port = Number(process.env.PORT || 10000);
const live = process.env.PESAPAL_ENVIRONMENT === 'live';
const base = live ? 'https://pay.pesapal.com/v3' : 'https://cybqa.pesapal.com/pesapalv3';
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 }) : null;
const allowedOrigins = new Set((process.env.CORS_ORIGINS || 'https://streamora.co.ke,https://www.streamora.co.ke').split(',').map(x => x.trim()).filter(Boolean));
const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }); res.end(JSON.stringify(data)); };
const configured = () => Boolean(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET && process.env.PESAPAL_IPN_ID);
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
    if (!result.order_tracking_id || !result.redirect_url || !['pay.pesapal.com', 'cybqa.pesapal.com'].includes(new URL(result.redirect_url).hostname) || new URL(result.redirect_url).protocol !== 'https:') throw new Error('Pesapal did not return a valid secure checkout order');
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
  const verified = await pesapal('/api/Transactions/GetTransactionStatus?orderTrackingId=' + encodeURIComponent(order.order_tracking_id));
  const status = String(verified.payment_status_description || '').toLowerCase();
  const amount = Number(verified.amount); const currency = String(verified.currency || '').toUpperCase();
  const complete = status === 'completed' && amount === Number(order.amount_kes) && currency === 'KES' && (!verified.merchant_reference || String(verified.merchant_reference) === order.merchant_reference);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO pesapal_ipn_events (notification_id,order_tracking_id,merchant_reference,verification_status,payload) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (notification_id,order_tracking_id) DO NOTHING', [process.env.PESAPAL_IPN_ID || 'status-poll', order.order_tracking_id, order.merchant_reference, status || 'unknown', JSON.stringify({ status: verified.payment_status_description, amount: verified.amount, currency: verified.currency, confirmation_code: verified.confirmation_code || null })]);
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
async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok', service: 'tikvtv-payment-backend', database_configured: Boolean(pool), auth_validation_configured: authConfigured(), pesapal_credentials_present: configured(), environment: live ? 'live' : 'sandbox' });
  if (req.method === 'GET' && url.pathname === '/pesapal/readiness') {
    if (!pool || !configured() || !authConfigured()) return json(res, 503, { ready: false, reason: !pool ? 'database_missing' : !configured() ? 'pesapal_configuration_missing' : 'account_validation_configuration_missing' });
    try {
      await pool.query('SELECT 1');
      const schema = await pool.query(`
        SELECT
          to_regclass('public.payment_orders') IS NOT NULL AS payment_orders,
          to_regclass('public.subscriptions') IS NOT NULL AS subscriptions,
          to_regclass('public.pesapal_ipn_events') IS NOT NULL AS pesapal_ipn_events,
          to_regclass('public.free_preview_sessions') IS NOT NULL AS free_preview_sessions
      `);
      if (!schema.rows[0]?.payment_orders || !schema.rows[0]?.subscriptions || !schema.rows[0]?.pesapal_ipn_events || !schema.rows[0]?.free_preview_sessions) {
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
  if (req.method === 'GET' && url.pathname === '/v1/viewing-access') {
    try {
      const user = await authenticate(req);
      requireDb();
      // Insert-once: channel changes, app reinstalls, and second devices cannot reset the timer.
      await pool.query(
        "INSERT INTO free_preview_sessions (user_id, started_at, expires_at) VALUES ($1, NOW(), NOW() + INTERVAL '15 minutes') ON CONFLICT (user_id) DO NOTHING",
        [user.id],
      );
      const result = await pool.query(
        "SELECT p.expires_at AS preview_ends_at, s.expires_at AS subscription_ends_at, (s.user_id IS NOT NULL) AS active FROM free_preview_sessions p LEFT JOIN subscriptions s ON s.user_id = p.user_id AND s.expires_at > NOW() WHERE p.user_id = $1",
        [user.id],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Could not initialize preview access');
      const active = row.active === true;
      const previewEndsAt = row.preview_ends_at;
      const allowed = active || new Date(previewEndsAt).getTime() > Date.now();
      return json(res, 200, { active, ends_at: row.subscription_ends_at || null, preview_ends_at: previewEndsAt, allowed });
    } catch (e) {
      console.error('Viewing access lookup failed:', e.message);
      return json(res, e.status || 503, { error: e.message || 'Viewing access lookup failed' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/v1/subscription') {
    try { const user = await authenticate(req); requireDb(); const result = await pool.query('SELECT plan_code,starts_at,expires_at FROM subscriptions WHERE user_id=$1 AND expires_at>NOW()', [user.id]); const row = result.rows[0]; return json(res, 200, { active: Boolean(row), plan_code: row?.plan_code || null, starts_at: row?.starts_at || null, ends_at: row?.expires_at || null }); }
    catch (e) { console.error('Subscription lookup failed:', e.message); return json(res, e.status || 503, { error: e.message || 'Subscription lookup failed' }); }
  }
  return json(res, 404, { error: 'Not found' });
}
const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  } else if (origin && !allowedOrigins.has(origin)) return json(res, 403, { error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  route(req, res).catch(error => { console.error('Unhandled payment API error:', error.message); if (!res.headersSent) json(res, 500, { error: 'Internal server error' }); });
});
server.listen(port, '0.0.0.0');
process.on('SIGTERM', async () => { server.close(); if (pool) await pool.end(); });
