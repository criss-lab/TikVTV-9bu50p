import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

async function freePort() {
  const s = createServer();
  s.listen(0, '127.0.0.1'); await once(s, 'listening');
  const port = s.address().port; await new Promise(resolve => s.close(resolve));
  return port;
}
test('standalone virtual gateway denies unauthenticated and unapproved channel requests', async t => {
  const port = await freePort();
  const secret = 'standalone-test-secret-that-is-at-least-32-characters';
  const child = spawn(process.execPath, ['virtual-cdn/server.mjs'], {
    env: { ...process.env, PORT: String(port), CACHE_ACCESS_TOKEN: secret,
      CHANNELS_JSON: JSON.stringify({ demo: { url: 'https://licensed.example/live/index.m3u8',
        redistributionApproved: false, allowedHosts: ['licensed.example'] } }) },
    stdio: 'ignore'
  });
  t.after(() => { child.kill(); });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) break;
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/hls/demo/index');
      if (r.status === 401) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(ready, true, 'gateway starts and requires authentication');
  const url = 'http://127.0.0.1:' + port;
  const headers = { Authorization: 'Bearer ' + secret };
  assert.equal((await fetch(url + '/hls/demo/index')).status, 401);
  assert.equal((await fetch(url + '/hls/demo/index', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await fetch(url + '/hls/demo/index', { headers })).status, 403);
  assert.equal((await fetch(url + '/hls/unknown/index', { headers })).status, 403);
  assert.equal((await fetch(url + '/hls/demo/asset/' + 'a'.repeat(64), { headers })).status, 403);
  assert.equal((await fetch(url + '/not-a-route', { headers })).status, 404);
  assert.equal((await fetch(url + '/hls/demo/index', { method: 'POST', headers })).status, 405);
});
test('gateway fails closed on invalid memory configuration', async () => {
  const child = spawn(process.execPath, ['virtual-cdn/server.mjs'], {
    env: { ...process.env, CACHE_ACCESS_TOKEN: 'long-enough-test-secret-1234567890123',
      CACHE_MAX_BYTES: '0', PORT: '0' }, stdio: 'ignore'
  });
  const [code] = await once(child, 'exit');
  assert.notEqual(code, 0);
});
