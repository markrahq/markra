import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const workflowPath = path.join(repoRoot, ".github", "workflows", "release.yml");

test("release workflow resolves a stable or preview updater endpoint before bundling", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /name: Resolve updater endpoint/);
  assert.match(workflow, /resolve-updater-endpoint\.mjs/);
  assert.match(workflow, /TAURI_UPDATER_ENDPOINT: \$\{\{ steps\.updater_endpoint\.outputs\.endpoint \}\}/);
});

test("release workflow keeps a rolling preview manifest for non-draft releases", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /name: Publish preview updater manifest/);
  assert.match(workflow, /github\.event_name != 'workflow_dispatch' \|\| !inputs\.draft/);
  assert.match(workflow, /gh release view preview/);
  assert.match(workflow, /gh release create preview/);
  assert.match(workflow, /gh release upload preview release-assets\/latest\.json --clobber/);
});

test("release workflow excludes deb package internals from GitHub release assets", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /! -name 'control\.tar\.gz'/);
  assert.match(workflow, /! -name 'data\.tar\.gz'/);
});

test("release workflow builds and publishes an Arch Linux package from the x64 deb", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /name: Prepare Arch Linux package/);
  assert.match(workflow, /prepare-arch-package\.mjs/);
  assert.match(workflow, /archlinux:base-devel/);
  assert.match(workflow, /makepkg --noconfirm --nodeps/);
  assert.match(workflow, /Markra_\$\{version\}_linux_x64\.pkg\.tar\.zst/);
  assert.match(workflow, /"\.pkg\.tar\.zst"/);
});
