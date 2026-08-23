import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "markra-updater-metadata-"));
}

function writeBundle(rootDir, bundleName, signature = "signature") {
  const bundlePath = path.join(rootDir, bundleName);
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
  fs.writeFileSync(bundlePath, "bundle");
  fs.writeFileSync(`${bundlePath}.sig`, signature);
  return [bundlePath, `${bundlePath}.sig`];
}

function runMetadataScript(env) {
  return spawnSync(process.execPath, ["scripts/release/create-updater-metadata.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

test("create-updater-metadata prefers the Windows setup updater bundle", () => {
  const rootDir = makeTempDir();
  const [, msiSignature] = writeBundle(rootDir, "Markra_0.0.8_windows_x64_en-US.msi");
  const [setupBundle, setupSignature] = writeBundle(rootDir, "Markra_0.0.8_windows_x64_setup.exe");
  const outputPath = path.join(rootDir, "release-metadata.json");

  const result = runMetadataScript({
    ARTIFACT_PATHS_RAW: [msiSignature, setupSignature].join("\n"),
    OUTPUT_PATH: outputPath,
    UPDATER_PLATFORM: "windows-x86_64",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), {
    updaterPlatform: "windows-x86_64",
    bundleName: path.basename(setupBundle),
    signatureName: path.basename(setupSignature),
  });
});

test("create-updater-metadata selects the signed Windows portable bundle", () => {
  const rootDir = makeTempDir();
  const [, msiSignature] = writeBundle(rootDir, "Markra_0.0.8_windows_x64_en-US.msi");
  const [, setupSignature] = writeBundle(rootDir, "Markra_0.0.8_windows_x64_setup.exe");
  const [bundlePath, signaturePath] = writeBundle(rootDir, "Markra_0.0.8_windows_x64_portable.zip");
  const outputPath = path.join(rootDir, "release-metadata.windows-portable-x86_64.json");

  const result = runMetadataScript({
    ARTIFACT_PATHS_RAW: [msiSignature, setupSignature, signaturePath].join("\n"),
    OUTPUT_PATH: outputPath,
    UPDATER_PLATFORM: "windows-portable-x86_64",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), {
    updaterPlatform: "windows-portable-x86_64",
    bundleName: path.basename(bundlePath),
    signatureName: path.basename(signaturePath),
  });
});

test("create-updater-metadata selects AppImage bundles for Linux updater metadata", () => {
  const rootDir = makeTempDir();
  const [bundlePath, signaturePath] = writeBundle(rootDir, "Markra_0.0.8_linux_x64.AppImage");
  const outputPath = path.join(rootDir, "release-metadata.json");

  const result = runMetadataScript({
    ARTIFACT_PATHS_RAW: signaturePath,
    OUTPUT_PATH: outputPath,
    UPDATER_PLATFORM: "linux-x86_64",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), {
    updaterPlatform: "linux-x86_64",
    bundleName: path.basename(bundlePath),
    signatureName: path.basename(signaturePath),
  });
});

test("create-updater-metadata selects renamed macOS updater tarballs", () => {
  const rootDir = makeTempDir();
  const [bundlePath, signaturePath] = writeBundle(rootDir, "Markra_0.0.8_macos_arm64_updater.app.tar.gz");
  const outputPath = path.join(rootDir, "release-metadata.json");

  const result = runMetadataScript({
    ARTIFACT_PATHS_RAW: signaturePath,
    OUTPUT_PATH: outputPath,
    UPDATER_PLATFORM: "darwin-aarch64",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), {
    updaterPlatform: "darwin-aarch64",
    bundleName: path.basename(bundlePath),
    signatureName: path.basename(signaturePath),
  });
});
