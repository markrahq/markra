import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function fixture(t, { installers = ["ExampleEditor_1.2.3_windows_x64_setup.exe"], config = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "winget-manifests-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const assetsRoot = path.join(root, "assets");
  const outputDir = path.join(root, "output");
  const configPath = path.join(root, "tauri.conf.json");
  fs.writeFileSync(configPath, JSON.stringify({
    productName: "ExampleEditor",
    identifier: "test.example.editor",
    version: "1.2.3",
    bundle: {},
    ...config,
  }));
  for (const [index, name] of installers.entries()) {
    const dir = path.join(assetsRoot, `bundle-${index}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), "synthetic installer bytes");
  }
  return {
    outputDir,
    run(overrides = {}) {
      return spawnSync(process.execPath, ["scripts/release/generate-winget-manifests.mjs"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "example-org/example-editor",
          OUTPUT_DIR: outputDir,
          RELEASE_ASSETS_ROOT: assetsRoot,
          RELEASE_VERSION: "v1.2.3",
          TAURI_CONFIG_PATH: configPath,
          ...overrides,
        },
      });
    },
  };
}

test("generates three WinGet manifests using only the exact x64 NSIS installer", (t) => {
  const { run, outputDir } = fixture(t, { installers: [
    "ExampleEditor_1.2.3_windows_x64_setup.exe",
    "ExampleEditor_1.2.3_windows_x64_en-US.msi",
    "ExampleEditor_1.2.3_windows_x64_portable.zip",
    "ExampleEditor_1.2.3_windows_arm64_setup.exe",
    "ExampleEditor_1.2.2_windows_x64_setup.exe",
  ] });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const manifestDir = path.join(outputDir, "manifests/m/Markra/Markra/1.2.3");
  assert.equal(fs.readdirSync(manifestDir).length, 3);
  const installer = fs.readFileSync(path.join(manifestDir, "Markra.Markra.installer.yaml"), "utf8");
  const locale = fs.readFileSync(path.join(manifestDir, "Markra.Markra.locale.en-US.yaml"), "utf8");
  const version = fs.readFileSync(path.join(manifestDir, "Markra.Markra.yaml"), "utf8");
  assert.match(installer, /InstallerType: nullsoft/);
  assert.match(installer, /Scope: user/);
  assert.match(installer, /Architecture: x64/);
  assert.match(installer, /ProductCode: "ExampleEditor"/);
  assert.match(installer, /UpgradeBehavior: install/);
  assert.match(installer, /InstallerUrl: "https:\/\/github.com\/example-org\/example-editor\/releases\/download\/v1.2.3\/ExampleEditor_1.2.3_windows_x64_setup.exe"/);
  const hash = crypto.createHash("sha256").update("synthetic installer bytes").digest("hex").toUpperCase();
  assert.match(installer, new RegExp(`InstallerSha256: ${hash}`));
  assert.match(locale, /Publisher: "example"/);
  assert.match(locale, /License: AGPL-3.0-only/);
  assert.match(locale, /ReleaseNotesUrl: "https:\/\/github.com\/example-org\/example-editor\/releases\/tag\/v1.2.3"/);
  assert.match(version, /DefaultLocale: en-US/);
  for (const name of fs.readdirSync(manifestDir)) {
    const content = fs.readFileSync(path.join(manifestDir, name), "utf8");
    assert.match(content, /PackageIdentifier: Markra.Markra/);
    assert.match(content, /PackageVersion: "1.2.3"/);
    assert.match(content, /ManifestVersion: 1.10.0/);
    assert.match(content, /winget-manifest\.[a-zA-Z]+\.1\.10\.0\.schema\.json/);
  }
});

test("uses an explicit publisher and accepts a version without the v prefix", (t) => {
  const { run, outputDir } = fixture(t, { config: { bundle: { publisher: "Example Publisher" } } });
  const result = run({ RELEASE_VERSION: "1.2.3" });
  assert.equal(result.status, 0, result.stderr);
  const locale = fs.readFileSync(path.join(outputDir, "manifests/m/Markra/Markra/1.2.3/Markra.Markra.locale.en-US.yaml"), "utf8");
  assert.match(locale, /Publisher: "Example Publisher"/);
});

for (const version of ["", "v1.2.3-rc.1", "v1.2.3+build.1", "v1.2.3/other"]) {
  test(`rejects a missing or non-stable version: ${JSON.stringify(version)}`, (t) => {
    const { run, outputDir } = fixture(t);
    const result = run({ RELEASE_VERSION: version });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /RELEASE_VERSION must be a stable/);
    assert.equal(fs.existsSync(outputDir), false);
  });
}

for (const installers of [[], ["ExampleEditor_1.2.3_windows_x64_setup.exe", "ExampleEditor_1.2.3_windows_x64_setup.exe"]]) {
  test(`rejects ${installers.length} matching installers instead of guessing`, (t) => {
    const { run, outputDir } = fixture(t, { installers });
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Expected exactly one Windows x64 NSIS installer/);
    assert.equal(fs.existsSync(outputDir), false);
  });
}

test("rejects a changed NSIS install scope so the manifest cannot misrepresent it", (t) => {
  const { run, outputDir } = fixture(t, { config: { bundle: { windows: { nsis: { installMode: "both" } } } } });
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /currentUser/);
  assert.equal(fs.existsSync(outputDir), false);
});
