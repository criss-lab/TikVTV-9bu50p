/** Playback-derived health: a successful HTTP playlist alone does not prove a channel plays. */
type Health = { status: 'online' | 'offline'; checkedAt: number; failures: number };
const KEY = 'tikvtvz:stream-health:v1';
const GOOD_TTL = 30 * 60_000;
const BAD_TTL = 10 * 60_000;
let records: Record<string, Health> = {};
try { records = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { records = {}; }
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(records)); } catch { /* private mode */ }
}
export function streamHealth(id: string): 'online' | 'offline' | 'unknown' {
  const h = records[id];
  if (!h || Date.now() - h.checkedAt > (h.status === 'online' ? GOOD_TTL : BAD_TTL)) return 'unknown';
  return h.status;
}
export function reportStreamHealth(id: string, success: boolean) {
  const previous = records[id];
  records[id] = { status: success ? 'online' : 'offline', checkedAt: Date.now(), failures: success ? 0 : (previous?.failures || 0) + 1 };
  persist();
  window.dispatchEvent(new CustomEvent('tikvtvz:stream-health', { detail: { id, status: records[id].status } }));
}
export function prioritizeStreams<T extends { id: string }>(channels: T[]): T[] {
  const score = (id: string) => ({ online: 0, unknown: 1, offline: 2 })[streamHealth(id)];
  return channels.map((channel, index) => ({ channel, index, rank: score(channel.id) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index).map(entry => entry.channel);
}
