# Android phone and TV playback validation

Run the **same test matrix** on a physical Android handset and a physical Android TV/Google TV device. CI compilation and emulator playback do not replace these measurements.

## Preconditions
- Install the APK artifacts from the **same commit**. Preview signing is temporary; uninstall a conflicting older preview if Android reports a certificate mismatch.
- Use a channel and source whose distribution rights have been reviewed. Confirm the same signed-in account and verified viewing entitlement on both devices.
- Record device model, Android version, network type, stream URL host (redact tokens), stream codec, source variant information, and commit SHA.
- Use a router or controlled Wi-Fi access point with reproducible bandwidth and latency shaping. Do not rely on the Android emulator's network presets as the only evidence.

## Matrix (run each case for at least 10 minutes per device)
| Case | Downlink | Added latency | Packet loss | Expected result |
| --- | ---: | ---: | ---: | --- |
| Baseline | Unrestricted | 0 ms | 0% | Record startup time and rebuffer ratio |
| Moderate | 5 Mbps | 60 ms | 0% | Playback remains usable when source bitrate permits |
| Constrained | 2 Mbps | 120 ms | 0% | HLS adaptive source chooses a viable lower variant if offered |
| Severe | 800 kbps | 180 ms | 1% | Recovery is bounded; errors remain actionable |
| Disconnect/reconnect | Offline 15 s then restored | — | — | No leaked player, stuck loading state or unauthorized restart |
| Rapid channel switching | Baseline | 0 ms | 0% | Only one active decoder; previous channel cannot resume |
| Entitlement expires | Baseline | 0 ms | 0% | Video stops and lock UI is shown on both devices |

Record: time to first frame, rebuffer event count, total buffering duration, playback uptime, rebuffer ratio, recovery count, source index, crash/ANR count, and whether audio/video remains synchronized. Repeat three times to distinguish transient source outages from reproducible regressions.

## Release criteria
- flutter analyze, flutter test, phone APK and TV APK builds all pass on the exact release commit.
- No entitlement bypass; a locked channel cannot start or continue playback.
- No crash or ANR in the test matrix; fallback does not loop indefinitely.
- Compare median startup time and rebuffer ratio against the pre-change APK on the **same stream and network profile**. Do not claim zero buffering: external live sources and networks cannot guarantee it.
- Inspect native ExoPlayer logs and verify any proposed buffer configuration on actual Android hardware before changing both builds.
