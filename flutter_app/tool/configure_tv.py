"""Configure a generated Flutter Android runner as a separate Android TV application."""
from pathlib import Path

manifest = Path("android/app/src/main/AndroidManifest.xml")
if not manifest.exists():
    raise SystemExit("Generate the Flutter Android runner before configuring TV")
xml = manifest.read_text()
if 'android.software.leanback' not in xml:
    xml = xml.replace("<application", '<uses-feature android:name="android.software.leanback" android:required="true" />\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n    <application', 1)
if 'android.intent.category.LEANBACK_LAUNCHER' not in xml:
    xml = xml.replace('<category android:name="android.intent.category.LAUNCHER"/>', '<category android:name="android.intent.category.LEANBACK_LAUNCHER"/>')
    xml = xml.replace('<category android:name="android.intent.category.LAUNCHER" />', '<category android:name="android.intent.category.LEANBACK_LAUNCHER" />')
if 'android:screenOrientation="landscape"' not in xml:
    xml = xml.replace('android:exported="true"', 'android:exported="true" android:screenOrientation="landscape"', 1)
manifest.write_text(xml)
gradle = Path("android/app/build.gradle.kts")
if not gradle.exists():
    raise SystemExit("Expected generated Flutter Kotlin Gradle configuration")
code = gradle.read_text().replace('applicationId = "com.example.tikvtv"', 'applicationId = "com.tikvtvz.app.tv"')
if 'com.tikvtvz.app.tv' not in code:
    raise SystemExit("TV application ID replacement failed; inspect generated Gradle file")
gradle.write_text(code)
print("Dedicated TV launcher, landscape and package identity configured")
