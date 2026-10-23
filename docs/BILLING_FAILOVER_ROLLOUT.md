# TikVTV subscription failover: controlled rollout

Project: Infinity VPN Supabase `sjaukletmifysfnxktgw`.
Private tables: `billing_private.subscription_replica`,
`billing_private.replication_receipts`.

The adapter in `payment-backend/billing-replica.js` is read-only and is NOT
wired into production routes. Do not enable failover before the following
safety gates are implemented and tested.

## Forensic findings
- The current Neon `subscriptions` row is overwritten on renewal, and its
  `source_order_id` points only to the latest order.
- Therefore naive `ON CONFLICT` replication of the current row can lose an
  earlier renewal if asynchronous writes arrive out of order.
- Payment verification currently commits to Neon and returns immediately.
  Replication must be durable and retried even if Supabase is down.
- Viewing-access and TV access both query Neon for historical paid state;
  merely adding a fallback to `GET /v1/subscription` would leave the blocker
  and TV access broken during an outage.
- Free-preview counters live only in Neon. During Neon outage, do not invent
  preview balances or reset 15-minute deadlines.

## Required rollout
1. Add a Neon transactional outbox row in the SAME transaction as verified
   payment activation. Use the order's stable merchant reference as the
   idempotency key. Never accept client-declared completed status.
2. Backfill historical verified orders and their resulting entitlements.
   Reconcile against Pesapal for discrepancies; do not infer paid status.
3. Replica writer must apply ordered monotonic revisions under a transaction
   and record replication receipts; delayed older events must not overwrite a
   newer subscription expiry. Preserve the authoritative expiry rather than
   extending it on replay.
4. Use a separate, restricted Postgres credential for the private replica.
   Configure `BILLING_REPLICA_DATABASE_URL` only on the Render backend, never
   as a Vite/Flutter variable. Keep Supabase Auth validation pointed at the
   EXISTING TikVTV identity project, not Infinity VPN.
5. After successful backfill and measured lag, add an opt-in feature flag for
   bounded fallback reads on Neon connectivity/throttling errors ONLY.
   Authentication failures and logical SQL/schema errors must not silently
   switch stores. Never fall back to a stale record if revocation/refund is
   unreplicated; define and monitor a maximum acceptable replication lag.
6. Apply the same entitlement resolver to web, phone, and TV viewing access.
   Fail closed on missing/unhealthy data, without granting fresh previews.
7. Test expired rows, duplicate/out-of-order IPNs, renewal stacking, reversal,
   Neon outage, Supabase outage, both-down, recovery, and concurrency.
8. Monitor replication lag, outbox backlog, fallback reads, and divergence;
   enable a kill switch before production rollout.

No deployment, migration of actual subscriptions, or live failover is claimed
by this branch.
