import test from 'node:test';
import assert from 'node:assert/strict';
import { createSegmentCache } from './segment-cache.mjs';

const channel = { id: 'approved', redistributionApproved: true, cacheApproved: true };
const origin = 'https://licensed.example';
const args = viewer => ({ url: origin + '/live/segment01.ts', viewer: { id: viewer },
  channel, scope: 'approved-public-rendition', approvedOrigins: [origin],
  authorize: async () => true });
const segment = () => new Response(new Uint8Array(1024), {
  headers: { 'content-type': 'video/mp2t' } });

test('10000 concurrent viewers of one authorized segment use a single origin fetch', async () => {
  let originRequests = 0;
  const cache = createSegmentCache({ fetchImpl: async () => {
    originRequests++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return segment();
  } });
  const results = await Promise.all(Array.from({ length: 10000 },
    (_, index) => cache.get(args(String(index)))));
  assert.equal(originRequests, 1);
  assert.equal(results.length, 10000);
  assert.equal(cache.stats().misses, 1);
  assert.equal(cache.stats().coalesced + cache.stats().hits, 9999);
  assert.ok(results.every(result => result.body.length === 1024));
});
test('an unauthorized viewer cannot read a warmed shared segment', async () => {
  let originRequests = 0;
  const cache = createSegmentCache({ fetchImpl: async () => { originRequests++; return segment(); } });
  await cache.get(args('authorized'));
  await assert.rejects(cache.get({ ...args('blocked'), authorize: async () => false }), /Access denied/);
  assert.equal(originRequests, 1);
  assert.equal(cache.stats().hits, 0);
});
test('different trusted scopes cannot share a cached segment', async () => {
  let originRequests = 0;
  const cache = createSegmentCache({ fetchImpl: async () => { originRequests++; return segment(); } });
  await cache.get(args('one'));
  await cache.get({ ...args('two'), scope: 'different-rights-scope' });
  assert.equal(originRequests, 2);
});
