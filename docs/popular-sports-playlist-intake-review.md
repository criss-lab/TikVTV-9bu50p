# Popular sports playlist intake review

Status: **staging/review only — not a production source**

Date reviewed: 2026-10-31

## Input and limitations

The supplied material is a pasted excerpt headed `#PLAYLIST:Popular Sports IPTV - CODECS.COM`. It is not a stable source URL, and the excerpt ends partway through an ESPN entry. It cannot be re-fetched or exhaustively counted until the complete playlist is provided as a reachable URL or file.

The EPG metadata in the header references these guides:

- `https://epgshare01.online/epgshare01/epg_ripper_US2.xml.gz`
- `https://epgshare01.online/epgshare01/epg_ripper_UA1.xml.gz`
- `https://epgshare01.online/epgshare01/epg_ripper_IT1.xml.gz`
- `https://epgshare01.online/epgshare01/epg_ripper_PL1.xml.gz`
- `https://i.mjh.nz/PlutoTV/all.xml.gz`

These are EPG references, not evidence that every associated stream is licensed, healthy, or available in every territory. Review each provider's terms before commercial use.

## Data-quality flags observed in the supplied excerpt

- Multiple `#EXTINF` lines contain apparent browser user-agent fragments such as `like Gecko) Chrome/149.0.0.0 Safari/537.36` in the channel display metadata. These records need repair from a trusted upstream source rather than automatic string replacement.
- The excerpt is truncated, so the final record cannot be considered complete.
- It mixes HTTPS and plain HTTP endpoints. HTTP streams should be marked insecure and excluded from secure web playback unless there is an approved, documented exception.
- Some links use raw IP addresses, unfamiliar hosts, query-string tracking/advertising values, or apparent premium channel names. These require provenance, ownership/redistribution review, and isolated health testing.
- A channel name, logo, EPG ID, or freely reachable URL does not establish redistribution rights.

## Required staging pipeline

1. Acquire the complete M3U from a stable upstream URL or a user-provided file; record retrieval time and source attribution.
2. Parse each `#EXTINF` record and its following URI as a pair. Reject orphan URLs, malformed metadata, non-HTTP(S) schemes, credentials embedded in URLs, and invalid hostnames.
3. Preserve the exact source URL for provenance and compute a SHA-256 deduplication key from the exact URL. Do not strip query parameters, since they may be required for access or may be short-lived tokens.
4. Report raw entries, syntactically valid entries, unique exact URLs, duplicate URLs, malformed records, HTTP-only candidates, failed probes, and overlap/net-new URLs against the existing catalogue. Do not present input line count as unique channel count.
5. Run bounded, timeout-limited probes in isolated staging. Never execute playlist content, proxy restricted streams, bypass DRM/geo-controls, or copy session credentials into public logs.
6. Keep each record in `unreviewed` until both rights/provenance and playback checks pass. Discovery must not set publication approval.
7. Verify EPG IDs against the selected guide, and retain an explicit mapping report for unmatched IDs. EPG matching is metadata enrichment, not a rights check.

## Acceptance criteria before production

- The full input is available and its origin is documented.
- Parser tests cover malformed lines, duplicate URLs, URL query preservation, orphan URLs, invalid schemes, oversized input, and truncated input.
- Candidate totals and net-new totals are measured against the current catalogue by exact URL hash.
- Rights status, geographic restrictions, HTTPS/browser compatibility, and health are recorded per candidate.
- Existing OnSpaceAI data, payment/entitlement paths, and production publication flags remain untouched by discovery.
- No stream is bulk-approved by this intake process.

## Current result

No streams from this pasted excerpt have been imported or approved by this review. A source URL or complete M3U file is still needed to run reproducible ingestion, deduplication, overlap measurement, and health checks. The excerpt alone is insufficient to claim any net-new channel count.
