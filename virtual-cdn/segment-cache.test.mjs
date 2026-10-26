import test from 'node:test';
import assert from 'node:assert/strict';
import { createSegmentCache } from './segment-cache.mjs';

const channel = { id: 'licensed-demo', redistributionApproved: true, cacheApproved: true };
const args = { viewer: { id: 'viewer' }, channel, authorize: async () => true,
  approvedOrigins: ['https://licensed.example'], scope: 'licensed-demo-public-segments', url: 'https://licensed.example/live/part01.ts' };
const response = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'video/mp2t' } });

test('concurrent viewers coalesce identical authorized segments and return independent buffers', async () => {
  let calls = 0;
  const cache = createSegmentCache({ fetchImpl: async () => { calls++; await new Promise(r => setTimeout(r, 10)); return response(); } });
  const [a, b] = await Promise.all([cache.get(args), cache.get(args)]);
  assert.equal(calls, 1);
  assert.deepEqual(new Set([a.cache, b.cache]), new Set(['MISS', 'COALESCED']));
  a.body[0] = 99;
  assert.equal(b.body[0], 1);
  assert.equal((await cache.get(args)).cache, 'HIT');
  assert.equal(cache.stats().coalesced, 1);
});
test('rejects unauthorized viewers and unapproved channels before fetching', async () => {
  let calls = 0;
  const cache = createSegmentCache({ fetchImpl: async () => { calls++; return response(); } });
  await assert.rejects(cache.get({ ...args, authorize: async () => false }), /Access denied/);
  await assert.rejects(cache.get({ ...args, channel: { ...channel, cacheApproved: false } }), /not approved/);
  assert.equal(calls, 0);
});
test('rejects other origins, redirects, oversized responses and bad types', async () => {
  const cache = createSegmentCache({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example' } }) });
  await assert.rejects(cache.get({ ...args, url: 'https://elsewhere.example/x.ts' }), /Unapproved/);
  await assert.rejects(cache.get(args), /Origin segment failed/);
  const big = createSegmentCache({ maxSegmentBytes: 2, fetchImpl: async () => response() });
  await assert.rejects(big.get(args), /too large/);
  const html = createSegmentCache({ fetchImpl: async () => new Response('oops', { headers: { 'content-type': 'text/html' } }) });
  await assert.rejects(html.get(args), /content type/);
});
test('expired segments are fetched again', async () => {
  let clock = 1000, calls = 0;
  const cache = createSegmentCache({ ttlMs: 100, now: () => clock, fetchImpl: async () => { calls++; return response(); } });
  await cache.get(args); clock += 101; await cache.get(args);
  assert.equal(calls, 2);
});

test('requires explicit trusted scope and rejects tokenized URLs', async () => {
  const cache = createSegmentCache({ fetchImpl: async () => response() });
  await assert.rejects(cache.get({ ...args, scope: undefined }), /scope required/);
  await assert.rejects(cache.get({ ...args, url: args.url + '?token=private' }), /Unapproved/);
});
test('honors origin no-store and rejects empty segments', async () => {
  const cache = createSegmentCache({ fetchImpl: async () => new Response('x', {
    headers: { 'content-type': 'video/mp2t', 'cache-control': 'no-store' } }) });
  await assert.rejects(cache.get(args), /forbids shared caching/);
  const empty = createSegmentCache({ fetchImpl: async () => new Response(null, {
    headers: { 'content-type': 'video/mp2t' } }) });
  await assert.rejects(empty.get(args), /Empty segment/);
});
