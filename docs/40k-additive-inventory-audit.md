# Additive 40K catalogue inventory audit

This is a read-only assessment. Do not change OnSpaceAI, the existing feed, Android Flutter, payment API, Neon entitlements, or publication policy to increase a counter.

## Baseline (Infinity, 2026-10-25)

- 30,094 imported records; 14,805 distinct `url_hash` values; 15,289 repeated records across sources.
- 24,511 HTTPS records; 5,583 HTTP records.
- Zero rights-approved and zero healthy records. These are discovery records, not additional published channels.
- The current frontend count of approximately 15K is observational, not an audited global distinct-URL count.

## Safe, additive sequence

1. Run the following SELECT-only queries on Infinity. Never expose full URLs or database credentials in logs.
2. Compare hashed URLs against existing frontend catalogue through a separate, authorized export; do not modify the existing catalogue.
3. Evaluate prospective new sources in an isolated staging inventory. Record fetched, parsed, accepted, unique, overlap, source rights, and player compatibility independently.
4. Propose a separate integration PR only after rights review and compatibility tests; keep existing feed and payments untouched. No automatic mass approval.

```sql
SELECT count(*) AS imported_records, count(DISTINCT url_hash) AS unique_urls,
       count(*) - count(DISTINCT url_hash) AS repeated_records,
       count(*) FILTER (WHERE rights_status = 'approved') AS rights_approved,
       count(*) FILTER (WHERE health_status = 'healthy') AS healthy
FROM iptv.streams;

SELECT source_id, count(*) AS records, count(DISTINCT url_hash) AS unique_within_source
FROM iptv.streams GROUP BY source_id ORDER BY records DESC;

WITH owners AS (
 SELECT url_hash, min(source_id) AS first_source, count(*) AS appearances
 FROM iptv.streams GROUP BY url_hash
)
SELECT first_source, count(*) AS assigned_unique_urls,
       count(*) FILTER (WHERE appearances > 1) AS also_in_other_sources
FROM owners GROUP BY first_source ORDER BY assigned_unique_urls DESC;
```

## Acceptance criteria

- Existing 15K frontend baseline and playback behavior remain unchanged unless a later PR explicitly demonstrates a safe additive improvement.
- A 40K+ claim counts distinct discovered URLs separately from rights-approved, compatible, and player-confirmed channels.
- No schema mutation, bulk approval, secret exposure, production deployment, or frontend/payment changes in this audit PR.
