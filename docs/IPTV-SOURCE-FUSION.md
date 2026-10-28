# IPTV source fusion

TikVTV consumes playlist data; it does not copy or merge the source repositories' code.

## Additional playlist feeds

- [iptv-org/iptv](https://github.com/iptv-org/iptv): the existing primary JSON catalogue and categorized/country playlists.
- [Free-TV/IPTV](https://github.com/Free-TV/IPTV): the existing curated playlist.
- [Guovin/iptv-api](https://github.com/Guovin/iptv-api): `https://raw.githubusercontent.com/Guovin/iptv-api/gd/output/result.m3u`
- [shovo127/IPTV-By-Shovo](https://github.com/shovo127/IPTV-By-Shovo): `https://shovo127.github.io/IPTV-By-Shovo/index.m3u`
- [iptv-org/epg](https://github.com/iptv-org/epg): programme-guide tooling/data, not a video stream playlist.

The Guovin and Shovo playlists are imported by both the web catalogue and the shared Flutter catalogue. Existing URL de-duplication prevents the same stream URL from being added twice. The Flutter importer enforces an 8 MiB cap per optional playlist; a larger feed is skipped rather than exhausting memory. Web playback continues to accept only HTTPS URLs whose path is an M3U/M3U8 playlist URL.

## Why this is not a blind merge of 1,000 repositories

A GitHub search result may be a player app, EPG project, scraper, duplicate fork, abandoned repository, or playlist with unauthorized/broken links. Treating every repository as a live source would inflate channel counts, slow startup, and risk publishing streams without distribution rights. Add new playlist sources only after confirming that the repository provides a stable playlist URL and reviewing its terms. Imported public-feed entries are source-tagged discovery entries; they do not become rights-approved subscription catalogue rows merely because they are public on GitHub.

## Verification still required

- Run web quality and Flutter analysis/tests/builds on the pull request.
- Inspect the feeder logs to confirm the new playlist endpoints respond and contain valid M3U entries.
- Verify actual playback separately on Android phone, Android TV, and web; a valid playlist or HTTP 200 does not prove the stream plays.
- Rights review, stream-health verification, and publication approval remain separate gates.
