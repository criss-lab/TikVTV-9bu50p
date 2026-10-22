"""Install a persistent release signing config only when all required CI secrets exist.

Never put signing material in git. Missing secrets leave a clearly labeled preview
build using Flutter's generated debug key, not a falsely advertised release.
"""
import os
from pathlib import Path

names = ("ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD")
values = [os.environ.get(name, "") for name in names]
if not any(values):
    print("No production signing secrets: preview-only debug-key signing")
    raise SystemExit(0)
if not all(values):
    raise SystemExit("Incomplete release signing configuration; refusing ambiguous signing")
import base64
import binascii
store = Path("android/app/release-upload.jks")
try:
    store.write_bytes(base64.b64decode(values[0], validate=True))
except (binascii.Error, ValueError) as error:
    raise SystemExit(f"Invalid base64 keystore: {error}")
if not store.stat().st_size:
    raise SystemExit("Empty release keystore")
properties = Path("android/key.properties")
# Secrets may contain special characters; Java properties escape backslashes.
def escape(value):
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace("\r", "\\r")
properties.write_text(
    "storeFile=release-upload.jks\n"
    + "storePassword=" + escape(values[1]) + "\n"
    + "keyAlias=" + escape(values[2]) + "\n"
    + "keyPassword=" + escape(values[3]) + "\n"
)
gradle = Path("android/app/build.gradle.kts")
source = gradle.read_text()
anchor = "android {"
if anchor not in source:
    raise SystemExit("Generated Gradle file missing android block")
source = source.replace(anchor, """val releaseSigning = java.util.Properties().apply {
    load(rootProject.file("key.properties").inputStream())
}
""" + anchor, 1)
source = source.replace("    buildTypes {", """    signingConfigs {
        create("production") {
            storeFile = file(releaseSigning.getProperty("storeFile"))
            storePassword = releaseSigning.getProperty("storePassword")
            keyAlias = releaseSigning.getProperty("keyAlias")
            keyPassword = releaseSigning.getProperty("keyPassword")
        }
    }
    buildTypes {""", 1)
source = source.replace("signingConfig = signingConfigs.getByName(\"debug\")", "signingConfig = signingConfigs.getByName(\"production\")")
if 'signingConfigs.getByName("production")' not in source:
    raise SystemExit("Could not wire production signing into release build")
gradle.write_text(source)
print("Persistent production signing configured")
