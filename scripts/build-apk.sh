#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
TASK_ROOT="$PWD"
JAVA_HOME="${JAVA_HOME:-$TASK_ROOT/.tooling/jdk/Contents/Home}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$TASK_ROOT/.tooling/sdk}"
export JAVA_HOME ANDROID_SDK_ROOT
BT="$ANDROID_SDK_ROOT/build-tools/35.0.0"
PLATFORM="$ANDROID_SDK_ROOT/platforms/android-36/android.jar"
OUT="$TASK_ROOT/android/build"
mkdir -p "$OUT/classes" "$OUT/dex" "$TASK_ROOT/artifacts"
MANIFEST="android/app/src/main/AndroidManifest.xml"
APK_NAME="数屿SQL-0.6.1.apk"
if [ "${BUILD_DEBUG:-0}" = "1" ]; then
 sed 's/<application /<application android:debuggable="true" /' "$MANIFEST" > "$OUT/AndroidManifest.xml"
 MANIFEST="$OUT/AndroidManifest.xml"
 APK_NAME="数屿SQL-0.6.1-test.apk"
fi
"$BT/aapt2" compile --dir android/app/src/main/res -o "$OUT/resources.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLATFORM" --manifest "$MANIFEST" -A android/app/src/main/assets --java "$OUT/generated" "$OUT/resources.zip"
"$JAVA_HOME/bin/javac" -encoding UTF-8 -source 8 -target 8 -bootclasspath "$PLATFORM:$BT/core-lambda-stubs.jar" -d "$OUT/classes" android/app/src/main/java/cn/sqlstudy/offline/*.java
find "$OUT/classes" -name '*.class' > "$OUT/classes-list.txt"
"$BT/d8" --lib "$PLATFORM" --min-api 29 --output "$OUT/dex" @"$OUT/classes-list.txt"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q "$OUT/unsigned.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
if [ ! -f "$TASK_ROOT/.tooling/sql-shouji.keystore" ]; then
 "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$TASK_ROOT/.tooling/sql-shouji.keystore" -storepass android -keypass android -alias sqlshouji -dname "CN=SQL Shouji Local Development" -keyalg RSA -keysize 2048 -validity 10000
fi
"$BT/apksigner" sign --ks "$TASK_ROOT/.tooling/sql-shouji.keystore" --ks-key-alias sqlshouji --ks-pass pass:android --key-pass pass:android --out "$TASK_ROOT/artifacts/$APK_NAME" "$OUT/aligned.apk"
"$BT/apksigner" verify --verbose "$TASK_ROOT/artifacts/$APK_NAME"
