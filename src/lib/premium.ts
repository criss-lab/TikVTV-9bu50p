import { supabase } from '@/lib/supabase';

export const PREMIUM_CHANGED = 'tikvtvz:premium-changed';
const PAYMENT_API_URL = (import.meta.env.VITE_PAYMENT_API_URL as string | undefined || 'https://tikvtv-payment-api.onrender.com').replace(/\/$/, '');

type PlanCode = 'half_day' | 'day' | 'week' | 'month';

async function paymentRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Could not restore your sign-in session. Please sign in again.');
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Sign in to continue.');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${PAYMENT_API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'Payment service is temporarily unavailable.';
    throw new Error(message);
  }
  return payload as T;
}

export async function getPremiumAccess(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Could not restore your sign-in session. Please sign in again.');
  if (!data.session?.access_token || data.session.user.id !== userId) {
    throw new Error('Your account session has changed. Please sign in again.');
  }
  const result = await paymentRequest<{ active: boolean; ends_at: string | null }>('/v1/subscription');
  return { active: result.active === true, endsAt: result.ends_at ?? null };
}

export function notifyPremiumChanged() {
  window.dispatchEvent(new Event(PREMIUM_CHANGED));
}

export async function invokePesapal(
  action: 'initiate' | 'check_status',
  orderTrackingId?: string,
  planId?: PlanCode,
) {
  if (action === 'initiate') {
    if (!planId) throw new Error('Choose a subscription plan.');
    return paymentRequest<{ redirect_url: string; order_tracking_id: string; amount_kes: number; plan_code: PlanCode }>(
      '/v1/checkout',
      { method: 'POST', body: JSON.stringify({ plan_code: planId }) },
    );
  }
  if (!orderTrackingId) throw new Error('Missing payment reference.');
  return paymentRequest<{ payment_status_description: string; active: boolean; ends_at: string | null }>(
    '/v1/payment/status',
    { method: 'POST', body: JSON.stringify({ order_tracking_id: orderTrackingId }) },
  );
}
