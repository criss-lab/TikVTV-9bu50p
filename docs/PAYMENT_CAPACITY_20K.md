# Payment backend capacity target: 20,000 accounts

The 20,000 figure is a registered-account planning target, NOT a measured
concurrent-payment throughput claim.

## Low-cost configuration
- Keep one small Render API instance initially. Set PG_POOL_MAX=5 by default.
  Total Postgres connections = Render instances x PG_POOL_MAX, plus migration,
  admin and other consumers. Raise only after monitoring Neon limits.
- Use Neon's pooled connection endpoint for short API transactions. Keep a
  separate direct connection only where required by migrations.
- Configure Render autoscaling only with a documented global database
  connection budget; avoid multiplying pools without increasing capacity.
- Keep PesaPal status checks out of playback hot paths. The current
  activeEntitlement() can query up to five pending orders and invoke remote
  PesaPal verification during an ordinary access check; replace this with
  bounded background reconciliation and immediate post-checkout status polling.
  Do not remove payment recovery before its replacement is tested.
- Implement transactional outbox replication to the private Infinity VPN
  Supabase billing schema before enabling read failover. Never use Supabase
  as an unverified independent payment writer.
- Add per-account rate limiting for checkout and payment status, and IPN
  concurrency limits. Preserve idempotency on retries.
- Monitor p50/p95/p99 response times, DB pool wait, Neon connection errors,
  checkout conversion, IPN backlog, outbox lag and entitlement divergence.
- Load-test at 100, 500, then 1,000 concurrent authenticated access checks,
  separately from PesaPal sandbox payments. Do not hammer the live provider.
- Test 20,000 seeded accounts with realistic burst traffic, expiry and
  renewal concurrency. Only claim capacity after passing measurements.

This branch introduces bounded DB timeouts and hot-path indexes. It does not
claim to implement all of the above or change the production deployment.
