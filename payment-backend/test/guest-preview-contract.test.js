import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('guest enrollment issues a high-entropy bearer token and stores only its SHA-256 hash', async () => {
  const server = await read('../server.js');
  assert.match(server, /randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(server, /createHash\('sha256'\)\.update\(secret\)\.digest\('hex'\)/);
  assert.match(server, /INSERT INTO guest_preview_installations\(token_hash\) VALUES\(\$1\)/);
  assert.match(server, /previews_limit: 3/);
});

test('guest preview API validates bearer format and channel ID before allocation', async () => {
  const server = await read('../server.js');
  assert.match(server, /url\.pathname === '\/v1\/guest\/viewing-access'/);
  assert.match(server, /!\/\^\[A-Za-z0-9_-\]\{43\}\$\//);
  assert.match(server, /if \(!channel \|\| channel\.length > 200\) return json\(res, 400, \{ error: 'Invalid channel' \}\)/);
  assert.match(server, /SELECT claimed_user_id FROM guest_preview_installations WHERE token_hash=\$1 FOR UPDATE/);
});

test('guest allocations are serialized and capped at three distinct channels', async () => {
  const server = await read('../server.js');
  const schema = await read('../schema.sql');
  assert.match(server, /await client\.query\('BEGIN'\)/);
  assert.match(server, /SELECT COUNT\(\*\)::int AS used FROM guest_channel_previews WHERE token_hash=\$1/);
  assert.match(server, /if \(!preview\.rowCount && used < 3\)/);
  assert.match(schema, /PRIMARY KEY\(token_hash,channel_id\)/);
});

test('guest preview expiry is immutable and enforced by server time', async () => {
  const server = await read('../server.js');
  const schema = await read('../schema.sql');
  assert.match(schema, /expires_at TIMESTAMPTZ NOT NULL DEFAULT \(NOW\(\)\+INTERVAL '15 minutes'\)/);
  assert.match(schema, /PRIMARY KEY\(token_hash,channel_id\)/);
  assert.match(schema, /CHECK \(expires_at>started_at\)/);
  assert.match(server, /new Date\(expiry\)\.getTime\(\)>Date\.now\(\)/);
  assert.doesNotMatch(server, /ON CONFLICT \(token_hash,channel_id\) DO UPDATE SET expires_at/);
});

test('guest claim requires authenticated identity and cannot reset an existing account preview', async () => {
  const server = await read('../server.js');
  assert.match(server, /url\.pathname === '\/v1\/guest\/claim'/);
  assert.match(server, /const user = await authenticate\(req\)/);
  assert.match(server, /typeof body\.guest_token !== 'string'/);
  assert.match(server, /Existing account preview cannot be reset/);
  assert.match(server, /guest_preview_installations WHERE claimed_user_id=\$1 AND token_hash<>\$2/);
});

test('signed-in viewing access prioritizes paid entitlement and does not restore free previews after paid expiry', async () => {
  const server = await read('../server.js');
  const start = server.indexOf("url.pathname === '/v1/viewing-access'");
  const end = server.indexOf("url.pathname === '/v1/subscription'", start);
  const route = server.slice(start, end);
  assert.ok(start >= 0 && end > start, 'signed-in viewing route exists');
  assert.ok(route.indexOf('activeEntitlement(user.id)') < route.indexOf('SELECT expires_at FROM subscriptions WHERE user_id=$1 LIMIT 1'));
  assert.match(route, /if \(prior\.rowCount\) return json\(res, 200, \{ active: false, allowed: false, expired: true/);
});

test('catalogue publication remains fail-closed and only approved, healthy HTTPS streams are selected', async () => {
  const server = await read('../server.js');
  const start = server.indexOf("url.pathname === '/v1/catalogue'");
  const end = server.indexOf("url.pathname === '/health'", start);
  const route = server.slice(start, end);
  assert.ok(start >= 0 && end > start, 'catalogue route exists');
  assert.match(route, /if \(!cataloguePool\) return json\(res, 503/);
  assert.match(route, /s\.enabled=TRUE AND s\.publication_approved=TRUE/);
  assert.match(route, /t\.rights_status='approved' AND t\.health_status='healthy'/);
  assert.match(route, /t\.stream_url LIKE 'https:\/\/%'/);
});

test('guest-only guard suite leaves payment plans, checkout, IPN, and TV pairing files untouched', async () => {
  const packageJson = JSON.parse(await read('../package.json'));
  assert.equal(packageJson.scripts.test, 'node --test');
  const plans = await read('../plans.js');
  const schema = await read('../schema.sql');
  assert.match(plans, /half_day/);
  assert.match(plans, /day/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS pesapal_ipn_events/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS tv_pairings/);
});


test('catalogue pagination rejects malformed values before database query', async () => {
  const server = await read('../server.js');
  const start = server.indexOf("url.pathname === '/v1/catalogue'");
  const end = server.indexOf("url.pathname === '/health'", start);
  const route = server.slice(start, end);
  assert.ok(start >= 0 && end > start, 'catalogue route exists');
  assert.match(route, /!\/^\\d\+\$\/.test\(rawLimit\)/);
  assert.match(route, /!\/^\\d\+\$\/.test\(rawCursor\)/);
});
