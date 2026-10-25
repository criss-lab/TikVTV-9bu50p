import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontendSource = await readFile(new URL('../../src/lib/iptvApi.ts', import.meta.url), 'utf8');

test('browser HLS validation accepts normal .m3u and .m3u8 playlist extensions', () => {
  assert.ok(frontendSource.includes('/\\.m3u8?(?:$|[?#])/i'), 'HLS regex must escape the dot only once');
  assert.ok(!frontendSource.includes('/\\\\.m3u8?(?:$|[?#])/i'), 'double-backslash regex regression must not return');
});

test('catalogue refresh retains last-known-good data after a large unexpected shrink', () => {
  assert.match(frontendSource, /previousCache: CacheData \\| null = null/);
  assert.match(frontendSource, /previousCache\\.channels\\.length >= 1000/);
  assert.match(frontendSource, /freshChannels\\.length < previousCache\\.channels\\.length \\* 0\\.65/);
  assert.match(frontendSource, /freshChannels = previousCache\\.channels/);
  assert.match(frontendSource, /unexpected shrink/);
});

test('cached catalogue shape and timestamp are validated before reuse', () => {
  assert.match(frontendSource, /Array\\.isArray\\(cached\\.channels\\)/);
  assert.match(frontendSource, /Number\\.isFinite\\(cached\\.timestamp\\)/);
});
