import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useReactions(channelId: string, userId?: string) {
  const [liked,     setLiked]     = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { count } = await supabase
        .from('reactions')
        .select('*', { count: 'exact', head: true })
        .eq('channel_id', channelId);

      if (mounted) setLikeCount(count || 0);

      if (userId) {
        const { data } = await supabase
          .from('reactions')
          .select('id')
          .eq('channel_id', channelId)
          .eq('user_id', userId)
          .maybeSingle();
        if (mounted) setLiked(!!data);
      }
    };

    load();
    return () => { mounted = false; };
  }, [channelId, userId]);

  const toggleLike = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    setLoading(true);

    if (liked) {
      await supabase
        .from('reactions')
        .delete()
        .eq('channel_id', channelId)
        .eq('user_id', userId);
      setLiked(false);
      setLikeCount(n => Math.max(0, n - 1));
    } else {
      await supabase
        .from('reactions')
        .insert({ channel_id: channelId, user_id: userId, type: 'like' });
      setLiked(true);
      setLikeCount(n => n + 1);
    }

    setLoading(false);
    return true;
  }, [channelId, userId, liked]);

  return { liked, likeCount, loading, toggleLike };
}
