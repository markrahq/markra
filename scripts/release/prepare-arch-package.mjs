import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function walkFiles(rootDir) {
  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const currentDir = stack.pop();

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const releaseAssetsRoot = requireEnv("RELEASE_ASSETS_ROOT");
const packageDir = requireEnv("ARCH_PACKAGE_DIR");
const releaseVersion = requireEnv("RELEASE_VERSION").replace(/^v/u, "");
// PKGBUILD versions cannot contain hyphens, while semver prerelease tags can.
const packageVersion = releaseVersion.replace(/-/gu, "_");
const debName = `Markra_${releaseVersion}_linux_x64.deb`;
const matchingDebs = walkFiles(releaseAssetsRoot).filter((filePath) => path.basename(filePath) === debName);

if (matchingDebs.length !== 1) {
  throw new Error(`Expected exactly one ${debName} release artifact, found ${matchingDebs.length}.`);
}

const debPath = matchingDebs[0];
const pkgbuild = `pkgname=markra
pkgver=${packageVersion}
pkgrel=1
pkgdesc='AI-native Markdown editor'
arch=('x86_64')
url='https://github.com/markrahq/markra'
license=('AGPL-3.0-only')
depends=('gtk3' 'libayatana-appindicator' 'webkit2gtk-4.1')
conflicts=('markra-bin')
options=('!strip' '!debug')
source=('${debName}')
noextract=('${debName}')
sha256sums=('${sha256(debPath)}')

_deb='${debName}'

package() {
  bsdtar -xf "\${srcdir}/\${_deb}" -C "\${srcdir}"
  bsdtar -xf "\${srcdir}"/data.tar.* -C "\${pkgdir}"
}
`;

fs.mkdirSync(packageDir, { recursive: true });
fs.copyFileSync(debPath, path.join(packageDir, debName));
fs.writeFileSync(path.join(packageDir, "PKGBUILD"), pkgbuild);
