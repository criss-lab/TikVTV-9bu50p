import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getPremiumAccess, PREMIUM_CHANGED } from '@/lib/premium';

export function usePremiumAccess() {
  const userId = useAuthStore(s => s.user?.id);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  // Reject responses from a previous account and out-of-order requests.
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!userId) { setEndsAt(null); setLoading(false); return false; }
    try {
      const result = await getPremiumAccess(userId);
      if (request !== generation.current) return false;
      const deadline = result.active && result.endsAt && Date.parse(result.endsAt) > Date.now() ? result.endsAt : null;
      setEndsAt(deadline);
      setNow(Date.now());
      return !!deadline;
    } catch (error) {
      if (request === generation.current) console.error('Premium status unavailable', error);
      // A transient API failure cannot extend a server-issued deadline.
      return false;
    } finally { if (request === generation.current) setLoading(false); }
  }, [userId]);
  useEffect(() => {
    ++generation.current;
    setLoading(true);
    setEndsAt(null);
    void refresh();
    const update = () => { setNow(Date.now()); void refresh(); };
    const visible = () => { if (!document.hidden) update(); };
    window.addEventListener(PREMIUM_CHANGED, update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', visible);
    const clock = window.setInterval(() => setNow(Date.now()), 250);
    const poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
    return () => {
      ++generation.current;
      window.removeEventListener(PREMIUM_CHANGED, update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(clock);
      window.clearInterval(poll);
    };
  }, [refresh]);
  const active = !!userId && !!endsAt && Date.parse(endsAt) > now;
  return { active, endsAt: active ? endsAt : null, loading, refresh };
}
