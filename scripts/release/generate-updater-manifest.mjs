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
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function findFileByBasename(rootDir, fileName) {
  return walkFiles(rootDir).find((filePath) => path.basename(filePath) === fileName) || null;
}

const root = process.env.RELEASE_ASSETS_ROOT || "release-assets";
const version = requireEnv("RELEASE_VERSION");
const releaseTag = process.env.RELEASE_TAG?.trim() || `v${version.replace(/^v/u, "")}`;
const notesPath = process.env.RELEASE_NOTES_PATH || "release-notes.md";
const repository = requireEnv("GITHUB_REPOSITORY");
const notes = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, "utf8").trim() : "";
const expectedPlatforms = (process.env.EXPECTED_UPDATER_PLATFORMS || "")
  .split(",")
  .map((platform) => platform.trim())
  .filter(Boolean);
const metadataPaths = walkFiles(root)
  .filter((filePath) => {
    const fileName = path.basename(filePath);
    return fileName.startsWith("release-metadata") && fileName.endsWith(".json");
  })
  .sort();

const platforms = {};

for (const metadataPath of metadataPaths) {
  const artifactDir = path.dirname(metadataPath);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

  if (!metadata.updaterPlatform || !metadata.bundleName || !metadata.signatureName) {
    throw new Error(`Invalid updater metadata: ${metadataPath}`);
  }

  if (platforms[metadata.updaterPlatform]) {
    throw new Error(`Duplicate updater metadata for ${metadata.updaterPlatform}.`);
  }

  const bundlePath = findFileByBasename(artifactDir, metadata.bundleName);
  const signaturePath = findFileByBasename(artifactDir, metadata.signatureName);

  if (!bundlePath || !fs.existsSync(bundlePath)) {
    throw new Error(`Missing updater bundle: ${metadata.bundleName} in ${artifactDir}`);
  }

  if (!signaturePath || !fs.existsSync(signaturePath)) {
    throw new Error(`Missing updater signature: ${metadata.signatureName} in ${artifactDir}`);
  }

  // Pin assets to this tag because GitHub's /latest route excludes prereleases.
  platforms[metadata.updaterPlatform] = {
    signature: fs.readFileSync(signaturePath, "utf8").trim(),
    url: `https://github.com/${repository}/releases/download/${encodeURIComponent(releaseTag)}/${encodeURIComponent(metadata.bundleName)}`,
  };
}

if (Object.keys(platforms).length === 0) {
  throw new Error("No updater platforms were collected from workflow artifacts.");
}

for (const expectedPlatform of expectedPlatforms) {
  if (!platforms[expectedPlatform]) {
    throw new Error(`Missing updater metadata for ${expectedPlatform}.`);
  }
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.writeFileSync(path.join(root, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
