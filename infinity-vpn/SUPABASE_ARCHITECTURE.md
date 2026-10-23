# Supabase-only Infinity VPN control plane

Infinity VPN uses project sjaukletmifysfnxktgw for its managed backend:
Auth, Postgres/RLS, Edge Functions, device enrollment, gateway metadata,
short-lived provisioning tickets, health and scheduled retention. Do NOT
create a Render provisioning API or Neon database for VPN operations.
TikVTV payment infrastructure is a separate concern.

## Physical transport boundary
Supabase Edge Functions are HTTP compute, not a Linux WireGuard UDP gateway.
A real VPN still needs a public packet-forwarding endpoint. The scripts under
gateway/ are an optional self-managed Linux WireGuard transport node, not
another managed application backend. Without such an endpoint there is no
working VPN. Do not mark the Flutter bridge connected until the Android
WireGuard engine confirms a tunnel handshake and actual packet forwarding.

## Secure enrollment
The Android device generates its private key locally. Authenticated Edge
Function verifies its identity, checks device quotas, accepts only a public
key, allocates an IP transactionally and creates a pending enrollment record.
A separately authenticated gateway agent pulls pending enrollments, applies
peers to WireGuard and acknowledges success. Only then may the API return
gateway public key, endpoint, allowed routes and allocated IP to the device.
Never put service-role keys or gateway administrator credentials in an APK.
RLS isolates devices by their actual Supabase Auth user ID.

## Always-on and housekeeping
After explicit VPN permission and user opt-in, native Android VpnService and
a real packet engine maintain an idle connected tunnel waiting for traffic.
Android system settings govern Always-on VPN. Supabase Cron should purge only
expired ephemeral health telemetry and provisioning tickets in small batches;
never delete billing receipts, user-owned device registrations or security
audit history through blanket cleanup. The Flutter disposable cache has its
own independent age/size limits.

Status: architecture correction. Supabase enrollment Edge Function and
gateway agent are not yet implemented or deployed. The Linux scripts are
not a deployed gateway.
