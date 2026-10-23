# TikVTV two-stage channel teaser — implementation contract

## Required journey
- A first-install guest receives exactly three **distinct channel** preview allocations, each lasting fifteen wall-clock minutes from first server-authorized playback.
- Successful account creation unlocks **seven additional distinct channel** preview allocations, each with an independent fifteen-minute immutable deadline. The original guest channel IDs are excluded from the seven.
- Existing subscriptions take priority and unlock the full catalogue; never alter KES 5 / 13-hour or KES 10 / 24-hour pricing or payment activation.
- Once a channel deadline expires it never resets on pause, swipe, logout, app restart or reinstall. Exhausting the available channel allocations locks unallocated channels; previously allocated channels remain playable only until their own deadline.
- Guest expiry prompts sign-up; registered expiry prompts Premium. No automatic charge.

## Enforcement (not client-only)
- Payment API owns guest and account allocations in durable storage; Flutter and web consume server-issued decisions and expiry timestamps, never mint trials from local preferences.
- Anonymous installations need an opaque random installation credential, created using cryptographic randomness, stored in platform secure storage, and sent only over HTTPS. Store its hash on the server; do not treat an ordinary device ID or localStorage key as an entitlement proof. Reinstallation cannot be made strictly tamper-proof without device attestation and abuse controls; do not claim otherwise.
- Server atomically allocates each first-view channel under a per-guest/per-account transaction lock and unique key, with explicit limits 3 and 7. A guest-to-account claim must be atomic, single-use, and bound to the authenticated Supabase user, retaining guest channel IDs so the seven are genuinely additional.
- A previously paid account never falls back into a new free preview after subscription expiry. Existing accounts need an explicit migration/eligibility policy, not an accidental reset.
- Fail closed for unverified new allocations; retain only an unexpired, previously verified server deadline during temporary outages.
- Web and Capacitor/Flutter clients must use the same authoritative API. Guest preview streams must be protected by the same playback authorization as signed-in streams; hiding a lock overlay is not enforcement.

## Acceptance tests
1. Fresh guest: three distinct channels granted, fourth rejected; each expires exactly 15 minutes after allocation.
2. Switching/restarting does not reset expiry; concurrent first views cannot allocate a fourth.
3. Sign-up: same guest credential claims once; seven new channel IDs granted, eighth rejected; no overlap with guest three.
4. Another account cannot claim the same guest allocation. Logout/login and concurrent devices cannot reset signed-in previews.
5. Paid subscription unlocks all channels immediately and remains active across logout/login until its verified deadline; expiry re-locks.
6. Offline/new device or tampered local storage never creates a new server entitlement.
7. Both Android APK and web app display accurate stage-specific CTA and lock the actual player, not only the UI.
