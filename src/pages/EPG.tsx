import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, RefreshCw, Loader2, Tv2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchAllChannels } from '@/lib/iptvApi';
import type { IPTVChannel } from '@/types';

// EPG data from iptv-org
const EPG_API = 'https://iptv-org.github.io/epg/guides/';

interface EpgProgram {
  channel: string;
  title: string;
  description?: string;
  start: string;  // ISO
  stop: string;
  icon?: string;
}

interface EpgGuide {
  channelId: string;
  programs: EpgProgram[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOT_W = 200; // px per 30 minutes
const HEADER_W = 180; // px for channel name column
const ROW_H = 64; // px

function timeToOffset(dateStr: string, baseMs: number): number {
  const ms = new Date(dateStr).getTime() - baseMs;
  return (ms / 1000 / 60 / 30) * SLOT_W;
}

function durationWidth(start: string, stop: string): number {
  const ms = new Date(stop).getTime() - new Date(start).getTime();
  return Math.max((ms / 1000 / 60 / 30) * SLOT_W, 80);
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Mock EPG data since the real EPG API requires specific channel IDs
function generateMockEpg(channels: IPTVChannel[]): EpgGuide[] {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const baseMs = now.getTime();

  const templates: Record<string, string[][]> = {
    news: [
      ['Morning News', '60'], ['World Update', '30'], ['Breaking News', '30'], ['Sports Roundup', '30'],
      ['Evening News', '60'], ['Night News', '30'], ['Late Headlines', '30'], ['Overnight Report', '60'],
    ],
    sports: [
      ['Football Highlights', '60'], ['Sports Center', '30'], ['Live Match', '120'], ['Post-Match', '30'],
      ['Basketball Today', '60'], ['Tennis Live', '90'], ['Sports Analysis', '30'], ['Night Sports', '60'],
    ],
    entertainment: [
      ['Morning Show', '60'], ['Talk Show', '60'], ['Reality TV', '60'], ['Drama Series', '60'],
      ['Comedy Hour', '30'], ['Game Show', '60'], ['Evening Drama', '60'], ['Late Night Show', '60'],
    ],
    music: [
      ['Top Hits', '30'], ['Video Countdown', '60'], ['Live Concert', '90'], ['Retro Classics', '60'],
      ['New Releases', '30'], ['DJ Mix', '60'], ['Jazz Night', '60'], ['Pop Charts', '30'],
    ],
    general: [
      ['Morning Magazine', '60'], ['Lifestyle Show', '30'], ['Afternoon Program', '60'], ['Feature Film', '120'],
      ['Evening Show', '60'], ['Documentary', '60'], ['Night Program', '60'], ['Late Show', '60'],
    ],
  };

  return channels.slice(0, 40).map(ch => {
    const cat = ch.categories[0] || 'general';
    const tpls = templates[cat] || templates.general;
    const programs: EpgProgram[] = [];
    let cursor = baseMs - 2 * 60 * 60 * 1000; // start 2h ago

    for (let i = 0; i < 20; i++) {
      const [title, durStr] = tpls[i % tpls.length];
      const dur = parseInt(durStr, 10) * 60 * 1000;
      programs.push({
        channel: ch.id,
        title,
        start: new Date(cursor).toISOString(),
        stop: new Date(cursor + dur).toISOString(),
      });
      cursor += dur;
    }

    return { channelId: ch.id, programs };
  });
}

export default function EPG() {
  const navigate = useNavigate();
  const [channels, setChannels] = useState<IPTVChannel[]>([]);
  const [guides,   setGuides]   = useState<EpgGuide[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [category, setCategory] = useState('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const now      = new Date();
  const baseHour = new Date(now); baseHour.setHours(0, 0, 0, 0);
  const baseMs   = baseHour.getTime();
  const nowOffset = HEADER_W + timeToOffset(now.toISOString(), baseMs);

  const cats = ['all', 'news', 'sports', 'entertainment', 'music', 'documentary'];

  useEffect(() => {
    fetchAllChannels().then(all => {
      const filtered = category === 'all'
        ? all.slice(0, 40)
        : all.filter(ch => ch.categories.includes(category)).slice(0, 40);
      setChannels(filtered);
      setGuides(generateMockEpg(filtered));
      setLoading(false);
    });
  }, [category]);

  // Scroll to current time on load
  useEffect(() => {
    if (!loading && scrollRef.current) {
      const scrollX = nowOffset - 120;
      scrollRef.current.scrollLeft = Math.max(0, scrollX - HEADER_W);
    }
  }, [loading, nowOffset]);

  // Sync horizontal scroll between header and body
  const handleScroll = () => {
    if (scrollRef.current && headerRef.current) {
      headerRef.current.scrollLeft = scrollRef.current.scrollLeft;
    }
  };

  const totalWidth = 24 * 2 * SLOT_W; // 24 hours × 2 × slot width

  if (loading) return (
    <div className="h-screen bg-black flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
    </div>
  );

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none px-4 pt-12 pb-3 border-b border-white/8 bg-black/95 backdrop-blur">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">TV Schedule</h1>
            <p className="text-white/40 text-xs flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 bg-red-600/20 border border-red-600/40 text-red-400 text-xs font-bold px-2.5 py-1 rounded-full">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            LIVE NOW
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {cats.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'flex-none text-xs font-semibold px-3 py-1.5 rounded-full capitalize transition-colors',
                category === c
                  ? 'bg-primary text-white'
                  : 'bg-white/8 text-white/60 hover:bg-white/15 hover:text-white'
              )}
            >
              {c === 'all' ? 'All Channels' : c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Time ruler (fixed, scrolls horizontally with body) */}
        <div className="flex-none border-b border-white/8 bg-gray-950 relative overflow-hidden">
          <div className="flex" style={{ marginLeft: HEADER_W }}>
            <div
              ref={headerRef}
              className="overflow-hidden flex-1"
              style={{ scrollBehavior: 'auto' }}
            >
              <div className="flex" style={{ width: totalWidth }}>
                {HOURS.map(h => (
                  <div key={h} className="flex-none flex items-center border-l border-white/8 px-2 py-2" style={{ width: SLOT_W * 2 }}>
                    <span className="text-white/40 text-[10px] font-mono">
                      {String(h).padStart(2, '0')}:00
                    </span>
                    <span className="text-white/20 text-[10px] font-mono ml-[calc(200px_-_28px)]">:30</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Channel rows */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto"
          onScroll={handleScroll}
          style={{ scrollBehavior: 'auto' }}
        >
          <div style={{ width: HEADER_W + totalWidth, minHeight: channels.length * ROW_H }}>
            {/* Now indicator */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500/70 z-20 pointer-events-none"
              style={{ left: nowOffset }}
            />

            {channels.map((ch, ri) => {
              const guide = guides.find(g => g.channelId === ch.id);
              return (
                <div
                  key={ch.id}
                  className="flex border-b border-white/5"
                  style={{ height: ROW_H }}
                >
                  {/* Channel name column */}
                  <div
                    className="flex-none sticky left-0 z-10 flex items-center gap-2 px-3 bg-gray-950 border-r border-white/8"
                    style={{ width: HEADER_W }}
                  >
                    {ch.logo ? (
                      <img src={ch.logo} alt={ch.name} className="w-8 h-8 rounded object-contain bg-white/5 p-0.5 flex-none" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center flex-none">
                        <Tv2 className="w-4 h-4 text-primary/60" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{ch.name}</p>
                      <p className="text-white/30 text-[10px] truncate uppercase">{ch.countryCode}</p>
                    </div>
                  </div>

                  {/* Programs */}
                  <div className="relative flex-1" style={{ width: totalWidth }}>
                    {(guide?.programs || []).map((prog, pi) => {
                      const left = timeToOffset(prog.start, baseMs);
                      const width = durationWidth(prog.start, prog.stop);
                      const isNow = new Date(prog.start) <= now && new Date(prog.stop) > now;

                      return (
                        <button
                          key={pi}
                          onClick={() => navigate(`/channel/${ch.id}`)}
                          className={cn(
                            'absolute top-1 bottom-1 rounded-lg px-2 flex flex-col justify-center overflow-hidden border transition-all hover:z-10',
                            isNow
                              ? 'bg-primary/25 border-primary/50 hover:bg-primary/35'
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          )}
                          style={{ left: left + 1, width: width - 3 }}
                        >
                          {isNow && (
                            <div className="flex items-center gap-1 mb-0.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                              <span className="text-primary text-[9px] font-bold uppercase">Live</span>
                            </div>
                          )}
                          <p className={cn('text-xs font-semibold truncate leading-tight', isNow ? 'text-white' : 'text-white/70')}>
                            {prog.title}
                          </p>
                          <p className="text-white/30 text-[10px] truncate">
                            {formatTime(prog.start)} – {formatTime(prog.stop)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Current time pill */}
      <div className="fixed bottom-24 right-4 z-30">
        <div className="flex items-center gap-1.5 bg-black/80 backdrop-blur border border-white/15 text-white text-xs font-mono px-3 py-1.5 rounded-full">
          <Clock className="w-3 h-3 text-primary" />
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Refresh */}
      <button
        onClick={() => { setLoading(true); setGuides(generateMockEpg(channels)); setTimeout(() => setLoading(false), 300); }}
        className="fixed bottom-24 left-4 z-30 w-9 h-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center hover:bg-white/20 transition-colors"
      >
        <RefreshCw className="w-4 h-4 text-white/60" />
      </button>
    </div>
  );
}
