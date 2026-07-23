import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { AppNotification, AuthUser } from '@/types';

const NOTIF_KEY    = 'tikvtv_notifications_v1';
const LAST_KEY     = 'tikvtv_notif_last_v1';
const POLL_MS      = 60_000; // poll every 60s

function readNotifs(): AppNotification[] {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); } catch { return []; }
}
function saveNotifs(n: AppNotification[]) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(n.slice(0, 50))); } catch {}
}

export function useNotifications(user: AuthUser | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>(readNotifs);
  const [unread, setUnread]               = useState(0);
  const intervalRef                       = useRef<ReturnType<typeof setInterval>>();

  const refresh = useCallback(async () => {
    if (!user) return;

    // Fetch user's favorite channel IDs
    const { data: favs } = await supabase
      .from('favorites')
      .select('channel_id')
      .eq('user_id', user.id);
    if (!favs || favs.length === 0) return;

    const channelIds = favs.map(f => f.channel_id);
    const lastCheck  = localStorage.getItem(LAST_KEY) || new Date(Date.now() - 3_600_000).toISOString();

    const [{ data: reacts }, { data: comms }] = await Promise.all([
      supabase.from('reactions').select('channel_id').in('channel_id', channelIds).gte('created_at', lastCheck).neq('user_id', user.id),
      supabase.from('comments').select('channel_id').in('channel_id', channelIds).gte('created_at', lastCheck).neq('user_id', user.id),
    ]);

    localStorage.setItem(LAST_KEY, new Date().toISOString());

    const newNotifs: AppNotification[] = [];

    // Aggregate by channel
    const reactMap = new Map<string, number>();
    for (const r of reacts || []) reactMap.set(r.channel_id, (reactMap.get(r.channel_id) || 0) + 1);

    const commMap = new Map<string, number>();
    for (const c of comms || []) commMap.set(c.channel_id, (commMap.get(c.channel_id) || 0) + 1);

    for (const [chId, cnt] of reactMap) {
      newNotifs.push({ id: `r-${chId}-${Date.now()}`, channelId: chId, channelName: chId, type: 'reaction', count: cnt });
    }
    for (const [chId, cnt] of commMap) {
      newNotifs.push({ id: `c-${chId}-${Date.now()}`, channelId: chId, channelName: chId, type: 'comment', count: cnt });
    }

    if (newNotifs.length > 0) {
      setNotifications(prev => {
        const updated = [...newNotifs, ...prev].slice(0, 50);
        saveNotifs(updated);
        return updated;
      });
    }
  }, [user]);

  const markAllRead = useCallback(() => {
    const updated = notifications.map(n => ({ ...n, readAt: new Date().toISOString() }));
    setNotifications(updated);
    saveNotifs(updated);
    setUnread(0);
  }, [notifications]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    saveNotifs([]);
    setUnread(0);
  }, []);

  // Count unread
  useEffect(() => {
    setUnread(notifications.filter(n => !n.readAt).length);
  }, [notifications]);

  // Poll
  useEffect(() => {
    if (!user) return;
    refresh();
    intervalRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [user, refresh]);

  return { notifications, unread, markAllRead, clearAll, refresh };
}
