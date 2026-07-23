import { useCallback, useEffect, useState } from 'react';
import type { WatchHistoryItem, IPTVChannel } from '@/types';

const STORAGE_KEY = 'tikvtv_history_v2';
const MAX_ITEMS   = 100;

function readHistory(): WatchHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchHistoryItem[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(items: WatchHistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {}
}

export function useWatchHistory() {
  const [history, setHistory] = useState<WatchHistoryItem[]>(readHistory);

  const addToHistory = useCallback((channel: IPTVChannel) => {
    setHistory(prev => {
      const filtered = prev.filter(h => h.channelId !== channel.id);
      const entry: WatchHistoryItem = {
        channelId:   channel.id,
        name:        channel.name,
        logo:        channel.logo,
        country:     channel.country,
        countryCode: channel.countryCode,
        categories:  channel.categories,
        watchedAt:   new Date().toISOString(),
      };
      const updated = [entry, ...filtered];
      writeHistory(updated);
      return updated;
    });
  }, []);

  const removeFromHistory = useCallback((channelId: string) => {
    setHistory(prev => {
      const updated = prev.filter(h => h.channelId !== channelId);
      writeHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  }, []);

  /** Returns top N suggested categories based on watch history */
  const getSuggestedCategories = useCallback((topN = 3): string[] => {
    const counts = new Map<string, number>();
    for (const item of history) {
      for (const cat of item.categories) {
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([cat]) => cat);
  }, [history]);

  return { history, addToHistory, removeFromHistory, clearHistory, getSuggestedCategories };
}
