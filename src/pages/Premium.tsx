import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { invokePesapal } from '@/lib/premium';

const plans = [
  { code: 'half_day', label: '12 hours', price: 5, detail: 'Half-day access' },
  { code: 'day', label: '1 day', price: 10, detail: '24-hour access' },
  { code: 'week', label: '1 week', price: 40, detail: '7-day access' },
  { code: 'month', label: '1 month', price: 130, detail: '30-day access' },
] as const;

export default function Premium() {
  const navigate = useNavigate(); const user = useAuthStore(s => s.user);
  const { active, endsAt, loading, refresh } = usePremiumAccess();
  const [paying, setPaying] = useState(false);
  const [planCode, setPlanCode] = useState<(typeof plans)[number]['code']>('month');
  async function checkout() {
    if (!user) { toast.info('Sign in from Profile before subscribing'); navigate('/profile'); return; }
    setPaying(true);
    try {
      const data = await invokePesapal('initiate', undefined, planCode);
      if (typeof data?.redirect_url !== 'string') throw new Error('Secure checkout URL unavailable');
      const checkoutUrl = new URL(data.redirect_url);
      if (checkoutUrl.protocol !== 'https:' || !['pay.pesapal.com', 'cybqa.pesapal.com'].includes(checkoutUrl.hostname)) throw new Error('Unexpected checkout destination');
      window.location.assign(data.redirect_url);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Checkout unavailable'); setPaying(false); }
  }
  return <main className="min-h-screen bg-black text-white px-6 pt-16 pb-28"><div className="max-w-md mx-auto space-y-6">
    <Crown className="w-12 h-12 text-primary" /><h1 className="text-3xl font-bold">TikVTVz Premium</h1>
    <p className="text-white/60">Secure checkout through PesaPal. Access activates only after the server verifies your payment and records your subscription.</p>
    {loading ? <Loader2 className="animate-spin" /> : active ? <p className="text-green-400 font-semibold">Premium active — enjoy watching.{endsAt && <span className="block mt-2 text-sm font-normal text-white/70">Access until {new Date(endsAt).toLocaleString()}</span>}</p> : <>
      <div className="grid grid-cols-2 gap-3" aria-label="Choose a subscription plan">
        {plans.map(plan => <button key={plan.code} type="button" aria-pressed={planCode === plan.code} onClick={() => setPlanCode(plan.code)} className={`rounded-xl border p-4 text-left transition ${planCode === plan.code ? 'border-primary bg-primary/15' : 'border-white/15 bg-white/5'}`}>
          <span className="block font-semibold">{plan.label}</span><span className="block text-2xl font-bold">KSh {plan.price}</span><span className="block text-xs text-white/60">{plan.detail}</span>
        </button>)}
      </div>
      <button disabled={paying} onClick={checkout} className="w-full rounded-xl bg-primary p-4 font-bold disabled:opacity-50">{paying ? 'Opening checkout…' : `Pay KSh ${plans.find(plan => plan.code === planCode)!.price} with PesaPal`}</button>
    </>}
    <button onClick={() => void refresh()} className="block text-sm text-white/70 underline">Refresh subscription status</button>
    <button onClick={() => navigate('/')} className="block text-sm text-white/70 underline">Back to channels</button>
  </div></main>;
}
