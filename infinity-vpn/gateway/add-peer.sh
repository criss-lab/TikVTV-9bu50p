#!/usr/bin/env bash
# Admin-only peer provisioning on the VPN VM; does not generate client secrets.
# Usage: sudo ./add-peer.sh <client-public-key> <unique-ipv4-address>
set -euo pipefail
umask 077
(( EUID == 0 )) || { echo 'Run as root' >&2; exit 1; }
(( $# == 2 )) || { echo 'Usage: add-peer.sh PUBLIC_KEY 10.88.0.X' >&2; exit 1; }
key="$1"; address="$2"
[[ "$key" =~ ^[A-Za-z0-9+/]{43}=$ ]] || { echo 'Invalid WireGuard public key' >&2; exit 1; }
[[ "$address" =~ ^10\.88\.0\.([0-9]{1,3})$ ]] || { echo 'Address must be in 10.88.0.0/24' >&2; exit 1; }
last="${BASH_REMATCH[1]}"
(( 10#$last >= 2 && 10#$last <= 254 )) || { echo 'Reserved or invalid peer address' >&2; exit 1; }
config=/etc/wireguard/wg0.conf
[[ -f "$config" ]] || { echo 'Gateway is not initialized' >&2; exit 1; }
if grep -Fq "PublicKey = $key" "$config" || grep -Fq "AllowedIPs = $address/32" "$config"; then
  echo 'Peer key or address already provisioned' >&2; exit 1
fi
# Persist first; only one admin provisioner may hold this file lock.
exec 9>/run/infinity-vpn-peer.lock
flock -x 9
if grep -Fq "PublicKey = $key" "$config" || grep -Fq "AllowedIPs = $address/32" "$config"; then
  echo 'Peer key or address already provisioned' >&2; exit 1
fi
printf '\n[Peer]\nPublicKey = %s\nAllowedIPs = %s/32\n' "$key" "$address" >> "$config"
chmod 600 "$config"
wg set wg0 peer "$key" allowed-ips "$address/32"
echo 'Peer provisioned. Configure its private key ONLY on its device.'
