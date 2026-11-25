#!/usr/bin/env bash
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export ANDROID_USER_HOME="$RUNNER_TEMP/market-flow-android"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
mkdir -p "$ANDROID_AVD_HOME" evidence
for feed in market-status market-news featured-stocks-unified; do
  curl --fail --retry 2 "https://raw.githubusercontent.com/KBYOO0815/market-flow-feed/main/$feed.json" -o "evidence/$feed.json"
done
test -c /dev/kvm
sudo chgrp "$(id -gn)" /dev/kvm
sudo chmod g+rw /dev/kvm
image='system-images;android-35;google_apis;x86_64'
sdkmanager --sdk_root="$ANDROID_HOME" 'platform-tools' 'emulator' "$image"
printf 'no\n' | avdmanager create avd --force --name market-flow --package "$image"
emulator -list-avds | grep -Fx market-flow
emulator -avd market-flow -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect > evidence/emulator.log 2>&1 &
emulator_pid=$!
trap 'if kill -0 "$emulator_pid" 2>/dev/null; then adb emu kill || true; fi; tail -40 evidence/emulator.log' EXIT
sleep 4
kill -0 "$emulator_pid"
timeout 300 bash -c 'adb wait-for-device; until [[ $(adb shell getprop sys.boot_completed | tr -d "\r") == 1 ]]; do sleep 3; done'
adb shell wm size 1080x2400
adb shell wm density 420
adb shell input keyevent 82
adb install android/app/build/outputs/apk/release/app-release.apk | tee evidence/install.txt
grep -Fx Success evidence/install.txt
adb shell pm clear com.kbyoo0815.marketflow
adb shell am start -W -n com.kbyoo0815.marketflow/.MainActivity | tee evidence/launch.txt
grep -Fx 'Status: ok' evidence/launch.txt
sleep 15
adb shell uiautomator dump /sdcard/screen.xml
adb pull /sdcard/screen.xml evidence/screen.xml
# Handle only the emulator's known Pixel Launcher ANR, never an app crash.
if python3 - <<'PY'
import xml.etree.ElementTree as ET
labels = [node.get("text", "") for node in ET.parse("evidence/screen.xml").iter("node")]
raise SystemExit(0 if "Pixel Launcher isn't responding" in labels else 1)
PY
then
  python3 - <<'PY'
import re
import subprocess
import xml.etree.ElementTree as ET
nodes = list(ET.parse("evidence/screen.xml").iter("node"))
close = next(node for node in nodes if node.get("text") == "Close app")
x1, y1, x2, y2 = map(int, re.findall(r"\d+", close.get("bounds")))
subprocess.run(["adb", "shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2)], check=True)
PY
  adb shell am start -W -n com.kbyoo0815.marketflow/.MainActivity
  sleep 15
  adb shell uiautomator dump /sdcard/screen.xml
  adb pull /sdcard/screen.xml evidence/screen.xml
fi
adb exec-out screencap -p > evidence/screen-initial.png
adb shell pidof com.kbyoo0815.marketflow
python3 scripts/check-device-market-news.py
