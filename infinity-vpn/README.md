# Infinity VPN — real transport rollout

The gateway scripts in this directory configure an actual Linux WireGuard
server. This is NOT a Render web service, an HTTP proxy, or a Flutter status
simulation. A dedicated public Linux VM with UDP ingress and root access is
required. No VM has been provisioned or paid for by these commits.

## First gateway
1. Create a dedicated Ubuntu VM with a public IP, record its outbound NIC
   (such as ens3), and allow inbound UDP 51820 in the provider firewall.
   Restrict SSH to administrators. Keep it isolated from the TikVTV payment API.
2. Run bootstrap as root with WG_PUBLIC_ENDPOINT and WG_UPLINK_INTERFACE set.
   The private key is generated locally and kept mode 0600; publish only
   server.pub. Confirm systemctl status wg-quick@wg0 and wg show.
3. Each Android device generates its own WireGuard private key locally and
   sends only the public key to an authenticated provisioning API. That API
   allocates a unique address and calls an authenticated admin provisioner.
   Do not let the mobile app SSH into the gateway or hold a server admin key.
4. The gateway peer provisioning script accepts public key + reserved address
   and persists the peer. The production API must implement rate limits,
   identity checks, peer revocation, IP allocation locking and audit records.
5. Android must integrate a real WireGuard packet engine with VpnService,
   protect the tunnel's own UDP socket to prevent routing loops, request OS
   VPN permission, and establish a foreground tunnel only after consent.
   Never mark connected from VpnService.prepare alone. Verify a real
   handshake and successful public egress on a physical device.
6. Android Always-on is configured by the user in system VPN settings.
   Test boot recovery, Wi-Fi/mobile transitions, DNS/IPv6 leak policy,
   disconnection, onRevoke, battery use and gateway outage. Do not claim
   an always-on VPN before those tests pass.

## Costs and scaling
Begin with one modest VM and measured egress. WireGuard bandwidth and
provider data-transfer fees, not Supabase rows, will dominate VPN costs.
Measure concurrent handshakes, sustained Mbps, packet loss and CPU; add
gateways only after real measurements. Do not route VPN payloads through
Supabase, Render payment API, or Neon.

## Security and retention
Do not log browsing payloads or store client private keys. Use bounded
retention for ephemeral gateway health metrics, not billing receipts or
required security records. Back up provisioning state securely. A second
gateway is needed for high availability; a single VM is a failure domain.

Current status: gateway bootstrap and admin peer script are committed.
Actual VM deployment, authenticated provisioning API, Android WireGuard
engine and end-to-end tunnel tests are NOT complete.
