# TikVTV payment architecture and operations

## Ownership boundaries

- **Supabase** remains the identity provider and normal application backend: authentication, sessions, profiles, reactions, comments, and other non-payment features.
- **Render payment API** is the only client-facing payment service. It validates Supabase bearer tokens against Supabase Auth before accepting checkout, status, or subscription requests.
- **Neon PostgreSQL** stores payment orders, verified PesaPal event records, and premium subscription expiries. Web and Flutter clients must not read or write premium entitlements directly in Supabase.
- **PesaPal** collects payment and supplies transaction status. The backend verifies the transaction server-to-server before activating access.

## Plans

The server owns the authoritative prices and durations:

| Plan code | Price | Duration |
| --- | ---: | --- |
| `half_day` | KSh 5 | 12 hours |
| `day` | KSh 10 | 24 hours |
| `week` | KSh 40 | 7 days |
| `month` | KSh 130 | 30 days |

Clients submit only the plan code; the server calculates the amount and duration.

## API contract

- `POST /v1/checkout`: requires a valid Supabase bearer token and a plan code. Creates a pending Neon order and returns the PesaPal redirect URL.
- `POST /v1/payment/status`: requires a valid bearer token and order tracking ID. Checks order ownership and independently asks PesaPal for the transaction status.
- `GET /v1/subscription`: returns the authenticated user's active Neon entitlement and expiry.
- `GET /pesapal/ipn`: verifies notifications server-to-server and records/activates the matching order idempotently.
- `GET /pesapal/readiness`: reports ready only when Neon, the payment schema, Supabase token validation configuration, and PesaPal credentials are available.

Do not accept a client-supplied user ID, amount, payment status, or expiry as authoritative. A callback's tracking ID and merchant reference must identify the same order. Failed, reversed, cancelled, pending, or mismatched transactions must never grant access.

## Database migration and deployment

The Neon schema is defined in `payment-backend/schema.sql`. The repeatable migration command is `npm run migrate` from `payment-backend`; it uses the server-only `DATABASE_URL` and verifies that all three required tables exist. The Render secret-sync workflow maps GitHub's `NEON_DATABASE_URL` to Render's `DATABASE_URL`, preserves the Supabase URL/key needed for token validation, sets the registered PesaPal IPN to the live environment, deploys, and requires live readiness.

Required GitHub Actions secrets include `Render_api_secret`, `NEON_DATABASE_URL`, `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`. Never put PesaPal consumer credentials or the Neon connection string in Vite variables, source code, logs, or the Android APK.

## Validation

The payment-backend quality workflow checks Node syntax and runs plan regression tests. Before production release, also run a real low-value live payment end-to-end, verify the PesaPal callback/IPN, confirm the matching Neon order and expiry, test duplicate/out-of-order callbacks, and verify that access expires server-side. A successful readiness check proves dependencies and schema are reachable; it does not by itself prove a real payment has been processed.
