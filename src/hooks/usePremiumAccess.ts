import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getPremiumAccess, PREMIUM_CHANGED } from '@/lib/premium';
export function usePremiumAccess() {
  const user = useAuthStore(s => s.user);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!user) { setActive(false); setLoading(false); return false; }
    try { const result = await getPremiumAccess(user.id); setActive(result.active); return result.active; }
    catch (error) { console.error('Premium status unavailable', error); setActive(false); return false; }
    finally { setLoading(false); }
  }, [user?.id]);
  useEffect(() => {
    setLoading(true); void refresh();
    const update = () => { void refresh(); };
    const visible = () => { if (!document.hidden) update(); };
    window.addEventListener(PREMIUM_CHANGED, update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(visible, 15000);
    return () => { window.removeEventListener(PREMIUM_CHANGED, update); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', visible); window.clearInterval(timer); };
  }, [refresh]);
  return { active, loading, refresh };
}
