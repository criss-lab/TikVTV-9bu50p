#!/usr/bin/env bash
# Run on a dedicated Ubuntu VPN gateway as root. Requires a publicly reachable
# Linux VM with a static IPv4 address. Never run on the Render payment API.
set -euo pipefail
umask 077
: "${WG_PUBLIC_ENDPOINT:?Set the gateway public DNS name or IPv4 address}"
: "${WG_UPLINK_INTERFACE:?Set the outbound interface (for example ens3)}"
: "${WG_ADDRESS:=10.88.0.1/24}"
: "${WG_PORT:=51820}"
[[ "$WG_PORT" =~ ^[0-9]+$ ]] && (( WG_PORT >= 1 && WG_PORT <= 65535 ))
[[ "$WG_UPLINK_INTERFACE" =~ ^[a-zA-Z0-9_.:-]+$ ]]
[[ "$WG_PUBLIC_ENDPOINT" =~ ^[a-zA-Z0-9.:-]+$ ]]
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends wireguard-tools iptables qrencode
install -d -m 700 /etc/wireguard
if [[ ! -f /etc/wireguard/server.key ]]; then
  wg genkey > /etc/wireguard/server.key
  chmod 600 /etc/wireguard/server.key
  wg pubkey < /etc/wireguard/server.key > /etc/wireguard/server.pub
fi
# Preserve existing peer enrollment when re-running the installer.
if [[ -e /etc/wireguard/wg0.conf ]]; then
  echo "Existing wg0.conf detected; preserving enrolled peers." >&2
  systemctl enable --now wg-quick@wg0
  wg show wg0
  exit 0
fi
private_key="$(cat /etc/wireguard/server.key)"
cat > /etc/wireguard/wg0.conf <<EOF
[Interface]
Address = ${WG_ADDRESS}
ListenPort = ${WG_PORT}
PrivateKey = ${private_key}
SaveConfig = false
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -A POSTROUTING -s 10.88.0.0/24 -o ${WG_UPLINK_INTERFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT; iptables -t nat -D POSTROUTING -s 10.88.0.0/24 -o ${WG_UPLINK_INTERFACE} -j MASQUERADE
EOF
chmod 600 /etc/wireguard/wg0.conf
cat > /etc/sysctl.d/90-infinity-vpn.conf <<EOF
net.ipv4.ip_forward=1
EOF
sysctl --system >/dev/null
systemctl enable --now wg-quick@wg0
wg show wg0
printf '\nGateway public key (safe to distribute):\n'
cat /etc/wireguard/server.pub
printf '\nOpen UDP %s in your VM provider firewall and configure DNS %s.\n' "$WG_PORT" "$WG_PUBLIC_ENDPOINT"
printf 'Private key stays on this server. Do not commit /etc/wireguard files.\n'
