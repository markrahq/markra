#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Quick Look bundle verification requires macOS." >&2
  exit 1
fi

DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_PREFIX="${TARGET:+$TARGET/}"
PROFILE="${PROFILE:-release}"
BUNDLE_DIR="$DESKTOP_DIR/src-tauri/target/${TARGET_PREFIX}${PROFILE}/bundle/macos"
APP_PRODUCT_NAME="${APP_PRODUCT_NAME:-Markra}"
APP_BUNDLE="$BUNDLE_DIR/$APP_PRODUCT_NAME.app"

if [[ ! -d "$APP_BUNDLE" ]]; then
  echo "Expected macOS app bundle at $APP_BUNDLE." >&2
  exit 1
fi

APP_INFO="$APP_BUNDLE/Contents/Info.plist"
EXTENSION_BUNDLE="$APP_BUNDLE/Contents/PlugIns/MarkraQuickLookPreview.appex"
EXTENSION_INFO="$EXTENSION_BUNDLE/Contents/Info.plist"
RENDERER_INDEX="$EXTENSION_BUNDLE/Contents/Resources/quicklook-renderer/src/quicklook/index.html"

if [[ ! -f "$EXTENSION_INFO" || ! -f "$RENDERER_INDEX" ]]; then
  echo "Markra Quick Look extension or renderer is missing from $APP_BUNDLE." >&2
  exit 1
fi

DECLARED_EXTENSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundlePlugIns:0' "$APP_INFO")"
if [[ "$DECLARED_EXTENSION" != "Contents/PlugIns/MarkraQuickLookPreview.appex" ]]; then
  echo "Containing app does not declare the embedded Quick Look extension." >&2
  exit 1
fi

EXTENSION_POINT="$(/usr/libexec/PlistBuddy -c 'Print :NSExtension:NSExtensionPointIdentifier' "$EXTENSION_INFO")"
if [[ "$EXTENSION_POINT" != "com.apple.quicklook.preview" ]]; then
  echo "Embedded extension does not declare the Quick Look preview extension point." >&2
  exit 1
fi

APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_INFO")"
APP_BUNDLE_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_INFO")"
EXTENSION_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$EXTENSION_INFO")"
EXTENSION_BUNDLE_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$EXTENSION_INFO")"
if [[ "$EXTENSION_VERSION" != "$APP_VERSION" || "$EXTENSION_BUNDLE_VERSION" != "$APP_BUNDLE_VERSION" ]]; then
  echo "Quick Look and app bundle versions do not match." >&2
  exit 1
fi

EXTENSION_SIGNATURE="$(/usr/bin/codesign -dvv "$EXTENSION_BUNDLE" 2>&1)"
if [[ "$EXTENSION_SIGNATURE" != *"runtime"* ]]; then
  echo "Quick Look extension is missing the hardened runtime signature option." >&2
  exit 1
fi

if [[ -n "${TARGET:-}" ]]; then
  EXPECTED_ARCH="${TARGET%%-*}"
  [[ "$EXPECTED_ARCH" == "aarch64" ]] && EXPECTED_ARCH="arm64"
  EXTENSION_ARCHS="$(/usr/bin/lipo -archs "$EXTENSION_BUNDLE/Contents/MacOS/MarkraQuickLookPreview")"
  if [[ " $EXTENSION_ARCHS " != *" $EXPECTED_ARCH "* ]]; then
    echo "Quick Look extension architecture mismatch: target=$EXPECTED_ARCH binary=$EXTENSION_ARCHS." >&2
    exit 1
  fi
fi

/usr/bin/codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
echo "Verified embedded Quick Look extension: $EXTENSION_BUNDLE"
