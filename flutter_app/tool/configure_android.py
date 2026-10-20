"""Idempotent Android IPTV networking configuration after flutter create."""
from pathlib import Path
manifest = Path("android/app/src/main/AndroidManifest.xml")
if not manifest.exists():
    raise SystemExit("Flutter Android runner missing")
xml = manifest.read_text()
permission = '<uses-permission android:name="android.permission.INTERNET" />'
if permission not in xml:
    xml = xml.replace("<application", permission + "\n    <application", 1)
if "android:usesCleartextTraffic" not in xml:
    xml = xml.replace("<application", '<application android:usesCleartextTraffic="true"', 1)
manifest.write_text(xml)
print("Android networking configured")
