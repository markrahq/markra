import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "bumpp";

const desktopPackagePath = "apps/desktop/package.json";
const cargoManifestPath = "apps/desktop/src-tauri/Cargo.toml";
const tauriConfigPath = "apps/desktop/src-tauri/tauri.conf.json";
const cargoLockPath = "apps/desktop/src-tauri/Cargo.lock";
const changelogPath = "CHANGELOG.md";

export const bumppFilePaths = ["package.json", desktopPackagePath];

export function updateCargoPackageVersion(contents, newVersion) {
  const lines = contents.split(/(?<=\n)/u);
  let inPackageSection = false;
  let updated = false;

  const nextLines = lines.map((line) => {
    const trimmedLine = line.trim();

    if (/^\[[^\]]+\]$/u.test(trimmedLine)) {
      inPackageSection = trimmedLine === "[package]";
    }

    if (!inPackageSection || updated) {
      return line;
    }

    return line.replace(/^(\s*version\s*=\s*)"[^"]*"/u, (_match, prefix) => {
      updated = true;
      return `${prefix}"${newVersion}"`;
    });
  });

  if (!updated) {
    throw new Error(`Unable to find [package] version in ${cargoManifestPath}`);
  }

  return nextLines.join("");
}

function addUpdatedFile(operation, relativePath) {
  const absolutePath = path.resolve(operation.options.cwd, relativePath);

  if (!operation.state.updatedFiles.includes(absolutePath)) {
    operation.update({
      updatedFiles: [...operation.state.updatedFiles, absolutePath],
    });
  }
}

export function syncCargoPackageVersion(operation) {
  const absolutePath = path.resolve(operation.options.cwd, cargoManifestPath);
  const contents = fs.readFileSync(absolutePath, "utf8");
  const nextContents = updateCargoPackageVersion(contents, operation.state.newVersion);

  if (nextContents === contents) {
    return;
  }

  fs.writeFileSync(absolutePath, nextContents);
  addUpdatedFile(operation, cargoManifestPath);
}

function syncTauriVersion(operation) {
  const absolutePath = path.resolve(operation.options.cwd, tauriConfigPath);
  const config = JSON.parse(fs.readFileSync(absolutePath, "utf8"));

  if (config.version === operation.state.newVersion) {
    return;
  }

  config.version = operation.state.newVersion;
  fs.writeFileSync(absolutePath, `${JSON.stringify(config, null, 2)}\n`);
  addUpdatedFile(operation, tauriConfigPath);
}

function syncCargoLock(operation) {
  execFileSync("cargo", ["update", "--manifest-path", "apps/desktop/src-tauri/Cargo.toml", "-w"], {
    cwd: operation.options.cwd,
    stdio: "inherit",
  });

  addUpdatedFile(operation, cargoLockPath);
}

export function generateChangelog({ cwd }) {
  execFileSync("pnpm", ["exec", "conventional-changelog", "-p", "conventionalcommits", "-i", changelogPath, "-s"], {
    cwd,
    stdio: "inherit",
  });
}

export function syncChangelog(operation, dependencies = { generateChangelog }) {
  dependencies.generateChangelog({
    cwd: operation.options.cwd,
    version: operation.state.newVersion,
  });
  addUpdatedFile(operation, changelogPath);
}

export default defineConfig({
  execute(operation) {
    syncCargoPackageVersion(operation);
    syncTauriVersion(operation);
    syncCargoLock(operation);
    syncChangelog(operation);
  },
  files: bumppFilePaths,
});
