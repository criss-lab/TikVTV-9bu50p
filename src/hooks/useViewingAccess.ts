import { useEffect, useState } from 'react';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { useAuthStore } from '@/stores/authStore';
import { getViewingAccess } from '@/lib/premium';

const PREVIEW_MS = 15 * 60 * 1000;
const STORAGE_PREFIX = 'tikvtvz:free-preview:v2:';

/** Server-owned account preview shared across web and the Capacitor APK. */
export function useViewingAccess() {
  const userId = useAuthStore(s => s.user?.id);
  const { active, endsAt, loading: premiumLoading, refresh } = usePremiumAccess();
  const key = STORAGE_PREFIX + 'guest';
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [gateLoading, setGateLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setGateLoading(true);
    setDeadline(null);
    const applyDeadline = (value: string | number | null) => {
      if (cancelled) return;
      const parsed = typeof value === 'number' ? value : value ? Date.parse(value) : NaN;
      let timestamp = Number.isFinite(parsed) ? parsed : Date.now();
      if (userId) {
        // Preserve the strictest known deadline on this install so signing out does not
        // immediately grant a fresh guest preview after an account's preview expires.
        try {
          const previous = Number(window.localStorage.getItem(key));
          if (Number.isFinite(previous) && previous > 0) timestamp = Math.min(timestamp, previous);
          window.localStorage.setItem(key, String(timestamp));
        } catch {
          // The account's server deadline remains authoritative even without local storage.
        }
      }
      setDeadline(timestamp);
      setNow(Date.now());
      setGateLoading(false);
    };
    const failClosed = () => {
      if (cancelled) return;
      // Lock for this session without overwriting the last known-good local deadline.
      setDeadline(Date.now());
      setNow(Date.now());
      setGateLoading(false);
    };

    if (userId) {
      void getViewingAccess(userId)
        .then(result => applyDeadline(result.preview_ends_at))
        .catch(error => {
          console.error('Server viewing access unavailable; playback remains locked', error);
          failClosed();
        });
    } else {
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
        saved = current + PREVIEW_MS;
      }
      applyDeadline(saved);
    }

    const tick = () => setNow(Date.now());
    const onResume = () => {
      tick();
      if (userId) void getViewingAccess(userId).then(result => applyDeadline(result.preview_ends_at)).catch(() => failClosed());
      void refresh();
    };
    const clock = window.setInterval(tick, 1000);
    const poll = window.setInterval(() => {
      if (userId && !document.hidden) {
        void getViewingAccess(userId).then(result => applyDeadline(result.preview_ends_at)).catch(() => applyDeadline(Date.now()));
      }
    }, 15000);
    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      cancelled = true;
      window.clearInterval(clock);
      window.clearInterval(poll);
      window.removeEventListener('focus', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [userId, key, refresh]);

  const remainingMs = Math.max(0, (deadline ?? now) - now);
  const previewActive = deadline !== null && remainingMs > 0;
  const allowed = active || previewActive;
  return { allowed, active, endsAt, loading: premiumLoading || gateLoading, remainingMs, previewActive, refresh };
}
