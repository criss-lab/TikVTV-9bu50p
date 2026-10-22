import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllChannels, getChannelPage } from '@/lib/iptvApi';
import type { IPTVChannel } from '@/types';
import { streamHealth } from '@/lib/streamHealth';

export function traceWelcomeOrder(all: IPTVChannel[]): IPTVChannel[] {
  const score = (ch: IPTVChannel) => {
    const isTrace = /\bTRACE\b/i.test(ch.name) || /\bTRACE\b/i.test(ch.network || '');
    if (!isTrace) return 2;
    const health = streamHealth(ch.id);
    return health === 'online' ? 0 : health === 'unknown' ? 1 : 2;
  };
  return all.map((channel, index) => ({ channel, index, rank: score(channel) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index).map(item => item.channel);
}


export function useChannels(category: string, countryCode = '', traceWelcome = false) {
  const [channels, setChannels]     = useState<IPTVChannel[]>([]);
  const [loading, setLoading]       = useState(true);
  const [hasMore, setHasMore]       = useState(true);
  const [total, setTotal]           = useState(0);
  const [error, setError]           = useState<string | null>(null);
  const pageRef                     = useRef(1);
  const allChannelsRef              = useRef<IPTVChannel[]>([]);
  const loadingMoreRef              = useRef(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setChannels([]);
    setError(null);
    setHasMore(true);
    pageRef.current = 1;

    const applyChannels = (all: IPTVChannel[]) => {
      const ordered = traceWelcome && category === 'all' && !countryCode ? traceWelcomeOrder(all) : all;
      allChannelsRef.current = ordered;
      const loadedPages = Math.max(1, pageRef.current);
      const items: IPTVChannel[] = [];
      let lastPage = getChannelPage(ordered, category, 1, countryCode);
      for (let pageNumber = 1; pageNumber <= loadedPages; pageNumber++) {
        lastPage = getChannelPage(ordered, category, pageNumber, countryCode);
        items.push(...lastPage.items);
        if (!lastPage.hasMore) break;
      }
      setChannels(items);
      setHasMore(lastPage.hasMore);
      setTotal(lastPage.total);
    };

    fetchAllChannels()
      .then(all => {
        if (!mounted) return;
        applyChannels(all);
        setLoading(false);
      })
      .catch(err => {
        if (!mounted) return;
        setError(String(err));
        setLoading(false);
      });

    // Optional M3U sources enrich the list after the first screen is already usable.
    const onChannelsUpdated = () => {
      fetchAllChannels().then(all => {
        if (mounted) applyChannels(all);
      }).catch(() => {});
    };
    window.addEventListener('iptv-channels-updated', onChannelsUpdated);
    return () => {
      mounted = false;
      window.removeEventListener('iptv-channels-updated', onChannelsUpdated);
    };
  }, [category, countryCode, traceWelcome]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;

    const nextPage = pageRef.current + 1;
    const page = getChannelPage(allChannelsRef.current, category, nextPage, countryCode);
    setChannels(prev => [...prev, ...page.items]);
    setHasMore(page.hasMore);
    setTotal(page.total);
    pageRef.current = nextPage;

    setTimeout(() => { loadingMoreRef.current = false; }, 300);
  }, [category, countryCode, hasMore]);

  return { channels, loading, hasMore, loadMore, total, error };
}
