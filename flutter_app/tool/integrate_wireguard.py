"""WireGuard Android integration for the generated Flutter Android runner.

Use official embeddable tunnel artifact, not a copied/forked cryptographic engine.
Version is pinned and must be validated by the Android APK CI before release.
"""
from pathlib import Path

gradle = Path('android/app/build.gradle.kts')
if not gradle.exists():
    raise SystemExit('Expected generated Kotlin Gradle Android runner')
s = gradle.read_text()
if 'com.wireguard.android:tunnel:' not in s:
    s += '''
// Official WireGuard Android userspace tunnel implementation (Apache-2.0).
dependencies {
    implementation("com.wireguard.android:tunnel:1.0.20260102")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.3")
}
'''
if 'isCoreLibraryDesugaringEnabled = true' not in s:
    s = s.replace('compileOptions {', 'compileOptions {\n        isCoreLibraryDesugaringEnabled = true', 1)
gradle.write_text(s)

manifest = Path('android/app/src/main/AndroidManifest.xml')
xml = manifest.read_text()
# GoBackend owns the VpnService lifecycle; do not register an empty VpnService
# that would win Android's VPN service selection but forward no packets.
start = xml.find('        <service android:name="com.tikvtv.vpn.InfinityVpnService"')
if start >= 0:
    end = xml.find('</service>', start)
    if end < 0:
        raise SystemExit('Malformed old VPN service declaration')
    xml = xml[:start] + xml[end + len('</service>'):]
if 'com.wireguard.android.backend.GoBackend$VpnService' not in xml:
    xml = xml.replace('</application>', '''
        <service android:name="com.wireguard.android.backend.GoBackend$VpnService"
            android:permission="android.permission.BIND_VPN_SERVICE"
            android:exported="false">
            <intent-filter>
                <action android:name="android.net.VpnService" />
            </intent-filter>
        </service>
    </application>''', 1)
manifest.write_text(xml)
print('Official WireGuard tunnel library and GoBackend VpnService installed')
