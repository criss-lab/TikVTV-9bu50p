import { createHash } from 'node:crypto';

// Opt-in cache core only. No route is mounted and existing Flutter players remain unchanged.
// The caller must verify the viewer's entitlement AND documented redistribution rights.
export function createSegmentCache({ fetchImpl = fetch, maxBytes = 32 * 1024 * 1024,
  maxEntries = 128, ttlMs = 12000, maxSegmentBytes = 4 * 1024 * 1024,
  now = Date.now } = {}) {
  const entries = new Map();
  const inflight = new Map();
  let bytes = 0;
  const metrics = { hits: 0, misses: 0, coalesced: 0, evictions: 0 };
  function remove(key) {
    const old = entries.get(key);
    if (old) { bytes -= old.body.length; entries.delete(key); metrics.evictions++; }
  }
  function put(key, value) {
    if (value.body.length > maxBytes) return;
    remove(key);
    while (entries.size >= maxEntries || bytes + value.body.length > maxBytes) {
      remove(entries.keys().next().value);
    }
    entries.set(key, value);
    bytes += value.body.length;
  }
  async function get({ url, viewer, channel, authorize, approvedOrigins, scope }) {
    // Fail closed; this cache must never authorize access by itself.
    if (!viewer || !channel || typeof authorize !== 'function' ||
        !await authorize({ viewer, channel })) throw new Error('Access denied');
    if (channel.redistributionApproved !== true || channel.cacheApproved !== true) {
      throw new Error('Channel is not approved for redistribution and caching');
    }
    if (typeof scope !== 'string' || !scope.trim()) throw new Error('Trusted cache scope required');
    const uri = new URL(url);
    if (uri.protocol !== 'https:' || uri.username || uri.password || uri.port || uri.search || uri.hash ||
        !Array.isArray(approvedOrigins) || !approvedOrigins.includes(uri.origin) ||
        !/^\/[\w./%-]+\.(?:ts|m4s|mp4|aac)$/i.test(uri.pathname) ||
        uri.pathname.includes('..')) throw new Error('Unapproved segment URL');
    // Scope is assigned by the trusted caller, never taken from an HTTP request parameter.
    const key = createHash('sha256').update(JSON.stringify([channel.id, scope, uri.href])).digest('hex');
    const existing = entries.get(key);
    if (existing && existing.expires > now()) {
      entries.delete(key); entries.set(key, existing);
      metrics.hits++;
      return { body: Buffer.from(existing.body), contentType: existing.contentType, cache: 'HIT' };
    }
    if (existing) remove(key);
    if (inflight.has(key)) {
      metrics.coalesced++;
      const value = await inflight.get(key);
      return { body: Buffer.from(value.body), contentType: value.contentType, cache: 'COALESCED' };
    }
    metrics.misses++;
    const work = (async () => {
      const response = await fetchImpl(uri, { redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { accept: 'video/*,audio/*,application/octet-stream' } });
      if (!response.ok || ![200].includes(response.status)) throw new Error('Origin segment failed');
      const policy = (response.headers.get('cache-control') || '').toLowerCase();
      if (/no-store|private|no-cache/.test(policy) || response.headers.has('set-cookie')) throw new Error('Origin forbids shared caching');
      const declared = Number(response.headers.get('content-length'));
      if (declared > maxSegmentBytes) throw new Error('Segment too large');
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['video/mp2t', 'video/mp4', 'audio/mp4', 'audio/aac', 'application/octet-stream'].includes(contentType))
        throw new Error('Unexpected segment content type');
      if (!response.body) throw new Error('Empty segment response');
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxSegmentBytes) throw new Error('Segment too large');
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (!size) throw new Error('Empty segment response');
      const value = { body: Buffer.concat(chunks), contentType, expires: now() + ttlMs };
      put(key, value);
      return value;
    })();
    inflight.set(key, work);
    try {
      const value = await work;
      return { body: Buffer.from(value.body), contentType: value.contentType, cache: 'MISS' };
    } finally { inflight.delete(key); }
  }
  return { get, stats: () => ({ ...metrics, entries: entries.size, bytes }) };
}
