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

function extractWorkflowRunScript(stepName) {
  const workflow = fs.readFileSync(releaseWorkflowPath, "utf8");
  const stepStart = workflow.indexOf(`- name: ${stepName}`);

  assert.notEqual(stepStart, -1, `${stepName} step should exist`);

  const runStart = workflow.indexOf("run: |", stepStart);

  assert.notEqual(runStart, -1, `${stepName} step should have a shell script`);

  const scriptStart = workflow.indexOf("\n", runStart) + 1;
  const nextStep = workflow.indexOf("\n      - name:", scriptStart);
  const block = workflow.slice(scriptStart, nextStep === -1 ? workflow.length : nextStep);

  return `${block
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n")
    .trimEnd()}\n`;
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
  assert.doesNotMatch(cask, /verified:/);
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

test("release workflow can prepare an empty Homebrew tap checkout", () => {
  const rootDir = makeTempDir();
  const binDir = path.join(rootDir, "bin");
  const gitLogPath = path.join(rootDir, "git.log");
  const githubEnvPath = path.join(rootDir, "github.env");
  const scriptPath = path.join(rootDir, "prepare-homebrew-tap.sh");
  const fakeGitPath = path.join(binDir, "git");

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(scriptPath, extractWorkflowRunScript("Prepare Homebrew tap checkout"));
  fs.writeFileSync(
    fakeGitPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${gitLogPath}"

args=("$@")
if [[ "\${args[0]}" == "-c" ]]; then
  args=("\${args[@]:2}")
fi

if [[ "\${args[0]}" == "ls-remote" && "\${args[1]}" == "--symref" ]]; then
  printf 'ref: refs/heads/main\\tHEAD\\n'
  printf '0000000000000000000000000000000000000000\\tHEAD\\n'
  exit 0
fi

if [[ "\${args[0]}" == "ls-remote" && "\${args[1]}" == "--exit-code" ]]; then
  exit 2
fi

if [[ "\${args[0]}" == "-C" && "\${args[2]}" == "init" ]]; then
  mkdir -p "\${args[1]}/.git"
  exit 0
fi

if [[ "\${args[0]}" == "-C" && "\${args[2]}" == "remote" ]]; then
  exit 0
fi

printf 'unexpected git call: %s\\n' "$*" >&2
exit 1
`,
  );
  fs.chmodSync(fakeGitPath, 0o755);

  const result = spawnSync("bash", [scriptPath], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_ENV: githubEnvPath,
      HOMEBREW_TAP_TOKEN: "synthetic-token",
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(rootDir, "homebrew-tap", ".git")), true);
  assert.match(fs.readFileSync(githubEnvPath, "utf8"), /^HOMEBREW_TAP_BRANCH=main$/m);
  assert.match(fs.readFileSync(gitLogPath, "utf8"), /ls-remote --symref https:\/\/github\.com\/markrahq\/homebrew-tap\.git HEAD/);
  assert.match(fs.readFileSync(gitLogPath, "utf8"), /init -b main/);
});

test("release workflow clones an existing public Homebrew tap without read authentication", () => {
  const rootDir = makeTempDir();
  const binDir = path.join(rootDir, "bin");
  const gitLogPath = path.join(rootDir, "git.log");
  const githubEnvPath = path.join(rootDir, "github.env");
  const scriptPath = path.join(rootDir, "prepare-homebrew-tap.sh");
  const fakeGitPath = path.join(binDir, "git");

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(scriptPath, extractWorkflowRunScript("Prepare Homebrew tap checkout"));
  fs.writeFileSync(
    fakeGitPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${gitLogPath}"

args=("$@")
if [[ "\${args[0]}" == "-c" ]]; then
  args=("\${args[@]:2}")
fi

if [[ "\${args[0]}" == "ls-remote" && "\${args[1]}" == "--symref" ]]; then
  printf 'ref: refs/heads/main\\tHEAD\\n'
  printf '0000000000000000000000000000000000000000\\tHEAD\\n'
  exit 0
fi

if [[ "\${args[0]}" == "ls-remote" && "\${args[1]}" == "--exit-code" ]]; then
  exit 0
fi

if [[ "\${args[0]}" == "clone" ]]; then
  mkdir -p "\${args[\${#args[@]} - 1]}/.git"
  exit 0
fi

printf 'unexpected git call: %s\\n' "$*" >&2
exit 1
`,
  );
  fs.chmodSync(fakeGitPath, 0o755);

  const result = spawnSync("bash", [scriptPath], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_ENV: githubEnvPath,
      HOMEBREW_TAP_TOKEN: "synthetic-token",
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(rootDir, "homebrew-tap", ".git")), true);
  assert.match(fs.readFileSync(githubEnvPath, "utf8"), /^HOMEBREW_TAP_BRANCH=main$/m);

  const gitLog = fs.readFileSync(gitLogPath, "utf8");

  assert.match(gitLog, /clone --depth 1 --branch main https:\/\/github\.com\/markrahq\/homebrew-tap\.git homebrew-tap/);
  assert.doesNotMatch(gitLog, /http\.extraheader/i);
  assert.doesNotMatch(gitLog, /AUTHORIZATION: bearer/i);
});

test("release workflow publishes the Homebrew tap with token authentication", () => {
  const rootDir = makeTempDir();
  const binDir = path.join(rootDir, "bin");
  const gitLogPath = path.join(rootDir, "git.log");
  const scriptPath = path.join(rootDir, "publish-homebrew-cask.sh");
  const fakeGitPath = path.join(binDir, "git");

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.join(rootDir, "generated", "homebrew", "Casks"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "homebrew-tap", ".git"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, "generated", "homebrew", "Casks", "markra.rb"), "cask");
  fs.writeFileSync(scriptPath, extractWorkflowRunScript("Publish Homebrew cask to tap"));
  fs.writeFileSync(
    fakeGitPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${gitLogPath}"

args=("$@")
if [[ "\${args[0]}" == "-C" ]]; then
  args=("\${args[@]:2}")
fi
if [[ "\${args[0]}" == "-c" ]]; then
  args=("\${args[@]:2}")
fi

case "\${args[0]}" in
  status)
    printf ' M Casks/markra.rb\\n'
    ;;
  config|add|commit)
    ;;
  push)
    if [[ "\${args[*]}" != *"https://x-access-token:synthetic-token@github.com/markrahq/homebrew-tap.git"* ]]; then
      printf 'missing authenticated tap push URL: %s\\n' "$*" >&2
      exit 1
    fi
    ;;
  *)
    printf 'unexpected git call: %s\\n' "$*" >&2
    exit 1
    ;;
esac
`,
  );
  fs.chmodSync(fakeGitPath, 0o755);

  const result = spawnSync("bash", [scriptPath], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      HOMEBREW_TAP_BRANCH: "main",
      HOMEBREW_TAP_TOKEN: "synthetic-token",
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      RELEASE_TAG: "v1.3.0",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(gitLogPath, "utf8"), /push -u https:\/\/x-access-token:synthetic-token@github\.com\/markrahq\/homebrew-tap\.git HEAD:main/);
});

test("release workflow generates and publishes the Homebrew cask separately from release assets", () => {
  const workflow = fs.readFileSync(releaseWorkflowPath, "utf8");
  const prereleaseGuards = workflow.match(/!contains\(env\.RELEASE_TAG, '-'\)/gu) ?? [];

  assert.match(workflow, /Generate Homebrew cask/);
  assert.match(workflow, /generate-homebrew-cask\.mjs/);
  assert.match(workflow, /OUTPUT_PATH: generated\/homebrew\/Casks\/markra\.rb/);
  assert.match(workflow, /Upload Homebrew cask artifact/);
  assert.match(workflow, /name: \$\{\{ env\.APP_SLUG \}\}-homebrew-cask/);
  assert.match(workflow, /Prepare Homebrew tap checkout/);
  assert.match(workflow, /git ls-remote --symref "\$\{tap_url\}" HEAD/);
  assert.match(workflow, /tap_branch="\$\{ref#refs\/heads\/\}"/);
  assert.match(workflow, /git -C homebrew-tap init -b "\$\{tap_branch\}"/);
  assert.match(workflow, /Publish Homebrew cask to tap/);
  assert.match(workflow, /HOMEBREW_TAP_TOKEN/);
  assert.match(workflow, /tap_url="https:\/\/github\.com\/markrahq\/homebrew-tap\.git"/);
  assert.match(workflow, /git -C homebrew-tap push -u "https:\/\/x-access-token:\$\{HOMEBREW_TAP_TOKEN\}@github\.com\/markrahq\/homebrew-tap\.git" "HEAD:\$\{tap_branch\}"/);
  assert.match(workflow, /git -C homebrew-tap status --porcelain -- Casks\/markra\.rb/);
  assert.equal(prereleaseGuards.length, 4);
});
