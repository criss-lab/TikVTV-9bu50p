
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Wifi } from 'lucide-react';
import { useChannels } from '@/hooks/useChannels';
import { useAuthStore } from '@/stores/authStore';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import ChannelCard from '@/components/features/ChannelCard';
import CategoryTabs from '@/components/features/CategoryTabs';
import Header from '@/components/layout/Header';
import LoadingCard from '@/components/features/LoadingCard';
import AuthModal from '@/components/features/AuthModal';
import { useT } from '@/lib/i18n';
import { useViewingAccess } from '@/hooks/useViewingAccess';

// Only the user-selected card may initialise a stream. This avoids hidden neighbours
// competing for manifests, media requests, decoders, and mobile network capacity.
const PRELOAD_RADIUS = 0;

export default function Feed() {
  const [searchParams]               = useSearchParams();
  const navigate                     = useNavigate();
  const countryFilter                = searchParams.get('country') || '';
  const catParam                     = searchParams.get('cat') || '';
  const [category,    setCategory]   = useState(catParam || 'all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAuth,    setShowAuth]   = useState(false);
  const [deadIds,     setDeadIds]    = useState<Set<string>>(new Set());
  const [liveIds,     setLiveIds]    = useState<Set<string>>(new Set());
  const t = useT();
  const { allowed, active, remainingMs, loading: accessLoading } = useViewingAccess();

  const { channels, loading, hasMore, loadMore, total, error } = useChannels(category, countryFilter);
  const { user }     = useAuthStore();
  const { addToHistory } = useWatchHistory();
  const containerRef = useRef<HTMLDivElement>(null);

  // Update category if URL param changes
  useEffect(() => {
    if (catParam && catParam !== category) setCategory(catParam);
  }, [catParam, category]);

  const liveChannels = useMemo(() => channels.filter(ch => !deadIds.has(ch.id)), [channels, deadIds]);
  const liveCount    = liveIds.size;

  // Cards have a fixed 100dvh snap height. Derive focus from the scroller's own
  // scroll offset instead of visibility batches/viewport geometry, which can drift
  // on mobile when the category/header/nav consume part of the screen.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    let lastRecordedId = '';

    const updateFocusedChannel = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-index]'));
        if (cards.length === 0) return;
        const cardHeight = cards[0].getBoundingClientRect().height;
        if (!Number.isFinite(cardHeight) || cardHeight <= 0) return;

        const rawIndex = Math.round(container.scrollTop / cardHeight);
        const idx = Math.max(0, Math.min(rawIndex, liveChannels.length - 1));
        setActiveIndex(previous => previous === idx ? previous : idx);

        const channel = liveChannels[idx];
        if (channel && channel.id !== lastRecordedId) {
          lastRecordedId = channel.id;
          addToHistory(channel);
        }
        if (idx >= liveChannels.length - 5 && hasMore) loadMore();
      });
    };

    container.addEventListener('scroll', updateFocusedChannel, { passive: true });
    window.addEventListener('resize', updateFocusedChannel);
    updateFocusedChannel();
    return () => {
      container.removeEventListener('scroll', updateFocusedChannel);
      window.removeEventListener('resize', updateFocusedChannel);
      cancelAnimationFrame(frame);
    };
  }, [liveChannels, hasMore, loadMore, addToHistory]);

  const handleCategoryChange = useCallback((id: string) => {
    setCategory(id);
    setActiveIndex(0);
    setDeadIds(new Set());
    setLiveIds(new Set());
    containerRef.current?.scrollTo({ top: 0 });
  }, [containerRef]);

  const handleChannelDead = useCallback((id: string) => {
    setDeadIds(prev => new Set([...prev, id]));
    setLiveIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  }, []);

  const handleChannelReady = useCallback((id: string) => {
    setLiveIds(prev => new Set([...prev, id]));
  }, []);

  if (loading && liveChannels.length === 0) {
    return (
      <div className="h-screen bg-black flex flex-col overflow-hidden">
        <Header liveCount={0} totalChannels={0} />
        <CategoryTabs activeCategory={category} onCategoryChange={handleCategoryChange} />
        <div className="flex-1 overflow-hidden">
          {[0, 1].map(i => <LoadingCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error && liveChannels.length === 0) {
    return (
      <div className="h-screen bg-black flex flex-col">
        <Header liveCount={0} totalChannels={0} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Wifi className="w-12 h-12 text-white/20" />
          <p className="text-white/50 text-sm text-center px-8">{t('failedLoad')}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-primary text-white px-6 py-2.5 rounded-full text-sm font-semibold"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">
      <Header liveCount={liveCount} totalChannels={total} />

      {countryFilter ? (
        <div className="bg-black/60 backdrop-blur px-4 py-2 border-b border-white/5 flex items-center gap-2">
          <span className="text-white/50 text-xs">{t('filteringByCountry')}</span>
          <span className="text-white text-xs font-semibold bg-white/10 px-2 py-0.5 rounded-full">
            {countryFilter.toUpperCase()}
          </span>
          <button onClick={() => navigate('/')} className="ml-auto text-primary text-xs hover:underline">
            {t('clearFilter')}
          </button>
        </div>
      ) : (
        <CategoryTabs activeCategory={category} onCategoryChange={handleCategoryChange} />
      )}

      {/* Feed scroll container — extra padding-bottom for bottom nav */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-scroll"
        style={{ scrollSnapType: 'y mandatory', overscrollBehavior: 'contain' }}
      >
        {liveChannels.map((channel, index) => (
          <ChannelCard
            key={`${channel.id}-${category}-${index}`}
            channel={channel}
            isActive={index === activeIndex}
            shouldLoad={allowed && !accessLoading && index === activeIndex && Math.abs(index - activeIndex) <= PRELOAD_RADIUS}
            index={index}
            user={user}
            onAuthRequired={() => setShowAuth(true)}
            onChannelDead={handleChannelDead}
            onChannelReady={handleChannelReady}
          />
        ))}

        {hasMore ? (
          <div
            className="flex items-center justify-center bg-black"
            style={{ height: '100dvh', scrollSnapAlign: 'start' }}
          >
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
              <p className="text-white/30 text-xs">{t('loadingMore')}</p>
            </div>
          </div>
        ) : liveChannels.length > 0 ? (
          <div
            className="flex items-center justify-center bg-black"
            style={{ height: '50dvh', scrollSnapAlign: 'start' }}
          >
            <p className="text-white/20 text-sm">
              {t('seenAll')} {total.toLocaleString()} {t('channelsLabel')} 🎉
            </p>
          </div>
        ) : null}
      </div>

      {!accessLoading && !active && !allowed && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/95 px-6 text-center text-white">
          <h2 className="text-2xl font-bold">Free preview ended</h2>
          <p className="text-white/70">Your 15-minute preview has elapsed. Unlock channels with Premium.</p>
          <button className="rounded-xl bg-primary px-6 py-3 font-bold" onClick={() => navigate('/premium')}>Unlock Premium</button>
        </div>
      )}
      {!accessLoading && !active && allowed && (
        <div className="fixed left-3 top-16 z-30 rounded-lg bg-black/75 px-3 py-2 text-xs font-semibold text-white pointer-events-none">Free preview {String(Math.floor(remainingMs / 60000)).padStart(2, '0')}:{String(Math.floor(remainingMs % 60000 / 1000)).padStart(2, '0')}</div>
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
