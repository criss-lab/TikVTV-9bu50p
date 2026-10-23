#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $# -eq 1 ]] || { echo "Usage: $0 <client-public-key>" >&2; exit 2; }
key="$1"
[[ "$key" =~ ^[A-Za-z0-9+/]{43}=$ ]] || exit 2
config=/etc/wireguard/wg0.conf
[[ -f "$config" ]] || exit 1
exec 9>/run/infinity-vpn-peer.lock
flock -x 9
python3 - "$config" "$key" <<'PY'
import os, pathlib, re, sys, tempfile
path = pathlib.Path(sys.argv[1])
target = sys.argv[2]
text = path.read_text()
blocks = re.split(r'(?=^\[Peer\]\s*$)', text, flags=re.MULTILINE)
kept = []
found = False
for block in blocks:
    if block.startswith('[Peer]'):
        match = re.search(r'^PublicKey\s*=\s*(\S+)\s*$', block, re.MULTILINE)
        if match and match.group(1) == target:
            found = True
            continue
    kept.append(block)
if not found:
    raise SystemExit('Peer not present in persistent configuration')
fd, name = tempfile.mkstemp(prefix='.wg0.', dir=path.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(''.join(kept))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(name, path)
finally:
    if os.path.exists(name):
        os.unlink(name)
PY
wg set wg0 peer "$key" remove
echo "Peer revoked"
