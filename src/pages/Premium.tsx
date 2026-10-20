import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { usePremiumAccess } from '@/hooks/usePremiumAccess';
import { invokePesapal } from '@/lib/premium';
export default function Premium() {
  const navigate = useNavigate(); const user = useAuthStore(s => s.user);
  const { active, endsAt, loading, refresh } = usePremiumAccess(); const [paying, setPaying] = useState(false);
  async function checkout() {
    if (!user) { toast.info('Sign in from Profile before subscribing'); navigate('/profile'); return; }
    setPaying(true);
    try { const data = await invokePesapal('initiate');
      if (typeof data?.redirect_url !== 'string') throw new Error('Secure checkout URL unavailable');
      const checkoutUrl = new URL(data.redirect_url);
      if (checkoutUrl.protocol !== 'https:' || !/(^|\.)pesapal\.com$/.test(checkoutUrl.hostname)) throw new Error('Unexpected checkout destination');
      window.location.assign(data.redirect_url);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Checkout unavailable'); setPaying(false); }
  }
  return <main className="min-h-screen bg-black text-white px-6 pt-16 pb-28"><div className="max-w-md mx-auto space-y-6">
    <Crown className="w-12 h-12 text-primary" /><h1 className="text-3xl font-bold">TikVTVz Premium</h1>
    <p className="text-white/60">Secure checkout through PesaPal. Access activates only after your payment is verified and your subscription is recorded.</p>
    {loading ? <Loader2 className="animate-spin" /> : active ? <p className="text-green-400 font-semibold">Premium active — enjoy watching.{endsAt && <span className="block mt-2 text-sm font-normal text-white/70">Access until {new Date(endsAt).toLocaleString()}</span>}</p> : <button disabled={paying} onClick={checkout} className="w-full rounded-xl bg-primary p-4 font-bold disabled:opacity-50">{paying ? 'Opening checkout…' : 'Subscribe with PesaPal'}</button>}
    <button onClick={() => void refresh()} className="block text-sm text-white/70 underline">Refresh subscription status</button>
    <button onClick={() => navigate('/')} className="block text-sm text-white/70 underline">Back to channels</button>
  </div></main>;
}
