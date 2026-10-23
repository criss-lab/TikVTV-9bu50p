# Infinity VPN × TikVTV integration contract (phase 1)

This branch adds an optional Flutter bridge, **not an active VPN**. No production
traffic is routed through it until the native module and gateway are implemented,
reviewed and device-tested.

## Android contract

MethodChannel: `com.infinity.vpn/tunnel`

- `status` returns `connected`, `connecting`, `permission_required` or `disconnected`.
- `connect` must obtain Android `VpnService.prepare` consent, then provision a
  user-owned peer through the Infinity VPN backend and start a foreground
  WireGuard VPN service. Return `connected` only after a verified handshake
  and route/DNS checks; otherwise return `permission_required` or raise a
  `PlatformException`.
- `disconnect` tears down the native tunnel and clears active state.
- A notification and explicit disconnect control must remain available while
  the VPN is active. Never silently activate a VPN or misrepresent its status.
- Android permits one active VPN service per profile; handle competing VPNs.

## Isolation and deployment

Infinity VPN control-plane project: `sjaukletmifysfnxktgw`. This is separate
from TikVTV's existing Supabase identity/payment infrastructure. Do **not**
replace TikVTV's `SUPABASE_URL`, payment backend, entitlement checks, or
subscription gates with Infinity VPN configuration. The VPN backend must
validate the TikVTV user identity through a trusted server-to-server integration
before allocating a peer. Do not embed service-role keys or shared provisioning
secrets in an APK.

The WireGuard gateway requires a dedicated VM with UDP ingress, IP forwarding,
NAT, DNS and IPv6 leak prevention; Supabase stores control-plane metadata but
does not itself terminate WireGuard tunnels.

## TikVTV playback

VPN connectivity is a user-enabled network option, not a payment/access bypass.
Keep stream-health checks, URL refresh and licensed fallback sources separate.
A VPN cannot revive stale source URLs or grant content rights. Do not create
three simultaneous live video decoders just to preload a feed.

## Release gates

1. Native Android integration + foreground service and consent flow.
2. Authenticated backend peer provisioning, idempotent allocation and revocation.
3. Real gateway deployed with monitored handshakes, DNS and IPv6 checks.
4. Android phone/TV tests: consent, reconnect, process death, logout, switching
   VPN providers, packet loss and TikVTV playback.
5. Flutter analysis/tests and signed APK build green.
