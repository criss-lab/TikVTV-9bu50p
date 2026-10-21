"""Idempotent Android IPTV and foreground media playback configuration."""
from pathlib import Path

manifest = Path("android/app/src/main/AndroidManifest.xml")
if not manifest.exists():
    raise SystemExit("Flutter Android runner missing")
xml = manifest.read_text()
for name in ("INTERNET", "WAKE_LOCK", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MEDIA_PLAYBACK"):
    permission = f'<uses-permission android:name="android.permission.{name}" />'
    if permission not in xml:
        xml = xml.replace("<application", permission + "\n    <application", 1)
if "android:usesCleartextTraffic" not in xml:
    xml = xml.replace("<application", '<application android:usesCleartextTraffic="true"', 1)
xml = xml.replace('android:name=".MainActivity"', 'android:name="com.ryanheise.audioservice.AudioServiceActivity"')
if 'com.ryanheise.audioservice.AudioService"' not in xml:
    service = """
        <service android:name="com.ryanheise.audioservice.AudioService"
            android:foregroundServiceType="mediaPlayback" android:exported="true">
            <intent-filter>
                <action android:name="android.media.browse.MediaBrowserService" />
            </intent-filter>
        </service>
        <receiver android:name="com.ryanheise.audioservice.MediaButtonReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MEDIA_BUTTON" />
            </intent-filter>
        </receiver>
"""
    xml = xml.replace("</application>", service + "    </application>", 1)
manifest.write_text(xml)
print("Android networking and foreground media service configured")
