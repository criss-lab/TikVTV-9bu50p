import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { getPremiumAccess, invokePesapal, notifyPremiumChanged } from '@/lib/premium';

export default function PaymentCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const authLoading = useAuthStore(s => s.loading);
  const [message, setMessage] = useState('Verifying your payment securely…');
  const trackingId = params.get('OrderTrackingId') || params.get('orderTrackingId') || params.get('order_tracking_id');

  useEffect(() => {
    if (!trackingId) { setMessage('Missing payment reference. Check Premium for your subscription status.'); return; }
    if (authLoading) { setMessage('Restoring your account session…'); return; }
    if (!user) { setMessage('Sign in to the same account to finish payment verification.'); return; }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const check = async () => {
      attempts++;
      try {
        // The server authenticates the user and verifies this order with PesaPal.
        const result = await invokePesapal('check_status', trackingId);
        const entitlement = await getPremiumAccess(user.id);
        if (cancelled) return;
        if (entitlement.active) {
          notifyPremiumChanged();
          setMessage('Payment verified. Premium is now unlocked!');
          timer = setTimeout(() => { if (!cancelled) navigate('/premium', { replace: true }); }, 1600);
          return;
        }

        // initiate and check_status intentionally return different response shapes.
        const status = 'payment_status_description' in result
          ? result.payment_status_description
          : undefined;
        if (status && ['failed', 'invalid', 'rejected', 'cancelled', 'canceled', 'voided'].includes(status.toLowerCase())) {
          setMessage('Payment was not confirmed. Check your transaction before retrying.');
          return;
        }
        setMessage(status?.toLowerCase() === 'completed'
          ? 'Payment received; waiting for subscription activation…'
          : 'Waiting for payment confirmation…');
      } catch (error) {
        if (!cancelled) {
          console.error('Payment verification pending', error);
          setMessage('Still synchronizing. Please do not pay twice.');
        }
      }
      if (cancelled) return;
      if (attempts < 24) timer = setTimeout(check, 5000);
      else setMessage('Activation is delayed. Reopen Premium to check your status; do not pay twice.');
    };

    timer = setTimeout(check, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [trackingId, user?.id, authLoading, navigate]);

  return <main className="min-h-screen bg-black text-white px-6 flex items-center justify-center"><div className="max-w-sm text-center space-y-5"><h1 className="text-2xl font-bold">PesaPal verification</h1><p role="status" className="text-white/70">{message}</p><button className="rounded-xl bg-primary px-6 py-3" onClick={() => navigate('/premium')}>View Premium status</button></div></main>;
}
