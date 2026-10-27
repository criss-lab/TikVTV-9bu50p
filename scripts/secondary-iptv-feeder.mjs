// Secondary discovery feeder. Run with Node 20+; never exposes unreviewed streams as paid channels.
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = await readFile('src/lib/iptvApi.ts', 'utf8');
const section = source.split('const EXTRA_SOURCES: Array<[string, string]> = [')[1]?.split('];')[0];
if (!section) throw new Error('Source directory missing');
const sources = [...new Set([...section.matchAll(/\[\s*'[^']+'\s*,\s*'(https:\/\/[^']+\.m3u8?)'\s*\]/g)].map(m => m[1]))];
if (sources.length === 0) throw new Error('No configured source playlists found');
console.log('Configured source playlists:', sources.length);
const out = 'catalogue-discovery'; await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
const seen = new Map(); const health = []; let cursor = 0;
const countryCounts = new Map();
const normalize = value => value.trim();
const MAX_BYTES = 8_000_000;
async function boundedText(res) {
  const reader = res.body?.getReader();
  if (!reader) throw Error('Missing response body');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw Error('Playlist exceeds byte limit');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
}
async function worker() {
  while (cursor < sources.length) {
    const url = sources[cursor++]; const started = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'TikVTV-catalogue-discovery/1.0' } });
      if (!res.ok || Number(res.headers.get('content-length') || 0) > 8_000_000) throw Error('HTTP ' + res.status + ' or oversized');
      const body = await boundedText(res); if (!body.trimStart().startsWith('#EXTM3U') || !body.includes('#EXTINF')) throw Error('Invalid playlist');
      let metadata = '', discovered = 0, added = 0;
      for (const raw of body.split(/\r?\n/)) {
        const line = raw.trim(); if (line.startsWith('#EXTINF')) { metadata = line; continue; }
        if (!line || line.startsWith('#')) continue;
        const uri = URL.canParse(line) ? new URL(line) : null;
        if (!uri || !['http:', 'https:'].includes(uri.protocol) || !uri.hostname || !metadata) { metadata = ''; continue; }
        discovered++;
        const name = metadata.split(',').slice(1).join(',').trim();
        const id = /tvg-id="([^"]+)"/.exec(metadata)?.[1] || '';
        const key = createHash('sha256').update(normalize(uri.href)).digest('hex');
        const country = (/tvg-country="([A-Za-z]{2})"/i.exec(metadata)?.[1] || '').toUpperCase();
        if (!seen.has(key)) {
          seen.set(key, { id, name, url: line, country: country || null, firstSource: url, reviewStatus: 'unreviewed' });
          if (country) countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
          added++;
        }
        metadata = '';
      }
      health.push({ source: url, status: 'ok', discovered, added, ms: Date.now() - started });
    } catch (e) { health.push({ source: url, status: 'failed', reason: String(e).slice(0, 160), ms: Date.now() - started }); }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const records = [...seen.values()]; health.sort((a, b) => a.source.localeCompare(b.source)); const pageSize = 250;
for (let i = 0; i < records.length; i += pageSize) await writeFile(`${out}/page-${String(i / pageSize).padStart(5, '0')}.json`, JSON.stringify(records.slice(i, i + pageSize)));
await writeFile(`${out}/manifest.json`, JSON.stringify({ generatedAt: new Date().toISOString(), sourceCount: sources.length, scanned: health.length, healthySources: health.filter(x => x.status === 'ok').length, uniqueStreamCandidates: records.length, pageSize, pages: Math.ceil(records.length / pageSize), disclaimer: 'Discovery candidates only. Not validated playable, licensed, or approved for subscription distribution.' }, null, 2));
await writeFile(`${out}/source-health.json`, JSON.stringify(health, null, 2));
await writeFile(`${out}/country-coverage.json`, JSON.stringify(Object.fromEntries([...countryCounts].sort(([a], [b]) => a.localeCompare(b))), null, 2));
console.log('Secondary feeder:', sources.length, 'sources,', records.length, 'unique candidate stream URLs');
