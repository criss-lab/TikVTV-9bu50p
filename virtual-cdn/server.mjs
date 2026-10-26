import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';

// Opt-in pilot only. Never expose a general-purpose URL proxy.
// CHANNELS_JSON: {"demo":{"url":"https://licensed.example/live/index.m3u8","redistributionApproved":true}}
const channels = JSON.parse(process.env.CHANNELS_JSON || '{}');
const token = process.env.CACHE_ACCESS_TOKEN || '';
if (!token || token.length < 32) throw new Error('CACHE_ACCESS_TOKEN must be at least 32 characters');
const maxBytes = Number(process.env.CACHE_MAX_BYTES || 64 * 1024 * 1024);
const maxObject = Number(process.env.CACHE_MAX_OBJECT_BYTES || 4 * 1024 * 1024);
const cache = new Map();
const pending = new Map();
const assets = new Map();
let used = 0;
const stats = { hits: 0, misses: 0, coalesced: 0, upstreamBytes: 0 };
const digest = value => createHash('sha256').update(value).digest('hex');
const authorized = req => {
  const supplied = req.headers.authorization || '';
  const expected = 'Bearer ' + token;
  return supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
};
function store(key, bytes, type, ttl) {
  if (bytes.length > maxObject || bytes.length > maxBytes) return;
  const old = cache.get(key);
  if (old) used -= old.bytes.length;
  cache.delete(key);
  while (used + bytes.length > maxBytes && cache.size) {
    const first = cache.keys().next().value;
    used -= cache.get(first).bytes.length;
    cache.delete(first);
  }
  cache.set(key, { bytes, type, expires: Date.now() + ttl });
  used += bytes.length;
}
async function fetchOnce(key, url, ttl, playlist = false) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    stats.hits++;
    cache.delete(key); cache.set(key, hit);
    return hit;
  }
  if (pending.has(key)) { stats.coalesced++; return pending.get(key); }
  stats.misses++;
  const work = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: 'error',
        headers: { 'accept-encoding': 'identity' } });
      if (!response.ok) throw new Error('Origin status ' + response.status);
      const size = Number(response.headers.get('content-length') || 0);
      if (size > maxObject) throw new Error('Origin object too large');
      const chunks = []; let total = 0;
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > maxObject) { await response.body.cancel().catch(() => {}); throw new Error('Object limit exceeded'); }
        chunks.push(chunk);
      }
      stats.upstreamBytes += total;
      const bytes = Buffer.concat(chunks);
      const type = playlist ? 'application/vnd.apple.mpegurl' :
        (response.headers.get('content-type') || 'application/octet-stream');
      store(key, bytes, type, ttl);
      return { bytes, type };
    } finally { clearTimeout(timeout); }
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}
function rewrite(manifest, base, channel) {
  return manifest.split(/(\r?\n)/).map(line => {
    if (!line.trim()) return line;
    const register = raw => {
      const url = new URL(raw, base);
      if (url.protocol !== 'https:' || url.origin !== new URL(base).origin ||
          url.username || url.password) throw new Error('Cross-origin or unsafe HLS asset');
      const id = digest(channel + ':' + url.href);
      assets.set(channel + ':' + id, { url: url.href, expires: Date.now() + 120000 });
      return '/hls/' + encodeURIComponent(channel) + '/asset/' + id;
    };
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, uri) => 'URI="' + register(uri) + '"');
    return register(line.trim());
  }).join('');
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorized(req)) { res.writeHead(401); res.end(); return; }
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  const match = /^\/hls\/([a-zA-Z0-9_-]{1,64})\/(index|asset\/([a-f0-9]{64}))$/.exec(new URL(req.url, 'http://localhost').pathname);
  if (!match) { res.writeHead(404); res.end(); return; }
  const channel = match[1], config = channels[channel];
  if (!config?.redistributionApproved || !config.url) { res.writeHead(403); res.end(); return; }
  try {
    const root = new URL(config.url);
    if (root.protocol !== 'https:' || root.username || root.password ||
        !Array.isArray(config.allowedHosts) || !config.allowedHosts.includes(root.hostname)) throw new Error('Origin not explicitly allowlisted');
    let url = root.href;
    if (match[3]) {
      const entry = assets.get(channel + ':' + match[3]);
      if (!entry || entry.expires < Date.now()) { res.writeHead(404); res.end(); return; }
      url = entry.url;
    }
    const key = digest(channel + ':' + url);
    const isPlaylist = match[2] === 'index' || new URL(url).pathname.endsWith('.m3u8');
    const result = await fetchOnce(key, url, isPlaylist ? 2000 : 30000, isPlaylist);
    const bytes = isPlaylist ? Buffer.from(rewrite(result.bytes.toString('utf8'), url, channel)) : result.bytes;
    res.writeHead(200, { 'Content-Type': result.type, 'Content-Length': bytes.length,
      'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': 'none' });
    res.end(bytes);
  } catch (e) { console.error('Cache request failed:', e.message); res.writeHead(502); res.end(); }
});
server.listen(Number(process.env.PORT || 8090), '0.0.0.0', () => console.log('Opt-in HLS cache listening'));
export { rewrite, server, stats };
