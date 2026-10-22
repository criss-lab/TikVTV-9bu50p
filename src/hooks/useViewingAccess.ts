import { useEffect, useState } from 'react';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { useAuthStore } from '@/stores/authStore';
import { getViewingAccess } from '@/lib/premium';

/** Each of the first seven distinct channels has its own immutable 15-minute preview. */
export function useViewingAccess(channelId: string | null) {
  const userId = useAuthStore(s => s.user?.id);
  const { active: premiumActive, endsAt, loading: premiumLoading, refresh } = usePremiumAccess();
  const [previewEnd, setPreviewEnd] = useState<string | null>(null);
  const [verifiedChannel, setVerifiedChannel] = useState<string | null>(null);
  const [verifiedUser, setVerifiedUser] = useState<string | null>(null);
  const [serverEnd, setServerEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [used, setUsed] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setPreviewEnd(null); setServerEnd(null); setVerifiedChannel(null); setVerifiedUser(null); setLoading(true);
    const check = async () => {
      if (!userId || !channelId) { if (!cancelled) { setLoading(false); setPreviewEnd(null); setServerEnd(null); } return; }
      try {
        const result = await getViewingAccess(userId, channelId);
        if (cancelled) return;
        setVerifiedChannel(channelId); setVerifiedUser(userId);
        setPreviewEnd(result.preview_ends_at);
        setServerEnd(result.active ? result.ends_at : null);
        setUsed(result.previews_used);
      } catch (error) {
        console.error('Channel entitlement unavailable', error);
        // Retain only previously verified deadlines; the clock still expires them.
        // A network timeout must not turn a paid viewer into a new customer.
      } finally { if (!cancelled) { setNow(Date.now()); setLoading(false); } }
    };
    void check();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => { if (!document.hidden) void check(); }, 3000);
    const resume = () => { if (!document.hidden) { void check(); void refresh(); } };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { cancelled = true; clearInterval(clock); clearInterval(poll); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [userId, channelId, refresh]);
  const verifiedForFocus = verifiedChannel === channelId && verifiedUser === userId && !!userId && !!channelId;
  const paidActive = premiumActive || (verifiedForFocus && !!serverEnd && Date.parse(serverEnd) > now);
  const remainingMs = Math.max(0, (previewEnd ? Date.parse(previewEnd) : now) - now);
  const previewActive = verifiedForFocus && remainingMs > 0;
  return { allowed: paidActive || previewActive, active: paidActive, endsAt: serverEnd || endsAt, loading: loading || premiumLoading, remainingMs, previewActive, previewsUsed: used, refresh };
}
