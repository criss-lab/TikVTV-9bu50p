import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { getPaymentPlans, invokePesapal, type PaymentPlan } from '@/lib/premium';

export default function Premium() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { active, endsAt, loading, refresh } = usePremiumAccess();
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPaymentPlans()
      .then(result => {
        if (!cancelled) {
          setPlans(result);
          setPlansError(null);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setPlans([]);
          setPlansError(error instanceof Error ? error.message : 'Subscription plans are unavailable.');
        }
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function checkout(plan: PaymentPlan) {
    if (!user) {
      toast.info('Sign in from Profile before subscribing');
      navigate('/profile');
      return;
    }
    setPaying(plan.code);
    try {
      // The server validates the plan code and calculates the amount; the client never sends a price.
      const data = await invokePesapal('initiate', undefined, plan.code);
      if (data.plan_code !== plan.code || data.amount_kes !== plan.amount_kes) {
        throw new Error('The checkout amount does not match the selected plan. Please refresh and try again.');
      }
      if (typeof data.redirect_url !== 'string') throw new Error('Secure checkout URL unavailable');
      const checkoutUrl = new URL(data.redirect_url);
      if (checkoutUrl.protocol !== 'https:' || !['pay.pesapal.com', 'cybqa.pesapal.com'].includes(checkoutUrl.hostname)) {
        throw new Error('Unexpected checkout destination');
      }
      window.location.assign(data.redirect_url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Checkout unavailable');
      setPaying(null);
    }
  }

  return <main className="min-h-screen bg-black text-white px-6 pt-16 pb-28"><div className="max-w-md mx-auto space-y-6">
    <Crown className="w-12 h-12 text-primary" />
    <h1 className="text-3xl font-bold">TikVTVz Premium</h1>
    <p className="text-white/60">Every plan unlocks all channels for its paid period. Activation requires verified payment and a recorded subscription.</p>
    {loading ? <Loader2 className="animate-spin" /> : active ? <section className="rounded-xl border border-green-500/40 p-4">
      <p className="text-green-400 font-semibold">All channels unlocked</p>
      <p className="text-sm text-white/70 mt-2">Expires {endsAt ? new Date(endsAt).toLocaleString() : 'as recorded by the payment service'}</p>
      <p className="text-xs text-white/50 mt-1">Access is based on your recorded expiry time, not a per-channel lock.</p>
    </section> : null}
    {plansLoading ? <div className="flex items-center gap-2 text-white/70"><Loader2 className="animate-spin" /> Loading current plans…</div> : null}
    {plansError ? <p role="alert" className="rounded-xl border border-red-400/40 p-4 text-sm text-red-200">{plansError}</p> : null}
    {!plansLoading && !plansError ? <div className="grid grid-cols-2 gap-3" aria-label="Choose a subscription plan">
      {plans.map(plan => <button key={plan.code} type="button" disabled={!!paying} onClick={() => void checkout(plan)} className="rounded-xl border border-white/20 bg-white/5 p-4 text-left disabled:opacity-50">
        <span className="block font-semibold">{plan.label}</span>
        <span className="block text-2xl font-bold mt-2">KSh {plan.amount_kes}</span>
        <span className="block text-xs text-white/60 mt-1">{plan.duration_label} · All channels</span>
        {paying === plan.code && <Loader2 className="animate-spin mt-2" size={16} />}
      </button>)}
    </div> : null}
    <button onClick={() => void refresh()} className="block text-sm text-white/70 underline">Refresh subscription status</button>
    <button onClick={() => navigate('/')} className="block text-sm text-white/70 underline">Back to channels</button>
  </div></main>;
}
