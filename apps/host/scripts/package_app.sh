#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIGURATION="debug"
OUTPUT_PATH="$ROOT_DIR/dist/Claw.app"
BUNDLE_ID="com.example.claw"
APP_NAME="Claw"
APP_EXECUTABLE="ClawApp"
ICON_FILE="AppIcon.icns"
ICON_SOURCE_PATH="$ROOT_DIR/assets/$ICON_FILE"
TEAM_ID="${CLAW_HOST_TEAM_ID:-}"
SKIP_SIGN="0"
SKIP_BUILD="0"
EXECUTABLE_PATH=""
SIGN_IDENTITY="${CLAW_HOST_SIGN_IDENTITY:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --configuration)
      CONFIGURATION="$2"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="$2"
      shift 2
      ;;
    --bundle-id)
      BUNDLE_ID="$2"
      shift 2
      ;;
    --app-name)
      APP_NAME="$2"
      shift 2
      ;;
    --app-executable)
      APP_EXECUTABLE="$2"
      shift 2
      ;;
    --team-id)
      TEAM_ID="$2"
      shift 2
      ;;
    --sign-identity)
      SIGN_IDENTITY="$2"
      shift 2
      ;;
    --skip-sign)
      SKIP_SIGN="1"
      shift
      ;;
    --skip-build)
      SKIP_BUILD="1"
      shift
      ;;
    --binary-path)
      EXECUTABLE_PATH="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

detect_sign_identity() {
  if [[ -n "$SIGN_IDENTITY" ]]; then
    echo "$SIGN_IDENTITY"
    return 0
  fi

  local detected
  if [[ -n "$TEAM_ID" ]]; then
    detected="$(security find-identity -v -p codesigning 2>/dev/null | grep "Apple Development:" | grep "($TEAM_ID)" | head -n 1 | sed 's/.*"\(.*\)"/\1/' || true)"
    if [[ -n "$detected" ]]; then
      echo "$detected"
      return 0
    fi
  fi

  detected="$(security find-identity -v -p codesigning 2>/dev/null | grep "Apple Development:" | head -n 1 | sed 's/.*"\(.*\)"/\1/' || true)"
  if [[ -n "$detected" ]]; then
    echo "$detected"
    return 0
  fi

  return 1
}

mkdir -p "$(dirname "$OUTPUT_PATH")"
rm -rf "$OUTPUT_PATH"

if [[ -z "$EXECUTABLE_PATH" ]]; then
  if [[ "$SKIP_BUILD" != "1" ]]; then
    swift build --product "$APP_EXECUTABLE" -c "$CONFIGURATION" --package-path "$ROOT_DIR" >/dev/null
  fi
  BIN_DIR="$(swift build --show-bin-path -c "$CONFIGURATION" --package-path "$ROOT_DIR")"
  EXECUTABLE_PATH="$BIN_DIR/$APP_EXECUTABLE"
fi

if [[ ! -x "$EXECUTABLE_PATH" ]]; then
  echo "Missing built executable at $EXECUTABLE_PATH" >&2
  exit 1
fi

if [[ ! -f "$ICON_SOURCE_PATH" ]]; then
  echo "Missing app icon at $ICON_SOURCE_PATH" >&2
  exit 1
fi

APP_CONTENTS="$OUTPUT_PATH/Contents"
mkdir -p "$APP_CONTENTS/MacOS" "$APP_CONTENTS/Resources"
cp "$EXECUTABLE_PATH" "$APP_CONTENTS/MacOS/$APP_EXECUTABLE"
cp "$ICON_SOURCE_PATH" "$APP_CONTENTS/Resources/$ICON_FILE"

cat > "$APP_CONTENTS/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_NAME</string>
  <key>CFBundleExecutable</key>
  <string>$APP_EXECUTABLE</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleIconFile</key>
  <string>${ICON_FILE%.icns}</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSAppleEventsUsageDescription</key>
  <string>$APP_NAME needs Apple Events access to control Finder, Mail, Notes, Messages, Safari, and Things on your Mac.</string>
  <key>NSCalendarsFullAccessUsageDescription</key>
  <string>$APP_NAME needs Calendar access to let local agents read and manage events on this Mac.</string>
  <key>NSCalendarsUsageDescription</key>
  <string>$APP_NAME needs Calendar access to let local agents read and manage events on this Mac.</string>
  <key>NSContactsUsageDescription</key>
  <string>$APP_NAME needs Contacts access to let local agents read and manage contacts on this Mac.</string>
  <key>NSRemindersFullAccessUsageDescription</key>
  <string>$APP_NAME needs Reminders access to let local agents read and manage reminders on this Mac.</string>
  <key>NSRemindersUsageDescription</key>
  <string>$APP_NAME needs Reminders access to let local agents read and manage reminders on this Mac.</string>
  <key>NSUserNotificationUsageDescription</key>
  <string>$APP_NAME needs notification access to post local status updates for agent actions.</string>
</dict>
</plist>
EOF

touch "$APP_CONTENTS/PkgInfo"

if [[ "$SKIP_SIGN" != "1" ]]; then
  SIGN_IDENTITY="$(detect_sign_identity)"
  if [[ -z "$SIGN_IDENTITY" ]]; then
    echo "No Apple Development signing identity found" >&2
    exit 1
  fi
  codesign --force --deep --sign "$SIGN_IDENTITY" "$OUTPUT_PATH"
  codesign --verify --deep --strict "$OUTPUT_PATH"
fi

echo "$OUTPUT_PATH"
