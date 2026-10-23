import { supabase } from '@/lib/supabase';

export const PREMIUM_CHANGED = 'tikvtvz:premium-changed';
const PAYMENT_API_URL = ((import.meta.env.VITE_PAYMENT_API_URL as string | undefined) || 'https://tikvtv-payment-api.onrender.com').replace(/\/$/, '');

export type PlanCode = 'half_day' | 'day' | 'week' | 'month';

export type PaymentPlan = {
  code: PlanCode;
  amount_kes: number;
  label: string;
  duration_label: string;
  duration_ms: number;
};

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

export async function getPaymentPlans(): Promise<PaymentPlan[]> {
  const response = await fetch(`${PAYMENT_API_URL}/v1/plans`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload?.plans)) {
    throw new Error('Subscription plans are temporarily unavailable. Please try again shortly.');
  }
  const validCodes = new Set<PlanCode>(['half_day', 'day', 'week', 'month']);
  const plans = payload.plans as unknown[];
  const normalized: PaymentPlan[] = [];
  for (const item of plans) {
    if (!item || typeof item !== 'object') continue;
    const plan = item as Record<string, unknown>;
    if (
      !validCodes.has(plan.code as PlanCode) ||
      !Number.isSafeInteger(plan.amount_kes) ||
      Number(plan.amount_kes) <= 0 ||
      !Number.isSafeInteger(plan.duration_ms) ||
      Number(plan.duration_ms) <= 0 ||
      typeof plan.label !== 'string' ||
      !plan.label.trim() ||
      typeof plan.duration_label !== 'string' ||
      !plan.duration_label.trim()
    ) continue;
    normalized.push({
      code: plan.code as PlanCode,
      amount_kes: Number(plan.amount_kes),
      duration_ms: Number(plan.duration_ms),
      label: plan.label,
      duration_label: plan.duration_label,
    });
  }
  if (normalized.length !== 4 || new Set(normalized.map(plan => plan.code)).size !== 4) {
    throw new Error('Subscription plan catalogue is incomplete or inconsistent. Please try again shortly.');
  }
  return normalized;
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
  // Storage notifications wake other tabs without storing credentials or access.
  try { localStorage.setItem(PREMIUM_CHANGED, String(Date.now())); } catch { /* storage may be disabled */ }
}

export type CheckoutResponse = {
  redirect_url: string;
  order_tracking_id: string;
  amount_kes: number;
  plan_code: PlanCode;
};
export type PaymentStatusResponse = {
  payment_status_description: string;
  active: boolean;
  ends_at: string | null;
};

export function invokePesapal(action: 'initiate', orderTrackingId?: undefined, planId?: PlanCode): Promise<CheckoutResponse>;
export function invokePesapal(action: 'check_status', orderTrackingId: string, planId?: undefined): Promise<PaymentStatusResponse>;
export async function invokePesapal(
  action: 'initiate' | 'check_status',
  orderTrackingId?: string,
  planId?: PlanCode,
): Promise<CheckoutResponse | PaymentStatusResponse> {
  if (action === 'initiate') {
    if (!planId) throw new Error('Choose a subscription plan.');
    return paymentRequest<CheckoutResponse>(
      '/v1/checkout',
      { method: 'POST', body: JSON.stringify({ plan_code: planId }) },
    );
  }
  if (!orderTrackingId) throw new Error('Missing payment reference.');
  return paymentRequest<PaymentStatusResponse>(
    '/v1/payment/status',
    { method: 'POST', body: JSON.stringify({ order_tracking_id: orderTrackingId }) },
  );
}

export type ViewingAccessResponse = {
  active: boolean;
  ends_at: string | null;
  preview_ends_at: string;
  allowed: boolean;
  previews_used: number;
  previews_limit: number;
};

/** Server-owned preview deadline shared by the web app and its Capacitor APK. */
export async function getViewingAccess(userId: string, channelId: string): Promise<ViewingAccessResponse> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Could not restore your sign-in session. Please sign in again.');
  if (!data.session?.access_token || data.session.user.id !== userId) {
    throw new Error('Your account session has changed. Please sign in again.');
  }
  return paymentRequest<ViewingAccessResponse>('/v1/viewing-access?channel_id=' + encodeURIComponent(channelId));
}
