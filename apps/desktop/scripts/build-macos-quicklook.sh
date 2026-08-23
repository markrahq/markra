#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Markra Quick Look extension can only be built on macOS." >&2
  exit 1
fi

DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"
SOURCE_DIR="$DESKTOP_DIR/src-tauri/macos/MarkraQuickLookPreview"
RENDERER_DIR="$DESKTOP_DIR/src-tauri/target/quicklook-renderer"
OUTPUT_DIR="$DESKTOP_DIR/src-tauri/target/quicklook/MarkraQuickLookPreview.appex"
CONTENTS_DIR="$OUTPUT_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
PNPM_BIN="${PNPM_BIN:-pnpm}"

"$PNPM_BIN" --dir "$WORKSPACE_DIR" --filter @markra/desktop build:quicklook-renderer

rm -rf "$OUTPUT_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"
cp "$SOURCE_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"
cp -R "$RENDERER_DIR" "$RESOURCES_DIR/quicklook-renderer"

APP_VERSION="$(node -p "require('$DESKTOP_DIR/package.json').version")"
APP_BUNDLE_VERSION="$(node -p "const config=require('$DESKTOP_DIR/src-tauri/tauri.conf.json'); config.bundle?.macOS?.bundleVersion || config.version")"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $APP_VERSION" "$CONTENTS_DIR/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $APP_BUNDLE_VERSION" "$CONTENTS_DIR/Info.plist"

ARCH="${QUICKLOOK_ARCH:-$(uname -m)}"
case "$ARCH" in
  arm64|aarch64)
    SWIFT_TARGET_ARCH="arm64"
    ;;
  x86_64|amd64|x64)
    SWIFT_TARGET_ARCH="x86_64"
    ;;
  *)
    echo "Unsupported Quick Look architecture: $ARCH" >&2
    exit 1
    ;;
esac

SWIFT_SOURCES=("$SOURCE_DIR"/*.swift)
# Xcode extension targets supply this entry point automatically; direct swiftc builds must set it.
xcrun swiftc \
  "${SWIFT_SOURCES[@]}" \
  -emit-executable \
  -parse-as-library \
  -module-name MarkraQuickLookPreview \
  -application-extension \
  -O \
  -target "${SWIFT_TARGET_ARCH}-apple-macosx12.0" \
  -Xlinker -e \
  -Xlinker _NSExtensionMain \
  -Xlinker -rpath \
  -Xlinker @executable_path/../Frameworks \
  -Xlinker -rpath \
  -Xlinker @executable_path/../../../../Frameworks \
  -o "$MACOS_DIR/MarkraQuickLookPreview" \
  -framework Cocoa \
  -framework QuickLook \
  -framework QuickLookUI \
  -framework WebKit

CODESIGN_IDENTITY="${APPLE_CODESIGN_IDENTITY:-${APPLE_SIGNING_IDENTITY:--}}"
CODESIGN_ARGS=(
  --force
  --options runtime
  --sign "$CODESIGN_IDENTITY"
  --entitlements "$SOURCE_DIR/MarkraQuickLookPreview.entitlements"
)
if [[ "$CODESIGN_IDENTITY" != "-" ]]; then
  CODESIGN_ARGS+=(--timestamp)
fi
/usr/bin/codesign "${CODESIGN_ARGS[@]}" "$OUTPUT_DIR"

/usr/bin/codesign --verify --strict --verbose=2 "$OUTPUT_DIR"
echo "Built $OUTPUT_DIR"
