#!/usr/bin/env bash
# Run as root on the dedicated gateway to revoke one enrolled device.
set -euo pipefail
umask 077
[[ $# -eq 1 ]] || { echo "Usage: $0 <wireguard-client-public-key>" >&2; exit 2; }
key="$1"
[[ "$key" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo "Invalid WireGuard public key" >&2; exit 2; }
config=/etc/wireguard/wg0.conf
[[ -f "$config" ]] || { echo "Gateway is not initialized" >&2; exit 1; }
exec 9>/run/infinity-vpn-peer.lock
flock -x 9
# Update persistent configuration first, then active kernel/userspace peer table.
tmp="$(mktemp /etc/wireguard/.wg0.XXXXXXXX)"
trap 'rm -f "$tmp"' EXIT
awk -v target="$key" '
  /^\[Peer\]$/ { if (block != "") printf "%s", block; block=$0 ORS; peer=1; next }
  peer { block=block $0 ORS; if ($0 ~ /^PublicKey[[:space:]]*=/) { split($0,a,"="); gsub(/[[:space:]]/,"",a[2]); if (a[2]==target) block=""; } next }
  { print }
  END { if (block != "") printf "%s", block }
' "$config" > "$tmp"
chmod 600 "$tmp"
mv "$tmp" "$config"
wg set wg0 peer "$key" remove
echo "Peer revoked"
