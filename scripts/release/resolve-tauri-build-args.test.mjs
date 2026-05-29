import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function runResolveArgs(env) {
  return spawnSync(process.execPath, ["scripts/release/resolve-tauri-build-args.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

test("resolve-tauri-build-args limits Windows prerelease bundles to NSIS", () => {
  const result = runResolveArgs({
    ASSET_PLATFORM: "windows",
    RELEASE_TAG: "v0.6.0-beta.1",
    TAURI_BUILD_ARGS: "--target x86_64-pc-windows-msvc",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "--target x86_64-pc-windows-msvc --bundles nsis");
});

test("resolve-tauri-build-args keeps Windows stable release bundles unchanged", () => {
  const result = runResolveArgs({
    ASSET_PLATFORM: "windows",
    RELEASE_TAG: "v0.6.0",
    TAURI_BUILD_ARGS: "--target x86_64-pc-windows-msvc",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "--target x86_64-pc-windows-msvc");
});

test("resolve-tauri-build-args keeps non-Windows prerelease bundles unchanged", () => {
  const result = runResolveArgs({
    ASSET_PLATFORM: "macos",
    RELEASE_TAG: "v0.6.0-beta.1",
    TAURI_BUILD_ARGS: "--target aarch64-apple-darwin",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "--target aarch64-apple-darwin");
});
