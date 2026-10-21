# TikVTVz PesaPal backend contract

The frontend invokes the authenticated Supabase/OnSpace Edge Function named `pesapal-payment`. **Do not ship PesaPal consumer credentials in Vite variables, the Android APK, or GitHub.** Configure server-only `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, and environment-specific PesaPal API base URL in the backend's secret manager. Credentials from BeroTV must be transferred privately and only if authorized for TikVTVz merchant transactions.

## Required server actions
- `initiate`: identify the user from the verified Authorization JWT, not a request-body userId. Create a unique pending order tied to that user, expected plan, price, and currency; obtain PesaPal bearer token server-side; submit the order with approved callback/IPN URLs; persist tracking ID; return `{redirect_url}`.
- `check_status`: authenticate JWT; look up the provided orderTrackingId in pending orders and verify ownership. Query PesaPal's transaction status API server-to-server. Verify transaction identity, expected amount/currency and merchant, and only then atomically/idempotently grant or extend `premium_subscriptions`. Return `{payment_status_description}`. Never trust a browser query parameter or a client-supplied status as payment evidence.
- IPN: accept PesaPal notifications and independently verify status via PesaPal API. Upsert the transaction and entitlement idempotently; tolerate duplicate/out-of-order callbacks. The callback page is a fallback for delayed IPNs.

## Database / RLS
Use `premium_subscriptions` with `user_id`, `status='active'`, and `ends_at` fields. Allow authenticated users to SELECT only their own subscriptions. Deny direct client INSERT/UPDATE/DELETE of premium entitlements; only the privileged backend grants them. Orders must have a unique tracking ID and unique provider transaction ID, and belong to a single authenticated user.

## Deployment checklist
Configure the function, PesaPal credentials, callback URL `https://<your-app-domain>/payment-callback`, IPN registration, plan price/currency, and database schema on TikVTVz's actual OnSpace backend. Test successful, pending, failed, duplicate IPN, delayed database write, login resume, and expiry. The frontend does not claim payment success until it can read a valid entitlement.


## Implemented edge functions (2026-10-21)
Apply `supabase/migrations/20261021_pesapal_orders.sql` to the **actual** Supabase project, checking compatibility with the existing `premium_subscriptions` schema (must accept inserts of user_id/status/ends_at). Deploy `pesapal-payment` with JWT verification and `pesapal-ipn` without JWT verification. Set secrets server-side: `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `PESAPAL_ENV` (sandbox or live), `PESAPAL_MONTHLY_AMOUNT`, `PESAPAL_CURRENCY`, `APP_ORIGIN` (exact HTTPS site origin), plus Supabase's service-role credentials. Do not use legacy project's backend URL or credentials by default. Configure the web app's `VITE_SUPABASE_URL` and anon key for this same project. PesaPal sandbox uses cybqa.pesapal.com; production uses pay.pesapal.com. Test with sandbox before enabling live credentials. Callback and IPN do not themselves establish payment success: the functions query PesaPal status and check merchant reference, amount and currency. The SQL activation RPC locks orders to avoid duplicate grants. Verify RLS for premium_subscriptions denies client writes. No secrets belong in GitHub.
