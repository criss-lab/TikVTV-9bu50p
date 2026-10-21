import { supabase } from '@/lib/supabase';

export const PREMIUM_CHANGED = 'tikvtvz:premium-changed';
export async function getPremiumAccess(userId: string) {
  const { data, error } = await supabase.from('premium_subscriptions').select('ends_at')
    .eq('user_id', userId).eq('status', 'active').gt('ends_at', new Date().toISOString())
    .order('ends_at', { ascending: false }).limit(1);
  if (error) throw error;
  return { active: !!data?.length, endsAt: data?.[0]?.ends_at ?? null };
}
export function notifyPremiumChanged() { window.dispatchEvent(new Event(PREMIUM_CHANGED)); }
export async function invokePesapal(action: 'initiate' | 'check_status', orderTrackingId?: string, planId?: 'half_day' | 'daily' | 'weekly' | 'monthly') {
  const { data, error } = await supabase.functions.invoke('pesapal-payment', { body: { action, ...(orderTrackingId ? { orderTrackingId } : {}), ...(action === 'initiate' ? { appUrl: window.location.origin, planId } : {}) } });
  if (error) throw error;
  return data;
}
