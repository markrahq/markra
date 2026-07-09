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

    if (!currentDir || !fs.existsSync(currentDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function findFileByBasename(rootDir, fileName) {
  return walkFiles(rootDir).find((filePath) => path.basename(filePath) === fileName) || null;
}

function requireDmg(rootDir, version, arch) {
  const fileName = `Markra_${version}_macos_${arch}.dmg`;
  const filePath = findFileByBasename(rootDir, fileName);

  if (!filePath) {
    throw new Error(`Missing macOS ${arch} DMG: ${fileName} under ${rootDir}`);
  }

  return filePath;
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

function renderCask({ armSha256, intelSha256, repository, version }) {
  return `cask "markra" do
  arch arm: "arm64", intel: "x64"

  version "${version}"
  sha256 arm: "${armSha256}",
         intel: "${intelSha256}"

  url "https://github.com/${repository}/releases/download/v#{version}/Markra_#{version}_macos_#{arch}.dmg",
      verified: "github.com/${repository}/"

  name "Markra"
  desc "AI-native Markdown editor"
  homepage "https://github.com/${repository}"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true

  app "Markra.app"
end
`;
}

async function main() {
  const root = process.env.RELEASE_ASSETS_ROOT || "release-assets";
  const version = requireEnv("RELEASE_VERSION").replace(/^v/, "");
  const repository = process.env.GITHUB_REPOSITORY?.trim() || "markrahq/markra";
  const outputPath = process.env.OUTPUT_PATH || path.join("generated", "homebrew", "Casks", "markra.rb");
  const armDmg = requireDmg(root, version, "arm64");
  const intelDmg = requireDmg(root, version, "x64");
  const cask = renderCask({
    armSha256: await sha256File(armDmg),
    intelSha256: await sha256File(intelDmg),
    repository,
    version,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, cask);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
