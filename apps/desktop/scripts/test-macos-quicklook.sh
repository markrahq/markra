#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Quick Look Swift tests require macOS." >&2
  exit 1
fi

DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$DESKTOP_DIR/src-tauri/macos/MarkraQuickLookPreview"
TEST_DIR="$DESKTOP_DIR/src-tauri/macos/MarkraQuickLookPreviewTests"
OUTPUT_DIR="$DESKTOP_DIR/src-tauri/target/quicklook-tests"
TEST_BINARY="$OUTPUT_DIR/PreviewPayloadTests"

mkdir -p "$OUTPUT_DIR"

xcrun swiftc \
  "$SOURCE_DIR/PreviewPayload.swift" \
  "$TEST_DIR/PreviewPayloadTests.swift" \
  "$TEST_DIR/PreviewPayloadRunner.swift" \
  -o "$TEST_BINARY"

"$TEST_BINARY"
