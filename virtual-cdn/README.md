# Virtual CDN: production scaling gates

This directory is an opt-in **single-process cache core**, not a deployed CDN or a replacement player. It must not be mounted into the payment API or made the default playback URL without separate review. Existing Flutter phone, Android TV and website playback must remain operational and retain direct-source fallback.

## Scale-out design

1. Ingest only channels with documented caching and redistribution approval. Keep manifests and segment authorization separate; do not proxy arbitrary URLs, signed origin URLs, cookies, DRM keys, or credentials.
2. Validate each viewer's current entitlement at the virtual cache gateway before serving a cache hit or miss. Use trusted server-assigned tenant/channel/rights scope. Do not accept cache scope from a client.
3. Run replicated software-defined virtual cache processes behind a conventional load balancer. Deduplicate identical segment fetches within each process; optional shared origin shielding requires a separate, explicitly approved design. This module deduplicates only within ONE process; it is not a distributed lock or a shared cache.
4. Use immutable segment keys incorporating channel, rendition, sequence/discontinuity, authorized scope and origin identity. Give live playlists very short TTLs, segments bounded TTLs, and revoke/evict on rights changes. Never cache personalized manifests, cookies or keys.
5. Autoscale virtual cache instances on requests/sec, outbound throughput, origin concurrency, p95 latency, error rate and memory. Provide circuit breakers, origin request budgets and per-viewer quotas. A cache failure must not bypass entitlement checks.
6. Run separate load tests for 1k, 10k, 100k and 1m simulated concurrent viewers with realistic channel popularity, ABR bitrates, cache misses and geographical distribution. Measure actual origin bytes, egress costs, startup latency, rebuffer ratio, cache-hit ratio, 429/5xx and source health. No million-user capacity claim until production-like distributed tests pass.

## Capacity reality

For N concurrent viewers at average delivered bitrate B Mbps, aggregate downstream traffic is approximately N × B Mbps regardless of cache-hit rate. Example: 1,000,000 viewers × 2 Mbps = 2 Tbps of downstream egress before protocol overhead. Caching reduces origin traffic, not viewer egress to zero. Budget egress and seek provider terms before enabling the feature.

## Current core limits

Default 32 MiB per process, 128 entries, 4 MiB per segment, 12 s TTL, 64 distinct in-flight origin requests, 8 s fetch timeout. Identical concurrent requests coalesce even at the distinct-key limit. Overload fails explicitly; a future integration may use direct authorized playback. Metrics are per-process and need aggregation. No HTTP endpoint, deployment, persistent storage or player rewiring is included in this PR. This architecture does not require edge functions, Cloudflare Workers, Supabase Edge Functions, or a managed edge runtime. It still requires real compute and bandwidth; virtual caching cannot eliminate viewer egress.
