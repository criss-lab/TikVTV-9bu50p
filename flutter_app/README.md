# Flutter migration (initial vertical slice)

This is a native Flutter replacement being built alongside the existing React/Capacitor production app. The existing website and CI remain untouched until feature parity and device tests.

Implemented: one singleton catalogue fetch with six-hour in-memory TTL and concurrent request deduplication; all distinct iptv-org source candidates per channel; searchable channel profiles; one shared playback owner that disposes the previous decoder on channel changes; bounded source fallback and visible failures.

Run from this directory after installing Flutter: `flutter pub get && flutter run`. Android/iOS/web platform runners should be generated with `flutter create . --platforms=android,ios,web` before building. This has not been compiled or device-tested here.

Not yet migrated: Supabase auth, reactions, comments, favourites, premium/payments, clips, EPG, country explorer, history, casting, and full existing UI. Not every upstream source is guaranteed playable; provider availability, DRM, platform codecs and geo/CORS restrictions remain external constraints.

Migration increment: persistent offline catalogue cache, refresh action, app background pause/resume, serialized player disposal, and runtime fallback when an already-started stream errors. These changes still require Flutter SDK analysis, compilation and device tests.
