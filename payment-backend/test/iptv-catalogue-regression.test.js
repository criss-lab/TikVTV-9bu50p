import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontendSource = await readFile(new URL('../../src/lib/iptvApi.ts', import.meta.url), 'utf8');

const hlsStart = frontendSource.indexOf('function browserHls(url: string): boolean {');
const hlsEnd = frontendSource.indexOf('\nconst deadIds', hlsStart);
assert.ok(hlsStart >= 0 && hlsEnd > hlsStart, 'browserHls source function exists');
const browserHlsSource = frontendSource.slice(hlsStart, hlsEnd).replace('function browserHls(url: string): boolean {', 'function browserHls(url) {');
const browserHls = new Function('URL', `return (${browserHlsSource})`)(URL);

test('browser HLS validation accepts normal .m3u and .m3u8 playlist extensions', () => {
  assert.ok(frontendSource.includes(String.raw`/\.m3u8?(?:$|[?#])/i`), 'HLS regex must escape the dot only once');
  assert.ok(!frontendSource.includes(String.raw`/\\.m3u8?(?:$|[?#])/i`), 'double-backslash regex regression must not return');
  assert.equal(browserHls('https://example.test/live.m3u8'), true);
  assert.equal(browserHls('https://example.test/live.m3u'), true);
  assert.equal(browserHls('https://example.test/live.m3u8?token=abc'), true);
  assert.equal(browserHls('http://example.test/live.m3u8'), false);
  assert.equal(browserHls('https://example.test/live'), false);
});

test('catalogue refresh retains last-known-good data after a large unexpected shrink', () => {
  assert.ok(frontendSource.includes('previousCache: CacheData | null = null'));
  assert.ok(frontendSource.includes('previousCache.channels.length >= 1000'));
  assert.ok(frontendSource.includes('freshChannels.length < previousCache.channels.length * 0.65'));
  assert.ok(frontendSource.includes('freshChannels = previousCache.channels'));
  assert.ok(frontendSource.includes('unexpected shrink'));
  assert.ok(frontendSource.includes('previousCache?.channels?.length'));
  assert.ok(frontendSource.includes('Persist the expanded catalogue'));
  assert.ok(frontendSource.includes('parsedChannels.length'));
});

test('cached catalogue shape and timestamp are validated before reuse', () => {
  assert.ok(frontendSource.includes('Array.isArray(cached.channels)'));
  assert.ok(frontendSource.includes('Number.isFinite(cached.timestamp)'));
});
