# Automated IPTV source discovery

TikVTV now has an automated, scheduled GitHub playlist discovery pipeline. It searches public GitHub repository metadata, inspects repository trees/README files for actual M3U/M3U8 playlist files, fetches each candidate with a strict 1 MiB limit, and only retains playlists whose content begins with `#EXTM3U` and contains `#EXTINF`.

- Workflow: `.github/workflows/iptv-source-discovery.yml` (manual + every 12 hours)
- Script: `scripts/discover-iptv-sources.py`
- Manifest: `public/iptv-sources/discovered.json`
- `status=enabled`: feeds explicitly curated in the script and enabled for client ingestion.
- `status=review_required`: newly discovered feeds. They are measured and listed, but clients do not consume them until reviewed and explicitly enabled.

The manifest is fetched by both the React web catalogue and Flutter catalogue. Existing primary iptv-org API sources and current playlist feeds remain in place. URL-level deduplication is preserved. Newly discovered feeds are not treated as subscription entitlements.

**Important:** "all GitHub repositories" cannot be a finite, stable list—new repos appear constantly and many search results are forks, players, tools, EPGs, dead lists, or copyright-infringing streams. This pipeline automatically discovers candidates rather than claiming every repository is fused. Playlist availability is not proof of rights, and a successful HTTP response is not proof of actual decoder playback. Review source rights before changing a candidate to `enabled`.
