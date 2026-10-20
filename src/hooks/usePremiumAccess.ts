import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getPremiumAccess, PREMIUM_CHANGED } from '@/lib/premium';

export function usePremiumAccess() {
  const user = useAuthStore(s => s.user);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    if (!user) { setEndsAt(null); setLoading(false); return false; }
    try {
      const result = await getPremiumAccess(user.id);
      setEndsAt(result.active ? result.endsAt : null);
      setNow(Date.now());
      return result.active;
    } catch (error) {
      console.error('Premium status unavailable', error);
      setEndsAt(null);
      return false;
    } finally { setLoading(false); }
  }, [user?.id]);
  useEffect(() => {
    setLoading(true);
    setEndsAt(null);
    void refresh();
    const update = () => { setNow(Date.now()); void refresh(); };
    const visible = () => { if (!document.hidden) update(); };
    window.addEventListener(PREMIUM_CHANGED, update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(() => { setNow(Date.now()); if (!document.hidden) void refresh(); }, 15000);
    return () => {
      window.removeEventListener(PREMIUM_CHANGED, update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(timer);
    };
  }, [refresh]);
  const active = !!endsAt && Date.parse(endsAt) > now;
  return { active, endsAt: active ? endsAt : null, loading, refresh };
}
