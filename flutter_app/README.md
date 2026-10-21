# TikVTV for Android and Web 📺

**Discover live channels, keep favorites, and help shape a more reliable streaming experience.**

[⬇️ Direct latest Android preview APK](https://github.com/criss-lab/TikVTV-9bu50p/releases/download/preview-latest/TikVTV-preview.apk) · [SHA-256 checksum](https://github.com/criss-lab/TikVTV-9bu50p/releases/download/preview-latest/SHA256SUMS.txt) · [Latest CI preview artifacts](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-apk.yml) · [Project homepage](../README.md) · [Feedback](https://github.com/criss-lab/TikVTV-9bu50p/issues)

Direct links become available after the first successful main-branch APK build publishes the rolling preview release. Preview APKs are temporary debug-signed builds, not production releases. Verify the SHA-256 checksum and review Android/Play Protect prompts; changing preview signatures can require uninstalling the prior preview before installation.


The Flutter app in `flutter_app/` is the intended **single codebase for Android and Web**. React/Vite remains as a production fallback until Flutter feature parity and playback tests are confirmed.

## Build locally
Install Flutter stable, then from `flutter_app/`:

```sh
flutter create . --platforms=android,web --project-name tikvtv
flutter pub get
flutter analyze
flutter test
flutter build web --release
python3 tool/configure_android.py
flutter build apk --release
```

Flutter Web output is `flutter_app/build/web`; the web workflow supplies the SPA `_redirects` file. Flutter Android uses the same Dart UI, catalogue and player controller. Browser video playback remains subject to supported formats, browser autoplay rules, cross-origin policies and provider availability; Android cleartext permission does not bypass browser CORS.

## Deployment
`.github/workflows/flutter-web.yml` builds Flutter Web on changes and uploads its static artifact. A manual workflow dispatch can deploy to a separate Cloudflare Pages **preview branch** when `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_PROJECT_NAME` are configured. The existing production React workflow is deliberately not replaced until Flutter has feature parity and verified checks.

Current migrated features: shared catalogue with persistence and deduplicated fetch, channel browsing/search, channel detail/player, source fallback, favorites and watch history (local only). Still pending: Supabase account integration, social and clips features, EPG, payments/premium, casting and full visual parity. Do not treat a green build as proof that all external IPTV sources play.
