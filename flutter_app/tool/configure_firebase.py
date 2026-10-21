"""Configure the generated Android runner for the matching Firebase Android app."""
import json
from pathlib import Path

config = Path("android/app/google-services.json")
if not config.is_file():
    raise SystemExit("Missing android/app/google-services.json")
data = json.loads(config.read_text())
expected = "Com.TikVTVz.app"
if not any(c.get("client_info", {}).get("android_client_info", {}).get("package_name") == expected for c in data.get("client", [])):
    raise SystemExit("Firebase Android package mismatch")

gradle = Path("android/app/build.gradle.kts")
if not gradle.exists():
    raise SystemExit("Expected generated Kotlin Gradle Android runner")
source = gradle.read_text()
if 'id("com.google.gms.google-services")' not in source:
    source = source.replace("plugins {", 'plugins {\n    id("com.google.gms.google-services")', 1)
source = source.replace('applicationId = "com.example.tikvtv"', 'applicationId = "Com.TikVTVz.app"')
source = source.replace('namespace = "com.example.tikvtv"', 'namespace = "com.example.tikvtv"')
if 'applicationId = "Com.TikVTVz.app"' not in source:
    raise SystemExit("Could not verify Android applicationId")
gradle.write_text(source)
settings = Path("android/settings.gradle.kts")
s = settings.read_text()
if 'id("com.google.gms.google-services") version' not in s:
    s = s.replace("plugins {", 'plugins {\n    id("com.google.gms.google-services") version "4.4.2" apply false', 1)
settings.write_text(s)
print("Firebase Android applicationId and Google Services plugin configured")
