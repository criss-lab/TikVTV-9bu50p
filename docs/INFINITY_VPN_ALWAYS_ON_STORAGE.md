# Always-ready VPN and storage limits

## Android behavior
The VPN should remain connected and idle while awaiting traffic, not start a
new tunnel for every channel. Once the user explicitly grants Android VPN
permission and enables the feature, use a native foreground VpnService with
a persistent notification and WireGuard tunnel. Offer a clear disconnect
control. Guide the user to Android Settings > Network & Internet > VPN >
Infinity VPN > Always-on VPN; the app cannot silently enable this setting.
Use the OS onRevoke callback, handle network changes and tunnel recovery
with bounded backoff, and never bypass consent or keep a hidden VPN running.
A Dart MethodChannel alone cannot provide an actual always-on VPN.

## Storage hygiene
The app cache housekeeper deletes only immediate regular files under a
dedicated disposable cache directory, never following symlinks. Default:
remove files older than 48 hours and cap retained disposable files at 32 MiB.
Schedule cleanup on app startup and periodic maintenance without blocking
playback. Do not delete VPN keys, saved configurations, subscription state,
downloads or user media.

For the Supabase backend, use a reviewed scheduled retention job for
expired *ephemeral* gateway heartbeats, stale non-security telemetry and
completed temporary jobs, in small indexed batches. Retain payment receipts,
billing audit history and required security records under explicit policies;
do not apply a generic delete to private schemas. Monitor database size,
WAL growth, storage and job failures. Avoid storing traffic payloads or
per-request VPN connection logs by default.

Status: Dart cache utility and optimizer committed; native WireGuard
VpnService, OS always-on support, actual maintenance scheduling and backend
retention job remain to be implemented and tested.
