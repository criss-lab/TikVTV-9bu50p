import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontendSource = await readFile(new URL('../../src/lib/iptvApi.ts', import.meta.url), 'utf8');

test('browser HLS validation accepts normal .m3u and .m3u8 playlist extensions', () => {
  assert.ok(
    frontendSource.includes(String.raw`/\.m3u8?(?:$|[?#])/i`),
    'HLS extension regex must escape the dot, not match a literal backslash',
  );
  assert.ok(
    !frontendSource.includes(String.raw`/\\.m3u8?(?:$|[?#])/i`),
    'the double-backslash regex regression must not return',
  );
});

test('catalogue refresh retains last-known-good data after a large unexpected shrink', () => {
  assert.match(frontendSource, /previousCache: CacheData \| null = null/);
  assert.match(frontendSource, /previousCache\.channels\.length >= 1000/);
  assert.match(frontendSource, /all\.length < previousCache\.channels\.length \* 0\.65/);
  assert.match(frontendSource, /all = previousCache\.channels/);
  assert.match(frontendSource, /unexpected shrink/);
});

test('cache refresh validates cached data shape and refresh timestamp', () => {
  assert.match(frontendSource, /Array\.isArray\(data\.channels\)/);
  assert.match(frontendSource, /Number\.isFinite\(data\.timestamp\)/);
});
