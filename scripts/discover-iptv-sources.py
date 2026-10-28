#!/usr/bin/env python3
"""Discover GitHub IPTV playlist candidates without auto-approving rights or streams.

Known, explicitly curated feeds are enabled. Newly found repositories are written
as review_required candidates until a maintainer validates source quality and rights.
"""
import json, os, re, sys, time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

API = "https://api.github.com"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "TikVTV-IPTV-Source-Discovery"}
if TOKEN:
    HEADERS["Authorization"] = f"Bearer {TOKEN}"
MAX_REPOS = int(os.environ.get("IPTV_DISCOVERY_MAX_REPOS", "20"))
MAX_PLAYLISTS_PER_REPO = 2
MAX_PLAYLIST_BYTES = 1024 * 1024
TRUSTED = {
    "free-tv/iptv": ("freetv", "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8"),
    "guovin/iptv-api": ("guovin-api", "https://raw.githubusercontent.com/Guovin/iptv-api/gd/output/result.m3u"),
    "shovo127/iptv-by-shovo": ("shovo-public", "https://shovo127.github.io/IPTV-By-Shovo/index.m3u"),
}
SEARCHES = [
    'iptv playlist m3u in:name,description',
    'free tv playlist m3u in:name,description',
    'topic:iptv m3u playlist',
]
URL_RE = re.compile(r'https://(?:raw\.githubusercontent\.com|[\w.-]+\.github\.io)/[^\s<>\\"\']+?\.(?:m3u8?|m3u)(?:\?[^\s<>\\"\']*)?', re.I)

def get(url, accept=None, limit=None):
    headers = dict(HEADERS)
    if accept: headers["Accept"] = accept
    req = Request(url, headers=headers)
    with urlopen(req, timeout=12) as resp:
        data = resp.read(limit + 1 if limit else None)
        if limit and len(data) > limit:
            raise ValueError("response too large")
        return data

def probe(url):
    try:
        body = get(url, "text/plain,application/vnd.apple.mpegurl,*/*", MAX_PLAYLIST_BYTES).decode("utf-8-sig", "replace")
        return body.lstrip().startswith("#EXTM3U") and "#EXTINF" in body, body.count("#EXTINF")
    except Exception:
        return False, 0

def playlist_urls_for_repo(full_name, default_branch):
    urls = set()
    # First inspect repository tree for actual playlist files; do not infer from repo name alone.
    try:
        tree = json.loads(get(f"{API}/repos/{full_name}/git/trees/{quote(default_branch, safe='') }?recursive=1", "application/vnd.github+json"))
        for item in tree.get("tree", []):
            path = item.get("path", "")
            if item.get("type") != "blob" or not re.search(r'\.(?:m3u8?|m3u)$', path, re.I):
                continue
            if any(part.lower() in {"node_modules", "vendor", "dist", "build", "test", "tests", "samples"} for part in path.split("/")):
                continue
            urls.add(f"https://raw.githubusercontent.com/{full_name}/{quote(default_branch, safe='')}/{quote(path, safe='/')}")
            if len(urls) >= MAX_PLAYLISTS_PER_REPO:
                break
    except Exception:
        pass
    # Also accept explicitly linked hosted playlists in README, still subject to content probing.
    if len(urls) < MAX_PLAYLISTS_PER_REPO:
        try:
            readme = get(f"{API}/repos/{full_name}/readme", "application/vnd.github.raw").decode("utf-8", "replace")
            for url in URL_RE.findall(readme):
                urls.add(url.rstrip(").,;"))
                if len(urls) >= MAX_PLAYLISTS_PER_REPO:
                    break
        except Exception:
            pass
    return sorted(urls)

def main():
    repositories = {}
    for query in SEARCHES:
        try:
            endpoint = f"{API}/search/repositories?q={quote(query)}&sort=stars&order=desc&per_page=50"
            payload = json.loads(get(endpoint, "application/vnd.github+json"))
            for repo in payload.get("items", []):
                name = repo.get("full_name", "")
                if not name or repo.get("fork") or repo.get("archived") or repo.get("disabled"):
                    continue
                if repo.get("stargazers_count", 0) < 2:
                    continue
                repositories[name.lower()] = repo
        except Exception as exc:
            print(f"search warning: {query}: {exc}", file=sys.stderr)
        time.sleep(1)

    curated = []
    candidates = []
    for full_name, (tag, url) in TRUSTED.items():
        ok, entries = probe(url)
        curated.append({"id": tag, "url": url, "repository": full_name,
                        "status": "enabled" if ok else "review_required",
                        "playlistEntries": entries, "sourceType": "curated",
                        "checkedAt": datetime.now(timezone.utc).isoformat()})
    for repo in sorted(repositories.values(), key=lambda r: r.get("stargazers_count", 0), reverse=True)[:MAX_REPOS]:
        full_name = repo["full_name"]
        if full_name.lower() in TRUSTED:
            continue
        for index, url in enumerate(playlist_urls_for_repo(full_name, repo.get("default_branch") or "main")):
            ok, entries = probe(url)
            if not ok:
                continue
            candidates.append({
                "id": re.sub(r"[^a-z0-9_-]+", "-", f"gh-{full_name}-{index}").lower()[:90],
                "url": url, "repository": full_name, "status": "review_required",
                "playlistEntries": entries, "sourceType": "discovered",
                "stars": repo.get("stargazers_count", 0),
                "license": (repo.get("license") or {}).get("spdx_id"),
                "checkedAt": datetime.now(timezone.utc).isoformat(),
            })
    # URL-level dedupe and cap output size. Discovery never grants rights approval.
    seen = set()
    result = []
    for item in curated + candidates:
        if item["url"] in seen: continue
        seen.add(item["url"])
        result.append(item)
    out = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "policy": "Only status=enabled feeds are consumed by clients. Newly discovered feeds remain review_required; HTTP reachability is not proof of distribution rights or continuous playback.",
        "searchedRepositories": len(repositories),
        "enabledSources": sum(1 for item in result if item["status"] == "enabled"),
        "reviewRequiredSources": sum(1 for item in result if item["status"] == "review_required"),
        "sources": result,
    }
    os.makedirs("public/iptv-sources", exist_ok=True)
    with open("public/iptv-sources/discovered.json", "w", encoding="utf-8") as file:
        json.dump(out, file, indent=2, ensure_ascii=False)
        file.write("\n")
    print(f"Discovered {len(repositories)} repositories; wrote {len(result)} unique feeds "
          f"({out['enabledSources']} enabled, {out['reviewRequiredSources']} awaiting review).")

if __name__ == "__main__":
    main()
