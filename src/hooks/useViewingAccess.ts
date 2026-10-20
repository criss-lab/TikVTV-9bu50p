import { useEffect, useState } from 'react';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { useAuthStore } from '@/stores/authStore';

const PREVIEW_MS = 15 * 60 * 1000;
const STORAGE_PREFIX = 'tikvtvz:free-preview:v1:';

/** One persistent preview per account/browser, shared across channels and routes. */
export function useViewingAccess() {
  const userId = useAuthStore(s => s.user?.id);
  const { active, endsAt, loading, refresh } = usePremiumAccess();
  const key = STORAGE_PREFIX + (userId || 'guest');
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const current = Date.now();
    let saved: number | null = null;
    try {
      const value = window.localStorage.getItem(key);
      const parsed = value === null ? NaN : Number(value);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= current + PREVIEW_MS) saved = parsed;
      if (saved === null) {
        saved = current + PREVIEW_MS;
        window.localStorage.setItem(key, String(saved));
      }
    } catch {
      // Storage may be disabled; keep the current session's preview functional.
      saved = current + PREVIEW_MS;
    }
    setDeadline(saved);
    setNow(current);
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [key]);

  const remainingMs = Math.max(0, (deadline ?? now + PREVIEW_MS) - now);
  const previewActive = deadline === null || remainingMs > 0;
  const allowed = active || previewActive;
  return { allowed, active, endsAt, loading, remainingMs, previewActive, refresh };
}
