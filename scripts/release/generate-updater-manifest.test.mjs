import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "markra-updater-manifest-"));
}

function writeArtifact(rootDir, platform, bundleName, signature) {
  const artifactDir = path.join(rootDir, platform);
  const signatureName = `${bundleName}.sig`;

  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, bundleName), "bundle");
  fs.writeFileSync(path.join(artifactDir, signatureName), signature);
  fs.writeFileSync(
    path.join(artifactDir, "release-metadata.json"),
    `${JSON.stringify(
      {
        updaterPlatform: platform,
        bundleName,
        signatureName,
      },
      null,
      2,
    )}\n`,
  );
}

function runManifestScript(env) {
  return spawnSync(process.execPath, ["scripts/release/generate-updater-manifest.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

test("generate-updater-manifest writes latest.json for every updater platform", () => {
  const rootDir = makeTempDir();
  const notesPath = path.join(rootDir, "release-notes.md");

  writeArtifact(rootDir, "darwin-aarch64", "Markra_0.0.8_macos_arm64_updater.app.tar.gz", "mac-arm-signature");
  writeArtifact(rootDir, "darwin-x86_64", "Markra_0.0.8_macos_x64_updater.app.tar.gz", "mac-intel-signature");
  writeArtifact(rootDir, "linux-x86_64", "Markra_0.0.8_linux_x64.AppImage", "linux-signature");
  writeArtifact(rootDir, "windows-x86_64", "Markra_0.0.8_windows_x64_setup.exe", "windows-signature");
  fs.writeFileSync(notesPath, "Release notes");

  const result = runManifestScript({
    GITHUB_REPOSITORY: "markrahq/markra",
    RELEASE_ASSETS_ROOT: rootDir,
    RELEASE_NOTES_PATH: notesPath,
    RELEASE_VERSION: "0.0.8",
  });

  assert.equal(result.status, 0, result.stderr);

  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "latest.json"), "utf8"));
  assert.equal(manifest.version, "0.0.8");
  assert.equal(manifest.notes, "Release notes");
  assert.match(manifest.pub_date, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(manifest.platforms, {
    "darwin-aarch64": {
      signature: "mac-arm-signature",
      url: "https://github.com/markrahq/markra/releases/latest/download/Markra_0.0.8_macos_arm64_updater.app.tar.gz",
    },
    "darwin-x86_64": {
      signature: "mac-intel-signature",
      url: "https://github.com/markrahq/markra/releases/latest/download/Markra_0.0.8_macos_x64_updater.app.tar.gz",
    },
    "linux-x86_64": {
      signature: "linux-signature",
      url: "https://github.com/markrahq/markra/releases/latest/download/Markra_0.0.8_linux_x64.AppImage",
    },
    "windows-x86_64": {
      signature: "windows-signature",
      url: "https://github.com/markrahq/markra/releases/latest/download/Markra_0.0.8_windows_x64_setup.exe",
    },
  });
});

test("generate-updater-manifest fails when metadata points at a missing bundle", () => {
  const rootDir = makeTempDir();
  const artifactDir = path.join(rootDir, "windows-x86_64");
  const notesPath = path.join(rootDir, "release-notes.md");

  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "Markra_0.0.8_windows_x64_setup.exe.sig"), "signature");
  fs.writeFileSync(
    path.join(artifactDir, "release-metadata.json"),
    `${JSON.stringify(
      {
        updaterPlatform: "windows-x86_64",
        bundleName: "Markra_0.0.8_windows_x64_setup.exe",
        signatureName: "Markra_0.0.8_windows_x64_setup.exe.sig",
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(notesPath, "Release notes");

  const result = runManifestScript({
    GITHUB_REPOSITORY: "markrahq/markra",
    RELEASE_ASSETS_ROOT: rootDir,
    RELEASE_NOTES_PATH: notesPath,
    RELEASE_VERSION: "0.0.8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing updater bundle/);
});

test("generate-updater-manifest fails when an expected platform is missing", () => {
  const rootDir = makeTempDir();
  const notesPath = path.join(rootDir, "release-notes.md");

  writeArtifact(rootDir, "windows-x86_64", "Markra_0.0.8_windows_x64_setup.exe", "windows-signature");
  fs.writeFileSync(notesPath, "Release notes");

  const result = runManifestScript({
    EXPECTED_UPDATER_PLATFORMS: "darwin-aarch64,windows-x86_64",
    GITHUB_REPOSITORY: "markrahq/markra",
    RELEASE_ASSETS_ROOT: rootDir,
    RELEASE_NOTES_PATH: notesPath,
    RELEASE_VERSION: "0.0.8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing updater metadata for darwin-aarch64/);
});
