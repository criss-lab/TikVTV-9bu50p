import type { IPTVChannel, ChannelPage } from '@/types';
import { PAGE_SIZE } from '@/constants/categories';

// ── Primary JSON API ──────────────────────────────────────────────────────────
const CHANNELS_API = 'https://iptv-org.github.io/api/channels.json';
const STREAMS_API  = 'https://iptv-org.github.io/api/streams.json';

// ── All iptv-org M3U sources — categories, regions, languages, countries ──────
const EXTRA_SOURCES: Array<[string, string]> = [
  // Free-TV curated
  ['freetv',       'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8'],
  // Categories
  ['news',         'https://iptv-org.github.io/iptv/categories/news.m3u'],
  ['sports',       'https://iptv-org.github.io/iptv/categories/sports.m3u'],
  ['music',        'https://iptv-org.github.io/iptv/categories/music.m3u'],
  ['entertainment','https://iptv-org.github.io/iptv/categories/entertainment.m3u'],
  ['kids',         'https://iptv-org.github.io/iptv/categories/kids.m3u'],
  ['documentary',  'https://iptv-org.github.io/iptv/categories/documentary.m3u'],
  ['religious',    'https://iptv-org.github.io/iptv/categories/religious.m3u'],
  ['general',      'https://iptv-org.github.io/iptv/categories/general.m3u'],
  ['lifestyle',    'https://iptv-org.github.io/iptv/categories/lifestyle.m3u'],
  ['business',     'https://iptv-org.github.io/iptv/categories/business.m3u'],
  ['science',      'https://iptv-org.github.io/iptv/categories/science.m3u'],
  ['movies',       'https://iptv-org.github.io/iptv/categories/movies.m3u'],
  ['series',       'https://iptv-org.github.io/iptv/categories/series.m3u'],
  ['animation',    'https://iptv-org.github.io/iptv/categories/animation.m3u'],
  ['cooking',      'https://iptv-org.github.io/iptv/categories/cooking.m3u'],
  ['travel',       'https://iptv-org.github.io/iptv/categories/travel.m3u'],
  ['weather',      'https://iptv-org.github.io/iptv/categories/weather.m3u'],
  ['shop',         'https://iptv-org.github.io/iptv/categories/shop.m3u'],
  ['auto',         'https://iptv-org.github.io/iptv/categories/auto.m3u'],
  // Regions
  ['afr',          'https://iptv-org.github.io/iptv/regions/afr.m3u'],
  ['eur',          'https://iptv-org.github.io/iptv/regions/eur.m3u'],
  ['ame',          'https://iptv-org.github.io/iptv/regions/ame.m3u'],
  ['apa',          'https://iptv-org.github.io/iptv/regions/apa.m3u'],
  ['ara',          'https://iptv-org.github.io/iptv/regions/ara.m3u'],
  ['asia',         'https://iptv-org.github.io/iptv/regions/asia.m3u'],
  ['mea',          'https://iptv-org.github.io/iptv/regions/mea.m3u'],
  ['oce',          'https://iptv-org.github.io/iptv/regions/oce.m3u'],
  ['cis',          'https://iptv-org.github.io/iptv/regions/cis.m3u'],
  ['nafrica',      'https://iptv-org.github.io/iptv/regions/nafrica.m3u'],
  ['eafrica',      'https://iptv-org.github.io/iptv/regions/eafrica.m3u'],
  ['wafrica',      'https://iptv-org.github.io/iptv/regions/wafrica.m3u'],
  ['safrica',      'https://iptv-org.github.io/iptv/regions/safrica.m3u'],
  ['cafrica',      'https://iptv-org.github.io/iptv/regions/cafrica.m3u'],
  ['sasia',        'https://iptv-org.github.io/iptv/regions/sasia.m3u'],
  ['seasia',       'https://iptv-org.github.io/iptv/regions/seast_asia.m3u'],
  ['easia',        'https://iptv-org.github.io/iptv/regions/east_asia.m3u'],
  ['casia',        'https://iptv-org.github.io/iptv/regions/casia.m3u'],
  ['weur',         'https://iptv-org.github.io/iptv/regions/west_eur.m3u'],
  ['neur',         'https://iptv-org.github.io/iptv/regions/north_eur.m3u'],
  ['seur',         'https://iptv-org.github.io/iptv/regions/south_eur.m3u'],
  ['eeur',         'https://iptv-org.github.io/iptv/regions/east_eur.m3u'],
  ['samer',        'https://iptv-org.github.io/iptv/regions/samer.m3u'],
  ['namer',        'https://iptv-org.github.io/iptv/regions/namer.m3u'],
  ['camer',        'https://iptv-org.github.io/iptv/regions/camer.m3u'],
  ['carib',        'https://iptv-org.github.io/iptv/regions/carib.m3u'],
  ['arab',         'https://iptv-org.github.io/iptv/regions/arab.m3u'],
  // Languages
  ['ara',          'https://iptv-org.github.io/iptv/languages/ara.m3u'],
  ['fra',          'https://iptv-org.github.io/iptv/languages/fra.m3u'],
  ['spa',          'https://iptv-org.github.io/iptv/languages/spa.m3u'],
  ['por',          'https://iptv-org.github.io/iptv/languages/por.m3u'],
  ['rus',          'https://iptv-org.github.io/iptv/languages/rus.m3u'],
  ['hin',          'https://iptv-org.github.io/iptv/languages/hin.m3u'],
  ['zho',          'https://iptv-org.github.io/iptv/languages/zho.m3u'],
  ['deu',          'https://iptv-org.github.io/iptv/languages/deu.m3u'],
  ['tur',          'https://iptv-org.github.io/iptv/languages/tur.m3u'],
  ['ita',          'https://iptv-org.github.io/iptv/languages/ita.m3u'],
  ['ind',          'https://iptv-org.github.io/iptv/languages/ind.m3u'],
  ['fas',          'https://iptv-org.github.io/iptv/languages/fas.m3u'],
  ['pol',          'https://iptv-org.github.io/iptv/languages/pol.m3u'],
  ['nld',          'https://iptv-org.github.io/iptv/languages/nld.m3u'],
  ['ell',          'https://iptv-org.github.io/iptv/languages/ell.m3u'],
  ['ron',          'https://iptv-org.github.io/iptv/languages/ron.m3u'],
  ['ukr',          'https://iptv-org.github.io/iptv/languages/ukr.m3u'],
  ['vie',          'https://iptv-org.github.io/iptv/languages/vie.m3u'],
  ['tha',          'https://iptv-org.github.io/iptv/languages/tha.m3u'],
  ['kor',          'https://iptv-org.github.io/iptv/languages/kor.m3u'],
  ['jpn',          'https://iptv-org.github.io/iptv/languages/jpn.m3u'],
  ['swa',          'https://iptv-org.github.io/iptv/languages/swa.m3u'],
  ['amh',          'https://iptv-org.github.io/iptv/languages/amh.m3u'],
  ['hau',          'https://iptv-org.github.io/iptv/languages/hau.m3u'],
  ['yor',          'https://iptv-org.github.io/iptv/languages/yor.m3u'],
  ['lin',          'https://iptv-org.github.io/iptv/languages/lin.m3u'],
  ['msa',          'https://iptv-org.github.io/iptv/languages/msa.m3u'],
  ['ben',          'https://iptv-org.github.io/iptv/languages/ben.m3u'],
  // Countries
  ['us',           'https://iptv-org.github.io/iptv/countries/us.m3u'],
  ['gb',           'https://iptv-org.github.io/iptv/countries/gb.m3u'],
  ['fr',           'https://iptv-org.github.io/iptv/countries/fr.m3u'],
  ['de',           'https://iptv-org.github.io/iptv/countries/de.m3u'],
  ['br',           'https://iptv-org.github.io/iptv/countries/br.m3u'],
  ['in',           'https://iptv-org.github.io/iptv/countries/in.m3u'],
  ['tr',           'https://iptv-org.github.io/iptv/countries/tr.m3u'],
  ['ng',           'https://iptv-org.github.io/iptv/countries/ng.m3u'],
  ['za',           'https://iptv-org.github.io/iptv/countries/za.m3u'],
  ['cd',           'https://iptv-org.github.io/iptv/countries/cd.m3u'],
  ['mx',           'https://iptv-org.github.io/iptv/countries/mx.m3u'],
  ['ar',           'https://iptv-org.github.io/iptv/countries/ar.m3u'],
  ['ru',           'https://iptv-org.github.io/iptv/countries/ru.m3u'],
  ['it',           'https://iptv-org.github.io/iptv/countries/it.m3u'],
  ['es',           'https://iptv-org.github.io/iptv/countries/es.m3u'],
  ['pt',           'https://iptv-org.github.io/iptv/countries/pt.m3u'],
  ['cn',           'https://iptv-org.github.io/iptv/countries/cn.m3u'],
  ['jp',           'https://iptv-org.github.io/iptv/countries/jp.m3u'],
  ['kr',           'https://iptv-org.github.io/iptv/countries/kr.m3u'],
  ['id',           'https://iptv-org.github.io/iptv/countries/id.m3u'],
  ['sa',           'https://iptv-org.github.io/iptv/countries/sa.m3u'],
  ['eg',           'https://iptv-org.github.io/iptv/countries/eg.m3u'],
  ['pk',           'https://iptv-org.github.io/iptv/countries/pk.m3u'],
  ['ke',           'https://iptv-org.github.io/iptv/countries/ke.m3u'],
  ['gh',           'https://iptv-org.github.io/iptv/countries/gh.m3u'],
  ['sn',           'https://iptv-org.github.io/iptv/countries/sn.m3u'],
  ['ci',           'https://iptv-org.github.io/iptv/countries/ci.m3u'],
  ['cm',           'https://iptv-org.github.io/iptv/countries/cm.m3u'],
  ['ma',           'https://iptv-org.github.io/iptv/countries/ma.m3u'],
  ['tn',           'https://iptv-org.github.io/iptv/countries/tn.m3u'],
  ['dz',           'https://iptv-org.github.io/iptv/countries/dz.m3u'],
  ['ca',           'https://iptv-org.github.io/iptv/countries/ca.m3u'],
  ['au',           'https://iptv-org.github.io/iptv/countries/au.m3u'],
  ['pl',           'https://iptv-org.github.io/iptv/countries/pl.m3u'],
  ['nl',           'https://iptv-org.github.io/iptv/countries/nl.m3u'],
  ['se',           'https://iptv-org.github.io/iptv/countries/se.m3u'],
  ['no',           'https://iptv-org.github.io/iptv/countries/no.m3u'],
  ['dk',           'https://iptv-org.github.io/iptv/countries/dk.m3u'],
  ['fi',           'https://iptv-org.github.io/iptv/countries/fi.m3u'],
  ['gr',           'https://iptv-org.github.io/iptv/countries/gr.m3u'],
  ['ro',           'https://iptv-org.github.io/iptv/countries/ro.m3u'],
  ['hu',           'https://iptv-org.github.io/iptv/countries/hu.m3u'],
  ['cz',           'https://iptv-org.github.io/iptv/countries/cz.m3u'],
  ['ua',           'https://iptv-org.github.io/iptv/countries/ua.m3u'],
  ['il',           'https://iptv-org.github.io/iptv/countries/il.m3u'],
  ['th',           'https://iptv-org.github.io/iptv/countries/th.m3u'],
  ['vn',           'https://iptv-org.github.io/iptv/countries/vn.m3u'],
  ['my',           'https://iptv-org.github.io/iptv/countries/my.m3u'],
  ['ph',           'https://iptv-org.github.io/iptv/countries/ph.m3u'],
  ['et',           'https://iptv-org.github.io/iptv/countries/et.m3u'],
  ['tz',           'https://iptv-org.github.io/iptv/countries/tz.m3u'],
  ['ug',           'https://iptv-org.github.io/iptv/countries/ug.m3u'],
  ['ao',           'https://iptv-org.github.io/iptv/countries/ao.m3u'],
  ['mz',           'https://iptv-org.github.io/iptv/countries/mz.m3u'],
  ['ve',           'https://iptv-org.github.io/iptv/countries/ve.m3u'],
  ['co',           'https://iptv-org.github.io/iptv/countries/co.m3u'],
  ['cl',           'https://iptv-org.github.io/iptv/countries/cl.m3u'],
  ['pe',           'https://iptv-org.github.io/iptv/countries/pe.m3u'],
];

const CACHE_KEY = 'tikvtv_iptv_v10_browser_hls';
const CACHE_TTL = 60 * 60 * 1000; // Refresh unreliable public streams hourly

interface RawChannel { id: string; name: string; logo: string; country: string; languages: string[]; categories: string[]; is_nsfw: boolean; website?: string; network?: string; alt_names?: string[]; }
interface RawStream  { channel: string; url: string; }
interface CacheData  { channels: IPTVChannel[]; timestamp: number; }

let memCache: IPTVChannel[] | null = null;
// Only send browser-playable HLS playlists to the HLS video player.
function browserHls(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && /\\.m3u8?(?:$|[?#])/i.test(parsed.pathname + parsed.search);
  } catch { return false; }
}
const deadIds = new Set<string>();

export function markChannelDead(id: string) {
  deadIds.add(id);
  if (memCache) memCache = memCache.filter(ch => ch.id !== id);
}
export function isChannelDead(id: string) { return deadIds.has(id); }
export function getChannelById(id: string) { return memCache?.find(ch => ch.id === id); }

export function searchChannels(query: string, category = 'all', countryCode = '', limit = 80): IPTVChannel[] {
  if (!memCache) return [];
  const q = query.toLowerCase().trim();
  return memCache.filter(ch => {
    if (deadIds.has(ch.id)) return false;
    if (category !== 'all' && !ch.categories.some(c => c.toLowerCase() === category)) return false;
    if (countryCode && ch.countryCode.toLowerCase() !== countryCode.toLowerCase()) return false;
    if (!q) return true;
    return ch.name.toLowerCase().includes(q)
      || ch.countryCode.toLowerCase().includes(q)
      || ch.country.toLowerCase().includes(q)
      || ch.categories.some(c => c.toLowerCase().includes(q))
      || (ch.network?.toLowerCase().includes(q) ?? false)
      || (ch.alt_names?.some(a => a.toLowerCase().includes(q)) ?? false);
  }).slice(0, limit);
}

export function getCountries(): { code: string; count: number }[] {
  if (!memCache) return [];
  const map = new Map<string, number>();
  for (const ch of memCache) {
    if (!deadIds.has(ch.id) && ch.countryCode) {
      map.set(ch.countryCode, (map.get(ch.countryCode) || 0) + 1);
    }
  }
  return Array.from(map.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeCategory(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (r.includes('news') || r.includes('actualit') || r.includes('noticias') || r.includes('nouvelles') || r.includes('info')) return 'news';
  if (r.includes('sport') || r.includes('football') || r.includes('soccer') || r.includes('cricket') || r.includes('tennis') || r.includes('basket')) return 'sports';
  if (r.includes('entertain') || r.includes('variety') || r.includes('general') || r.includes('serie') || r.includes('drama') || r.includes('comedy')) return 'entertainment';
  if (r.includes('music') || r.includes('musique') || r.includes('clip') || r.includes('hits')) return 'music';
  if (r.includes('movie') || r.includes('film') || r.includes('cinema') || r.includes('cine')) return 'movies';
  if (r.includes('kid') || r.includes('child') || r.includes('enfant') || r.includes('cartoon') || r.includes('junior') || r.includes('anime')) return 'kids';
  if (r.includes('doc') || r.includes('nature') || r.includes('history') || r.includes('science') || r.includes('discovery') || r.includes('national')) return 'documentary';
  if (r.includes('cook') || r.includes('food') || r.includes('cuisine')) return 'cooking';
  if (r.includes('travel') || r.includes('voyage') || r.includes('tourism')) return 'travel';
  if (r.includes('relig') || r.includes('faith') || r.includes('islam') || r.includes('christian') || r.includes('bible') || r.includes('gospel')) return 'religious';
  if (r.includes('business') || r.includes('finance') || r.includes('economy') || r.includes('bloomberg') || r.includes('cnbc')) return 'business';
  if (r.includes('weather') || r.includes('météo')) return 'weather';
  if (r.includes('lifestyle') || r.includes('fashion') || r.includes('home') || r.includes('health')) return 'lifestyle';
  if (r.includes('shop') || r.includes('shopping') || r.includes('teleshopping')) return 'shopping';
  if (r.includes('auto') || r.includes('motor')) return 'auto';
  if (r.includes('animation') || r.includes('cartoon')) return 'animation';
  return 'general';
}

function genLogoUrl(name: string): string {
  const colors = ['1a1a2e', '16213e', '0f3460', '1b1b2f', '2d1b69', '1a2744'];
  const c = colors[name.charCodeAt(0) % colors.length];
  const initials = encodeURIComponent((name || 'TV').replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 2).toUpperCase() || 'TV');
  return `https://ui-avatars.com/api/?name=${initials}&background=${c}&color=f59e0b&size=128&bold=true&font-size=0.4`;
}

function parseM3U(text: string, sourceTag: string): IPTVChannel[] {
  const lines    = text.split('\n');
  const channels: IPTVChannel[] = [];
  let   idx      = 0;

  while (idx < lines.length) {
    const line = lines[idx].trim();
    if (line.startsWith('#EXTINF:')) {
      const nextLine = (lines[idx + 1] || '').trim();
      if (nextLine && !nextLine.startsWith('#') && browserHls(nextLine)) {
        // Skip YouTube / Twitch
        if (nextLine.includes('youtube.com') || nextLine.includes('twitch.tv') || nextLine.includes('youtu.be')) {
          idx += 2;
          continue;
        }

        const tvgName    = line.match(/tvg-name="([^"]+)"/);
        const logoMatch  = line.match(/tvg-logo="([^"]+)"/);
        const groupMatch = line.match(/group-title="([^"]+)"/);
        const idMatch    = line.match(/tvg-id="([^"]*)"/);
        const countryM   = line.match(/tvg-country="([^"]*)"/);
        const langM      = line.match(/tvg-language="([^"]*)"/);

        // Name: prefer tvg-name, fall back to comma suffix
        const comma   = line.lastIndexOf(',');
        const rawName = comma !== -1
          ? line.slice(comma + 1).replace(/[⓪①②③④⑤⑥⑦⑧⑨🅷🅳ⓢⓣⓨ]/g, '').replace(/\s*\[.*?\]\s*/g, '').trim()
          : '';
        const name = (tvgName?.[1] || rawName || `Channel-${channels.length}`).trim();

        if (!name || name.length < 2) { idx += 2; continue; }

        const rawId  = (idMatch?.[1] || '').trim();
        const cc     = (countryM?.[1] || '').split(';')[0].trim().toUpperCase().slice(0, 2);
        const id     = rawId
          ? rawId.toLowerCase().replace(/\s+/g, '-')
          : `${sourceTag}-${name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 36)}-${channels.length}`;

        const logo = (logoMatch?.[1] || '').startsWith('http') ? logoMatch![1] : genLogoUrl(name);

        channels.push({
          id,
          name,
          logo,
          country:     cc || 'INT',
          countryCode: cc || 'INT',
          languages:   langM?.[1] ? [langM[1].toLowerCase()] : [],
          categories:  [normalizeCategory(groupMatch?.[1] || 'general')],
          streamUrl:   nextLine,
          alt_names:   [],
        });
        idx += 2;
        continue;
      }
    }
    idx++;
  }
  return channels;
}

async function fetchM3U(url: string, tag: string): Promise<IPTVChannel[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.includes('#EXTINF')) return [];
    const parsed = parseM3U(text, tag);
    console.log(`[IPTV] ${tag}: ${parsed.length} channels`);
    return parsed;
  } catch (e) {
    console.warn(`[IPTV] ${tag} failed:`, e);
    return [];
  }
}

async function fetchExtraSources(): Promise<IPTVChannel[]> {
  const all: IPTVChannel[] = [];
  // Fetch in parallel batches of 8
  for (let i = 0; i < EXTRA_SOURCES.length; i += 8) {
    const batch = EXTRA_SOURCES.slice(i, i + 8);
    const results = await Promise.all(batch.map(([tag, url]) => fetchM3U(url, tag)));
    for (const r of results) all.push(...r);
  }
  return all;
}

export async function fetchAllChannels(): Promise<IPTVChannel[]> {
  if (memCache && memCache.length > 0) return memCache;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const data: CacheData = JSON.parse(raw);
      if (Date.now() - data.timestamp < CACHE_TTL && data.channels.length > 100) {
        console.log('[IPTV] Cache hit:', data.channels.length, 'channels');
        memCache = data.channels;
        return memCache;
      }
    }
  } catch {}

  console.log('[IPTV] Fetching everything…');

  try {
    const [chanRes, streamRes, extraChannels] = await Promise.all([
      fetch(CHANNELS_API),
      fetch(STREAMS_API),
      fetchExtraSources(),
    ]);

    if (!chanRes.ok || !streamRes.ok) throw new Error('Primary API error');

    const rawChannels: RawChannel[] = await chanRes.json();
    const rawStreams:  RawStream[]  = await streamRes.json();

    console.log(`[IPTV] Primary: ${rawChannels.length} channels, ${rawStreams.length} streams`);
    console.log(`[IPTV] Extra M3U: ${extraChannels.length} channels`);

    const streamMap = new Map<string, string>();
    for (const s of rawStreams) {
      if (s.channel && s.url && browserHls(s.url) && !streamMap.has(s.channel)) streamMap.set(s.channel, s.url);
    }

    const primary: IPTVChannel[] = rawChannels
      .filter(ch => !ch.is_nsfw && ch.name && streamMap.has(ch.id))
      .map(ch => ({
        id:          ch.id,
        name:        ch.name,
        logo:        ch.logo || genLogoUrl(ch.name),
        country:     ch.country || 'INT',
        countryCode: ch.country || 'INT',
        languages:   ch.languages || [],
        categories:  ch.categories?.length ? ch.categories : ['general'],
        streamUrl:   streamMap.get(ch.id)!,
        alt_names:   ch.alt_names || [],
        website:     ch.website,
        network:     ch.network,
      }));

    const existingIds  = new Set(primary.map(ch => ch.id));
    const existingUrls = new Set(primary.map(ch => ch.streamUrl));
    const deduped = extraChannels.filter(ch =>
      !existingIds.has(ch.id) &&
      !existingUrls.has(ch.streamUrl) &&
      browserHls(ch.streamUrl) && ch.name && ch.name.length > 1
    );

    const all = shuffle([...primary, ...deduped]);
    console.log(`[IPTV] Total: ${all.length} (${primary.length} primary + ${deduped.length} extra)`);

    try {
      const cacheData: CacheData = { channels: all, timestamp: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
      console.warn('[IPTV] Cache write failed:', e);
    }

    memCache = all;
    return memCache;
  } catch (err) {
    console.error('[IPTV] Primary fetch failed, using fallback:', err);
    memCache = getFallbackChannels();
    return memCache;
  }
}

export function getChannelPage(channels: IPTVChannel[], category: string, page: number, countryCode = ''): ChannelPage {
  let filtered = channels.filter(ch => !deadIds.has(ch.id));
  if (category !== 'all') {
    filtered = filtered.filter(ch => ch.categories.some(c => c.toLowerCase() === category.toLowerCase()));
  }
  if (countryCode) {
    filtered = filtered.filter(ch => ch.countryCode.toLowerCase() === countryCode.toLowerCase());
  }
  const start = (page - 1) * PAGE_SIZE;
  return { items: filtered.slice(start, start + PAGE_SIZE), hasMore: start + PAGE_SIZE < filtered.length, total: filtered.length };
}

function getFallbackChannels(): IPTVChannel[] {
  return [
    { id: 'euronews.en', name: 'Euronews English', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Euronews_logo_RGB.svg/200px-Euronews_logo_RGB.svg.png', country: 'FR', countryCode: 'FR', languages: ['en'], categories: ['news'], streamUrl: 'https://euronews-euronews-en-live.1m.wurl.io/playlist.m3u8' },
    { id: 'bloomberg.us', name: 'Bloomberg TV', logo: genLogoUrl('Bloomberg'), country: 'US', countryCode: 'US', languages: ['en'], categories: ['business', 'news'], streamUrl: 'https://bloombergtv.akamaized.net/hls/live/571308/Bloomberg_Embeddable/master.m3u8' },
    { id: 'nhkworld.jp', name: 'NHK World', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/11/NHK_World-Japan.svg/200px-NHK_World-Japan.svg.png', country: 'JP', countryCode: 'JP', languages: ['en', 'ja'], categories: ['news', 'entertainment'], streamUrl: 'https://nhkworld-vh.akamaihd.net/i/nhkworld/liveed_g3/sd_w/index_0_av-b.m3u8' },
    { id: 'france24.en', name: 'France 24 English', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/France_24_English.svg/200px-France_24_English.svg.png', country: 'FR', countryCode: 'FR', languages: ['en', 'fr'], categories: ['news'], streamUrl: 'https://static.france24.com/live/F24_EN_LO_HLS/live_web.m3u8' },
    { id: 'dw.en', name: 'DW English', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Deutsche_Welle_symbol_2012.svg/200px-Deutsche_Welle_symbol_2012.svg.png', country: 'DE', countryCode: 'DE', languages: ['en', 'de'], categories: ['news'], streamUrl: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8' },
    { id: 'aljazeera.en', name: 'Al Jazeera English', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/Al_Jazeera_English.svg/200px-Al_Jazeera_English.svg.png', country: 'QA', countryCode: 'QA', languages: ['en', 'ar'], categories: ['news'], streamUrl: 'https://live-hls-web-aje.getaj.net/AJE/index.m3u8' },
    { id: 'france24.fr', name: 'France 24 Français', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/France_24_English.svg/200px-France_24_English.svg.png', country: 'FR', countryCode: 'FR', languages: ['fr'], categories: ['news'], streamUrl: 'https://static.france24.com/live/F24_FR_LO_HLS/live_web.m3u8' },
    { id: 'cgtn.en', name: 'CGTN English', logo: genLogoUrl('CGTN'), country: 'CN', countryCode: 'CN', languages: ['en', 'zh'], categories: ['news'], streamUrl: 'https://news.cgtn.com/resource/live/english/cgtn-news.m3u8' },
    { id: 'nasa.tv', name: 'NASA TV', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/NASA_logo.svg/200px-NASA_logo.svg.png', country: 'US', countryCode: 'US', languages: ['en'], categories: ['science', 'documentary'], streamUrl: 'https://ntv3.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8' },
    { id: 'trt.world', name: 'TRT World', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/TRT_World_logo.svg/200px-TRT_World_logo.svg.png', country: 'TR', countryCode: 'TR', languages: ['en', 'tr'], categories: ['news'], streamUrl: 'https://trtworldshift.akamaized.net/hls/live/681867/trtworld/index.m3u8' },
    { id: 'tv5monde.fr', name: 'TV5MONDE', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/TV5MONDE_logo.svg/200px-TV5MONDE_logo.svg.png', country: 'FR', countryCode: 'FR', languages: ['fr'], categories: ['entertainment', 'news'], streamUrl: 'https://tv5monde.akamaized.net/hls/live/689741/TV5MONDE_GP/index.m3u8' },
    { id: 'arirang.kr', name: 'Arirang TV Korea', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/b3/Arirang_TV.svg/200px-Arirang_TV.svg.png', country: 'KR', countryCode: 'KR', languages: ['en', 'ko'], categories: ['entertainment', 'news'], streamUrl: 'https://amdlive-ctnd02.akamaized.net/arirang/smil:arirang_1ch.smil/playlist.m3u8' },
    { id: 'dd.national', name: 'DD National India', logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/5/5e/DD_National.svg/200px-DD_National.svg.png', country: 'IN', countryCode: 'IN', languages: ['hi', 'en'], categories: ['news', 'entertainment'], streamUrl: 'https://ddinational.akamaized.net/hls/live/2006258/ddinational/index.m3u8' },
    { id: 'rtdoc.ru', name: 'RT Documentary', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/RT_logo.svg/200px-RT_logo.svg.png', country: 'RU', countryCode: 'RU', languages: ['en', 'ru'], categories: ['documentary', 'news'], streamUrl: 'https://rt-rtd.rttv.com/live/rtdoc/playlist.m3u8' },
    { id: 'sabc.za', name: 'SABC News', logo: genLogoUrl('SABC'), country: 'ZA', countryCode: 'ZA', languages: ['en', 'zu', 'af'], categories: ['news'], streamUrl: 'https://cdn.dvr.tv/stream/rssz_5002/live/index.m3u8' },
    { id: 'beinsports1', name: 'beIN Sports 1', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/BeIN_Sports_1.svg/200px-BeIN_Sports_1.svg.png', country: 'QA', countryCode: 'QA', languages: ['ar', 'en'], categories: ['sports'], streamUrl: 'https://bein-sports-mena.akamaized.net/hls/live/bein-sport1/index.m3u8' },
  ];
}
