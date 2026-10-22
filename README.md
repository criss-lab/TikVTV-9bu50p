<div align="center">
visit streamora.co.ke
# 📺 TikVTV
### Discover live TV. Find your channels. Watch in one place.

**An evolving live-TV discovery and viewing experience, with a Flutter Android + Web migration underway.**

[Explore the web experience](https://www.streamora.co.ke) · [Get Android APKs](#-download-tikvtv-for-android) · [Flutter roadmap](flutter_app/README.md) · [Report a problem](https://github.com/criss-lab/TikVTV-9bu50p/issues)

[![Flutter playback checks](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-playback.yml/badge.svg)](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-playback.yml)
[![Android APK](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-apk.yml/badge.svg)](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-apk.yml)
[![Android TV APK](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-tv.yml/badge.svg)](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-tv.yml)
[![Flutter Web](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-web.yml/badge.svg)](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-web.yml)

</div>

## ✨ Why TikVTV?

One place to discover channels, search by name, save favorites, revisit watched channels, and try alternate IPTV feeds when a source fails. TikVTV is being migrated toward a shared Flutter experience on Android and the web. Playback reliability, source recovery and buffering are active engineering priorities—not promises of zero interruptions.

**Discover** channels from a remote catalogue · **Personalize** with locally stored favorites and watch history · **Watch** through a shared player that stops previous playback when switching channels · **Share** channel links.

> **Project status:** Flutter is a migration in progress. The existing React/Vite web application remains a production fallback. External streams depend on providers, network conditions, device/browser codecs and availability. A passing build does not certify every channel.

## 📥 Download TikVTV for Android

**Phone/tablet and Android TV use separate APKs.** The Android TV preview has a separate direct APK download, just like the phone preview. The TV release link becomes active after its first successful publishing run.

**Direct mobile APK and checksum links stay the same when new successful builds update the rolling preview.** The links only become active after the first successful APK workflow publishes its release; a failed build will not be advertised as a downloadable APK.

| Download area | What you get |
| --- | --- |
| **[⬇️ Direct APK: latest Android preview](https://github.com/criss-lab/TikVTV-9bu50p/releases/download/preview-latest/TikVTV-preview.apk)** | Direct download from the rolling preview release, available after its first successful build. |
| **[🔐 APK SHA-256 checksum](https://github.com/criss-lab/TikVTV-9bu50p/releases/download/preview-latest/SHA256SUMS.txt)** | Verify the preview APK before installation. |
| **[📺 ⬇️ Direct Android TV APK download](https://github.com/criss-lab/TikVTV-9bu50p/releases/download/preview-tv-latest/TikVTV-TV-preview.apk)** | Direct download of the dedicated Android TV APK, without visiting Actions or extracting an artifact ZIP. |
| **[🔐 Android TV APK SHA-256 checksum](https://github.com/criss-lab/TikVTV-9bu50p/releases/download/preview-tv-latest/TV-SHA256SUMS.txt)** | Verify the TV APK before installing. |\n| **[🧪 Android TV build status](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-tv.yml)** | Confirm the TV APK compiled and uploaded successfully before installing. |
| **[📦 All releases](https://github.com/criss-lab/TikVTV-9bu50p/releases)** | Latest preview plus version-tagged builds. |
| **[⬇️ Latest preview build runs](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-apk.yml)** | Open a successful run → **Artifacts** → download `TikVTV-preview-<run number>` ZIP → extract `TikVTV-preview.apk`. GitHub sign-in may be required. |
| **[🧪 Android build status](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-apk.yml)** | Check whether the latest APK actually compiled before downloading. |

**TV installation:** Download the dedicated TV APK directly above and transfer it to your Android TV using a trusted method. If the TV release has not been published yet, use the latest successful TV Actions run → Artifacts temporarily. Do not use the phone APK in place of the TV APK.

**Signing and installation:** CI preview APKs are signed using Flutter's generated **temporary debug signing key**, not an official persistent production key. Android may show an unknown-app-source prompt; follow Android's own installation and Play Protect guidance. We do not bypass Play Protect or guarantee approval. Because CI signing keys may change between runs, a newer preview may require uninstalling the previous preview first (back up local app data). Check the provided `SHA256SUMS.txt` against your downloaded APK. Only install files from this repository's trusted release or workflow pages.

**For maintainers:** successful builds on `main` update the `preview-latest` pre-release and direct download link automatically. Push a `v*` tag to publish a GitHub **pre-release** with its preview APK and checksum. A stable production APK requires a persistent, securely stored release signing key, versioning, and independent testing; never commit keystores or passwords.

## 🌍 Help more viewers discover TikVTV

Try the app, share the [project page](https://github.com/criss-lab/TikVTV-9bu50p), star the repository if you find it useful, and send actionable playback reports through [Issues](https://github.com/criss-lab/TikVTV-9bu50p/issues). Include the channel, device, Android/browser version, connection type, and what happened—avoid posting private tokens or stream credentials.

Want to contribute? Improvements to player reliability, accessible navigation, catalogue quality, testing, translations and documentation are welcome. Respect channel-provider rights and applicable streaming terms.

## 🛠️ Technology and development

- **Current web fallback:** React, TypeScript, Vite, Tailwind CSS and shadcn/ui.
- **Flutter migration:** Dart, Flutter, `video_player`, local preferences and remote IPTV catalogue.
- **CI:** Flutter analysis, tests, web builds, mobile Android APK and separate Android TV APK preview artifacts.

```bash
git clone https://github.com/criss-lab/TikVTV-9bu50p.git
cd TikVTV-9bu50p/flutter_app
flutter create . --platforms=android,web --project-name tikvtv
flutter pub get
flutter analyze
flutter test
python3 tool/configure_android.py
flutter build apk --debug
flutter build web --release
```

See [Flutter migration details](flutter_app/README.md) for deployment limitations and feature parity. Please report security issues privately to the maintainers rather than including credentials in public issues.

---

<div align="center">

**Discover · Watch · Share · Improve**

[Android downloads](https://github.com/criss-lab/TikVTV-9bu50p/releases) · [Build artifacts](https://github.com/criss-lab/TikVTV-9bu50p/actions/workflows/flutter-apk.yml) · [Contribute feedback](https://github.com/criss-lab/TikVTV-9bu50p/issues)

</div>
