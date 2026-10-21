import { supabase } from '@/lib/supabase';

export const PREMIUM_CHANGED = 'tikvtvz:premium-changed';
const PAYMENT_API = (import.meta.env.VITE_PAYMENT_API_URL || 'https://tikvtv-payment-api.onrender.com').replace(/\/$/, '');

async function paymentRequest(path: string, body?: Record<string, unknown>) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sign in to your TikVTV account first.');
  const response = await fetch(PAYMENT_API + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Payment service unavailable');
  return result;
}

export async function getPremiumAccess(_userId: string) {
  const data = await paymentRequest('/v1/subscription');
  return { active: data.active === true, endsAt: data.ends_at ?? null };
}
export function notifyPremiumChanged() { window.dispatchEvent(new Event(PREMIUM_CHANGED)); }
export async function invokePesapal(action: 'initiate' | 'check_status', orderTrackingId?: string, planCode = 'month') {
  if (action === 'initiate') return paymentRequest('/v1/checkout', { plan_code: planCode });
  if (!orderTrackingId) throw new Error('Payment tracking reference is required.');
  return paymentRequest('/v1/payment/status', { order_tracking_id: orderTrackingId });
}
