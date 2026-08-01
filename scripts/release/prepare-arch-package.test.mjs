import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function runPrepareScript(rootDir, env = {}) {
  return spawnSync(process.execPath, ["scripts/release/prepare-arch-package.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ARCH_PACKAGE_DIR: path.join(rootDir, "generated", "arch"),
      RELEASE_ASSETS_ROOT: path.join(rootDir, "release-assets"),
      RELEASE_VERSION: "v2.4.0",
      ...env,
    },
  });
}

test("prepare-arch-package creates a reproducible x86_64 PKGBUILD from the release deb", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "markra-arch-package-"));
  const debPath = path.join(rootDir, "release-assets", "Linux-x64", "Markra_2.4.0_linux_x64.deb");
  const debContents = Buffer.from("synthetic deb payload");

  fs.mkdirSync(path.dirname(debPath), { recursive: true });
  fs.writeFileSync(debPath, debContents);

  const result = runPrepareScript(rootDir);

  assert.equal(result.status, 0, result.stderr);

  const packageDir = path.join(rootDir, "generated", "arch");
  const copiedDebPath = path.join(packageDir, path.basename(debPath));
  const pkgbuild = fs.readFileSync(path.join(packageDir, "PKGBUILD"), "utf8");
  const expectedHash = crypto.createHash("sha256").update(debContents).digest("hex");

  assert.deepEqual(fs.readFileSync(copiedDebPath), debContents);
  assert.match(pkgbuild, /^pkgname=markra$/m);
  assert.match(pkgbuild, /^pkgver=2\.4\.0$/m);
  assert.match(pkgbuild, /^pkgrel=1$/m);
  assert.match(pkgbuild, /^arch=\('x86_64'\)$/m);
  assert.match(pkgbuild, /^license=\('AGPL-3\.0-only'\)$/m);
  assert.match(pkgbuild, /^depends=\('gtk3' 'libayatana-appindicator' 'webkit2gtk-4\.1'\)$/m);
  assert.match(pkgbuild, /^options=\('!strip' '!debug'\)$/m);
  assert.match(pkgbuild, /^noextract=\('Markra_2\.4\.0_linux_x64\.deb'\)$/m);
  assert.match(pkgbuild, new RegExp(`^sha256sums=\\('${expectedHash}'\\)$`, "m"));
  assert.match(pkgbuild, /bsdtar -xf "\$\{srcdir\}\/\$\{_deb\}" -C "\$\{srcdir\}"/);
  assert.match(pkgbuild, /bsdtar -xf "\$\{srcdir\}"\/data\.tar\.\* -C "\$\{pkgdir\}"/);
});

test("prepare-arch-package fails when the normalized x64 deb is missing", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "markra-arch-package-missing-"));
  fs.mkdirSync(path.join(rootDir, "release-assets"), { recursive: true });

  const result = runPrepareScript(rootDir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Markra_2\.4\.0_linux_x64\.deb/);
});

test("prepare-arch-package converts semver prerelease hyphens for PKGBUILD", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "markra-arch-package-prerelease-"));
  const debPath = path.join(rootDir, "release-assets", "Markra_2.5.0-beta.1_linux_x64.deb");

  fs.mkdirSync(path.dirname(debPath), { recursive: true });
  fs.writeFileSync(debPath, "synthetic prerelease deb payload");

  const result = runPrepareScript(rootDir, { RELEASE_VERSION: "v2.5.0-beta.1" });

  assert.equal(result.status, 0, result.stderr);

  const pkgbuild = fs.readFileSync(path.join(rootDir, "generated", "arch", "PKGBUILD"), "utf8");
  assert.match(pkgbuild, /^pkgver=2\.5\.0_beta\.1$/m);
  assert.match(pkgbuild, /^source=\('Markra_2\.5\.0-beta\.1_linux_x64\.deb'\)$/m);
});
