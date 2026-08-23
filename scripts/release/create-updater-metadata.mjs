import fs from "node:fs";
import path from "node:path";

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function readArtifactPaths() {
  return (process.env.ARTIFACT_PATHS_RAW || "")
    .split(/\r?\n/)
    .map((artifactPath) => artifactPath.trim())
    .filter(Boolean);
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function basename(filePath) {
  return path.basename(filePath);
}

function signatureMatchersForPlatform(platform) {
  if (platform.startsWith("darwin-")) {
    return [/\.app\.tar\.gz\.sig$/];
  }

  if (platform.startsWith("linux-")) {
    return [/\.AppImage\.sig$/, /\.AppImage\.tar\.gz\.sig$/, /\.tar\.gz\.sig$/];
  }

  if (platform.startsWith("windows-portable-")) {
    return [/_portable\.zip\.sig$/];
  }

  if (platform.startsWith("windows-")) {
    return [/setup\.exe\.sig$/, /\.msi\.sig$/, /nsis.*\.zip\.sig$/, /msi.*\.zip\.sig$/, /\.exe\.sig$/, /\.zip\.sig$/];
  }

  throw new Error(`Unsupported updater platform: ${platform}`);
}

function findUpdaterSignature(artifactPaths, platform) {
  for (const matcher of signatureMatchersForPlatform(platform)) {
    const signaturePath = artifactPaths.find((artifactPath) => {
      if (!matcher.test(basename(artifactPath))) {
        return false;
      }

      return isFile(artifactPath) && isFile(artifactPath.slice(0, -4));
    });

    if (signaturePath) {
      return signaturePath;
    }
  }

  return null;
}

const updaterPlatform = requireEnv("UPDATER_PLATFORM");
const outputPath = process.env.OUTPUT_PATH || "release-metadata.json";
const artifactPaths = readArtifactPaths();
const signaturePath = findUpdaterSignature(artifactPaths, updaterPlatform);

if (!signaturePath) {
  throw new Error(`No updater signature artifact found for ${updaterPlatform}.`);
}

const bundlePath = signaturePath.slice(0, -4);
const metadata = {
  updaterPlatform,
  bundleName: basename(bundlePath),
  signatureName: basename(signaturePath),
};

fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
