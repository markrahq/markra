import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const releaseWorkflowPath = path.join(repoRoot, ".github", "workflows", "release.yml");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "markra-release-assets-"));
}

function writeFile(filePath, content = "asset") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function runNormalizeScript(rootDir, env) {
  return spawnSync(process.execPath, ["scripts/release/normalize-release-artifacts.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      APP_PRODUCT_NAME: "Markra",
      APP_SLUG: "markra",
      DESKTOP_DIR: path.join(rootDir, "apps", "desktop"),
      RELEASE_VERSION: "0.0.8",
      ...env,
    },
  });
}

function readReleaseMatrixEntry(name) {
  const workflow = fs.readFileSync(releaseWorkflowPath, "utf8");
  const start = workflow.indexOf(`- name: ${name}`);

  assert.notEqual(start, -1, `${name} matrix entry should exist`);

  const next = workflow.indexOf("\n          - name:", start + 1);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, next);
}

function readReleaseStep(name) {
  const workflow = fs.readFileSync(releaseWorkflowPath, "utf8");
  const start = workflow.indexOf(`- name: ${name}`);

  assert.notEqual(start, -1, `${name} release step should exist`);

  const next = workflow.indexOf("\n      - name:", start + 1);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, next);
}

test("release workflow uses arm64 in Apple Silicon file names while keeping the Tauri updater platform", () => {
  const appleSiliconEntry = readReleaseMatrixEntry("macOS (Apple Silicon)");

  assert.match(appleSiliconEntry, /asset_arch:\s*arm64/);
  assert.match(appleSiliconEntry, /updater_platform:\s*darwin-aarch64/);
  assert.doesNotMatch(appleSiliconEntry, /asset_arch:\s*aarch64/);
});

test("release workflow builds Linux ARM64 bundles", () => {
  const linuxArm64Entry = readReleaseMatrixEntry("Linux (ARM64)");

  assert.match(linuxArm64Entry, /artifact_name:\s*Linux-arm64/);
  assert.match(linuxArm64Entry, /os:\s*ubuntu-22\.04-arm/);
  assert.match(linuxArm64Entry, /target:\s*aarch64-unknown-linux-gnu/);
  assert.match(linuxArm64Entry, /asset_platform:\s*linux/);
  assert.match(linuxArm64Entry, /asset_arch:\s*arm64/);
  assert.match(linuxArm64Entry, /updater_platform:\s*linux-aarch64/);
  assert.match(linuxArm64Entry, /args:\s*--target aarch64-unknown-linux-gnu/);
});

test("release workflow validates the web package version", () => {
  const validateStep = readReleaseStep("Validate release version");

  assert.match(validateStep, /apps\/web\/package\.json/);
  assert.match(validateStep, /Web package version/);
});

test("release workflow excludes Wayland client from Linux AppImage bundling", () => {
  const buildStep = readReleaseStep("Build and bundle app");
  const rebuildStep = readReleaseStep("Rebuild Linux AppImage library policy");
  const verifyStep = readReleaseStep("Verify Linux AppImage library policy");

  assert.match(buildStep, /LINUXDEPLOY_EXCLUDED_LIBRARIES:\s*libwayland-client\.so\*/);
  assert.match(rebuildStep, /if:\s*matrix\.asset_platform == 'linux'/);
  assert.match(rebuildStep, /repair-linux-appimage-libraries\.mjs/);
  assert.match(rebuildStep, /repair-linux-appimage-gtk-ime\.mjs/);
  assert.match(rebuildStep, /APPIMAGETOOL_ARCH:\s*\$\{\{ matrix\.appimagetool_arch \}\}/);
  assert.match(rebuildStep, /APPIMAGE_ARCH:\s*\$\{\{ matrix\.appimage_arch \}\}/);
  assert.match(rebuildStep, /appimagetool-\$\{APPIMAGETOOL_ARCH\}\.AppImage/);
  assert.match(rebuildStep, /ARCH="\$\{APPIMAGE_ARCH\}"/);
  assert.match(rebuildStep, /tauri" signer sign/);
  assert.match(verifyStep, /if:\s*matrix\.asset_platform == 'linux'/);
  assert.match(verifyStep, /verify-linux-appimage-libraries\.mjs/);
  assert.match(verifyStep, /verify-linux-appimage-gtk-ime\.mjs/);
});

test("normalize-release-artifacts adds macOS platform labels to updater and dmg assets", () => {
  const rootDir = makeTempDir();
  const bundleRoot = path.join(
    rootDir,
    "apps",
    "desktop",
    "src-tauri",
    "target",
    "x86_64-apple-darwin",
    "release",
    "bundle",
  );
  const oldUpdater = path.join(bundleRoot, "macos", "markra_0.0.8_x64.app.tar.gz");
  const oldDmg = path.join(bundleRoot, "dmg", "Markra_0.0.8_x64.dmg");

  writeFile(oldUpdater);
  writeFile(`${oldUpdater}.sig`, "signature");
  writeFile(oldDmg);

  const result = runNormalizeScript(rootDir, {
    ASSET_ARCH: "x64",
    ASSET_PLATFORM: "macos",
    TARGET: "x86_64-apple-darwin",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(oldUpdater), false);
  assert.equal(fs.existsSync(`${oldUpdater}.sig`), false);
  assert.equal(fs.existsSync(oldDmg), false);
  assert.equal(fs.existsSync(path.join(bundleRoot, "macos", "Markra_0.0.8_macos_x64_updater.app.tar.gz")), true);
  assert.equal(fs.existsSync(path.join(bundleRoot, "macos", "Markra_0.0.8_macos_x64_updater.app.tar.gz.sig")), true);
  assert.equal(fs.existsSync(path.join(bundleRoot, "dmg", "Markra_0.0.8_macos_x64.dmg")), true);
});

test("normalize-release-artifacts adds Windows platform labels and creates a portable zip", () => {
  const rootDir = makeTempDir();
  const releaseRoot = path.join(
    rootDir,
    "apps",
    "desktop",
    "src-tauri",
    "target",
    "x86_64-pc-windows-msvc",
    "release",
  );
  const bundleRoot = path.join(releaseRoot, "bundle");
  const oldSetup = path.join(bundleRoot, "nsis", "Markra_0.0.8_x64-setup.exe");
  const oldMsi = path.join(bundleRoot, "msi", "Markra_0.0.8_x64_en-US.msi");
  const portableZip = path.join(bundleRoot, "portable", "Markra_0.0.8_windows_x64_portable.zip");

  writeFile(path.join(releaseRoot, "markra.exe"), "portable-binary");
  writeFile(path.join(releaseRoot, "support.dll"), "portable-library");
  writeFile(oldSetup);
  writeFile(`${oldSetup}.sig`, "setup-signature");
  writeFile(oldMsi);
  writeFile(`${oldMsi}.sig`, "msi-signature");

  const result = runNormalizeScript(rootDir, {
    ASSET_ARCH: "x64",
    ASSET_PLATFORM: "windows",
    TARGET: "x86_64-pc-windows-msvc",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(oldSetup), false);
  assert.equal(fs.existsSync(`${oldSetup}.sig`), false);
  assert.equal(fs.existsSync(oldMsi), false);
  assert.equal(fs.existsSync(`${oldMsi}.sig`), false);
  assert.equal(fs.existsSync(path.join(bundleRoot, "nsis", "Markra_0.0.8_windows_x64_setup.exe")), true);
  assert.equal(fs.existsSync(path.join(bundleRoot, "nsis", "Markra_0.0.8_windows_x64_setup.exe.sig")), true);
  assert.equal(fs.existsSync(path.join(bundleRoot, "msi", "Markra_0.0.8_windows_x64_en-US.msi")), true);
  assert.equal(fs.existsSync(path.join(bundleRoot, "msi", "Markra_0.0.8_windows_x64_en-US.msi.sig")), true);
  assert.equal(fs.existsSync(portableZip), true);

  const zipContents = fs.readFileSync(portableZip);
  assert.equal(zipContents.subarray(0, 4).toString("latin1"), "PK\u0003\u0004");
  assert.match(zipContents.toString("latin1"), /Markra\/Markra\.exe/);
  assert.match(zipContents.toString("latin1"), /Markra\/support\.dll/);
});

test("normalize-release-artifacts adds Linux platform labels to package assets", () => {
  const rootDir = makeTempDir();
  const bundleRoot = path.join(
    rootDir,
    "apps",
    "desktop",
    "src-tauri",
    "target",
    "x86_64-unknown-linux-gnu",
    "release",
    "bundle",
  );
  const oldAppImage = path.join(bundleRoot, "appimage", "Markra_0.0.8_amd64.AppImage");
  const oldDeb = path.join(bundleRoot, "deb", "Markra_0.0.8_amd64.deb");
  const oldRpm = path.join(bundleRoot, "rpm", "Markra-0.0.8-1.x86_64.rpm");

  writeFile(oldAppImage);
  writeFile(`${oldAppImage}.sig`, "appimage-signature");
  writeFile(oldDeb);
  writeFile(`${oldDeb}.sig`, "deb-signature");
  writeFile(oldRpm);
  writeFile(`${oldRpm}.sig`, "rpm-signature");

  const result = runNormalizeScript(rootDir, {
    ASSET_ARCH: "x64",
    ASSET_PLATFORM: "linux",
    TARGET: "x86_64-unknown-linux-gnu",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(bundleRoot, "appimage", "Markra_0.0.8_linux_x64.AppImage")), true);
  assert.equal(fs.existsSync(path.join(bundleRoot, "appimage", "Markra_0.0.8_linux_x64.AppImage.sig")), true);
  assert.equal(fs.existsSync(path.join(bundleRoot, "deb", "Markra_0.0.8_linux_x64.deb")), true);
  assert.equal(fs.existsSync(path.join(bundleRoot, "deb", "Markra_0.0.8_linux_x64.deb.sig")), true);
  assert.equal(fs.existsSync(path.join(bundleRoot, "rpm", "Markra_0.0.8_linux_x64.rpm")), true);
  assert.equal(fs.existsSync(path.join(bundleRoot, "rpm", "Markra_0.0.8_linux_x64.rpm.sig")), true);
});
