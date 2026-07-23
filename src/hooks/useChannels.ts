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

    fetchAllChannels()
      .then(all => {
        if (!mounted) return;
        allChannelsRef.current = all;
        const page = getChannelPage(all, category, 1, countryCode);
        setChannels(page.items);
        setHasMore(page.hasMore);
        setTotal(page.total);
        setLoading(false);
      })
      .catch(err => {
        if (!mounted) return;
        setError(String(err));
        setLoading(false);
      });

    return () => { mounted = false; };
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
