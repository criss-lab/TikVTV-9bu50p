import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { invokePesapal } from '@/lib/premium';

const plans = [
  { id: 'half_day', name: 'Half day', amount: 5, duration: '12 hours' },
  { id: 'day', name: 'Daily', amount: 10, duration: '24 hours' },
  { id: 'week', name: 'Weekly', amount: 40, duration: '7 days' },
  { id: 'month', name: 'Monthly', amount: 130, duration: '30 days' },
] as const;
export default function Premium() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { active, endsAt, loading, refresh } = usePremiumAccess();
  const [paying, setPaying] = useState<string | null>(null);
  async function checkout(plan: typeof plans[number]) {
    if (!user) { toast.info('Sign in from Profile before subscribing'); navigate('/profile'); return; }
    setPaying(plan.id);
    try {
      // The server MUST validate the plan ID and derive the amount itself. Never trust a client amount.
      const data = await invokePesapal('initiate', undefined, plan.id);
      if (!('redirect_url' in data) || typeof data.redirect_url !== 'string') throw new Error('Secure checkout URL unavailable');
      const checkoutUrl = new URL(data.redirect_url);
      if (checkoutUrl.protocol !== 'https:' || !['pay.pesapal.com', 'cybqa.pesapal.com'].includes(checkoutUrl.hostname)) throw new Error('Unexpected checkout destination');
      window.location.assign(data.redirect_url);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Checkout unavailable'); setPaying(null); }
  }
  return <main className="min-h-screen bg-black text-white px-6 pt-16 pb-28"><div className="max-w-md mx-auto space-y-6">
    <Crown className="w-12 h-12 text-primary" /><h1 className="text-3xl font-bold">TikVTVz Premium</h1>
    <p className="text-white/60">Every plan unlocks all channels for its paid period. Activation requires verified payment and a recorded subscription.</p>
    {loading ? <Loader2 className="animate-spin" /> : active ? <section className="rounded-xl border border-green-500/40 p-4"><p className="text-green-400 font-semibold">All channels unlocked</p><p className="text-sm text-white/70 mt-2">Expires {endsAt && new Date(endsAt).toLocaleString()}</p><p className="text-xs text-white/50 mt-1">Access is based on your recorded expiry time, not a per-channel lock.</p></section> : null}
    <div className="grid grid-cols-2 gap-3">{plans.map(plan => <button key={plan.id} disabled={!!paying} onClick={() => void checkout(plan)} className="rounded-xl border border-white/20 bg-white/5 p-4 text-left disabled:opacity-50"><span className="block font-semibold">{plan.name}</span><span className="block text-2xl font-bold mt-2">KSh {plan.amount}</span><span className="block text-xs text-white/60 mt-1">{plan.duration} · All channels</span>{paying === plan.id && <Loader2 className="animate-spin mt-2" size={16}/>}</button>)}</div>
    <button onClick={() => void refresh()} className="block text-sm text-white/70 underline">Refresh subscription status</button>
    <button onClick={() => navigate('/')} className="block text-sm text-white/70 underline">Back to channels</button>
  </div></main>;
}
