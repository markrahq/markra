import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const releaseWorkflowPath = path.join(repoRoot, ".github", "workflows", "release.yml");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "markra-homebrew-cask-"));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function runCaskScript(env) {
  return spawnSync(process.execPath, ["scripts/release/generate-homebrew-cask.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

test("generate-homebrew-cask writes a dual-architecture cask from macOS DMGs", () => {
  const rootDir = makeTempDir();
  const assetsRoot = path.join(rootDir, "release-assets");
  const outputPath = path.join(rootDir, "generated", "homebrew", "Casks", "markra.rb");
  const armContent = "arm64 dmg";
  const intelContent = "x64 dmg";

  writeFile(path.join(assetsRoot, "macos-arm64", "Markra_1.2.3_macos_arm64.dmg"), armContent);
  writeFile(path.join(assetsRoot, "macos-x64", "Markra_1.2.3_macos_x64.dmg"), intelContent);

  const result = runCaskScript({
    GITHUB_REPOSITORY: "markrahq/markra",
    OUTPUT_PATH: outputPath,
    RELEASE_ASSETS_ROOT: assetsRoot,
    RELEASE_VERSION: "v1.2.3",
  });

  assert.equal(result.status, 0, result.stderr);

  const cask = fs.readFileSync(outputPath, "utf8");

  assert.match(cask, /cask "markra" do/);
  assert.match(cask, /arch arm: "arm64", intel: "x64"/);
  assert.match(cask, /version "1\.2\.3"/);
  assert.match(cask, new RegExp(`sha256 arm: "${sha256(armContent)}"`));
  assert.match(cask, new RegExp(`intel: "${sha256(intelContent)}"`));
  assert.match(cask, /url "https:\/\/github\.com\/markrahq\/markra\/releases\/download\/v#\{version\}\/Markra_#\{version\}_macos_#\{arch\}\.dmg"/);
  assert.match(cask, /verified: "github\.com\/markrahq\/markra\/"/);
  assert.match(cask, /name "Markra"/);
  assert.match(cask, /desc "AI-native Markdown editor"/);
  assert.match(cask, /homepage "https:\/\/github\.com\/markrahq\/markra"/);
  assert.match(cask, /strategy :github_latest/);
  assert.match(cask, /auto_updates true/);
  assert.match(cask, /app "Markra\.app"/);
  assert.equal(cask.endsWith("\n"), true);
});

test("generate-homebrew-cask fails clearly when an expected macOS DMG is missing", () => {
  const rootDir = makeTempDir();
  const assetsRoot = path.join(rootDir, "release-assets");
  const outputPath = path.join(rootDir, "generated", "homebrew", "Casks", "markra.rb");

  writeFile(path.join(assetsRoot, "macos-arm64", "Markra_1.2.3_macos_arm64.dmg"), "arm64 dmg");

  const result = runCaskScript({
    OUTPUT_PATH: outputPath,
    RELEASE_ASSETS_ROOT: assetsRoot,
    RELEASE_VERSION: "1.2.3",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`Missing macOS x64 DMG: Markra_1\\.2\\.3_macos_x64\\.dmg under ${assetsRoot}`));
  assert.equal(fs.existsSync(outputPath), false);
});

test("release workflow generates and publishes the Homebrew cask separately from release assets", () => {
  const workflow = fs.readFileSync(releaseWorkflowPath, "utf8");

  assert.match(workflow, /Generate Homebrew cask/);
  assert.match(workflow, /generate-homebrew-cask\.mjs/);
  assert.match(workflow, /OUTPUT_PATH: generated\/homebrew\/Casks\/markra\.rb/);
  assert.match(workflow, /Upload Homebrew cask artifact/);
  assert.match(workflow, /name: \$\{\{ env\.APP_SLUG \}\}-homebrew-cask/);
  assert.match(workflow, /Prepare Homebrew tap checkout/);
  assert.match(workflow, /git -c http\.extraheader="AUTHORIZATION: bearer \$\{HOMEBREW_TAP_TOKEN\}" ls-remote --symref "\$\{tap_url\}" HEAD/);
  assert.match(workflow, /git -C homebrew-tap init -b "\$\{tap_branch\}"/);
  assert.match(workflow, /Publish Homebrew cask to tap/);
  assert.match(workflow, /HOMEBREW_TAP_TOKEN/);
  assert.match(workflow, /tap_url="https:\/\/github\.com\/markrahq\/homebrew-tap\.git"/);
  assert.match(workflow, /git -C homebrew-tap -c http\.extraheader="AUTHORIZATION: bearer \$\{HOMEBREW_TAP_TOKEN\}" push -u origin "HEAD:\$\{tap_branch\}"/);
  assert.match(workflow, /git -C homebrew-tap status --porcelain -- Casks\/markra\.rb/);
});
