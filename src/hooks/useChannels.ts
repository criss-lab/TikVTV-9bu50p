import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllChannels, getChannelPage } from '@/lib/iptvApi';
import type { IPTVChannel } from '@/types';

export function useChannels(category: string, countryCode = '') {
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
      allChannelsRef.current = all;
      const loadedPages = Math.max(1, pageRef.current);
      const items: IPTVChannel[] = [];
      let lastPage = getChannelPage(all, category, 1, countryCode);
      for (let pageNumber = 1; pageNumber <= loadedPages; pageNumber++) {
        lastPage = getChannelPage(all, category, pageNumber, countryCode);
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
  }, [category, countryCode]);

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
