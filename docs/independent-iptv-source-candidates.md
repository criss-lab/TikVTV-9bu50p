# Independent IPTV candidate sources — staging only

This registry is **not** a production playlist and makes no assertion of net-new channels, playback, or redistribution rights. The existing OnSpaceAI feed, frontend, payment API, and Infinity publication flags remain unchanged. Never bulk-approve streams.

| Candidate | Upstream | Why examine | Caveat |
|---|---|---|---|
| FAST platform catalogues | https://github.com/kineticman/FastChannels | Separate Roku, Samsung, Plex, Xumo, LG, Vizio, TCL and other platform catalogues | This is software, not a redistributable channel license; platform restrictions, session URLs, geo-blocking and DRM require separate review |
| FAST playlist generator | https://github.com/BuddyChewChew/app-m3u-generator | Pluto, Plex, Samsung, Roku and Tubi generated M3U catalogues | Upstream relies heavily on i.mjh.nz and proxies; not independent of each other; no production proxying or bypass |
| IPTV By Shovo | https://shovo127.github.io/IPTV-By-Shovo/index.m3u | Separately maintained playlist for measured comparison | Uses iptv-org-derived framework; likely overlap; review each URL and rights |
| Free-TV | https://github.com/Free-TV/IPTV | Curated baseline and attribution comparison | **Already imported** in Infinity; do not re-add |
| StreamVault | https://github.com/CR-8/StreamVault | Source-pack reference only | **Not a new independent stream source:** explicitly powered by iptv-org |
| iptv-org subsets/forks | https://github.com/iptv-org/iptv | Baseline comparison only | Already imported; subsets and forks must not count as unique new sources |

## Before admitting a candidate to Infinity

1. Obtain the upstream's documented redistribution permission and note any territory/DRM/session restrictions. Free viewing does not equal commercial redistribution permission.
2. In isolated staging, fetch bounded playlist metadata without executing arbitrary URLs or following unsafe redirects. Do not ingest platform tokens or credentials.
3. Preserve exact original URL as source data; compute SHA-256 of the exact URL to compare against Infinity's `url_hash`. Do not strip signed query parameters. Report input records, intra-source unique URLs, overlap with Infinity, and net-new URLs.
4. Compare against the existing frontend catalogue by hash via a separate authorized read-only export; do not alter OnSpaceAI.
5. Manually review rights and browser compatibility; only a later, separate PR may add approved candidates to a public feed.

**Measured Infinity baseline, 2026-10-25:** 30,094 rows, 14,805 distinct URL hashes. Candidate net-new counts are **not measured yet**. A 40K+ distinct target requires more than 10,195 new URLs even under an optimistic no-overlap assumption with a 15K frontend baseline.
