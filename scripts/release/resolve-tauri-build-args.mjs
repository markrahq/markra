function readEnv(name) {
  return process.env[name]?.trim() || "";
}

function splitArgs(value) {
  return value.split(/\s+/).filter(Boolean);
}

function hasBundleOverride(args) {
  return args.some((arg) => arg === "--bundles" || arg === "-b" || arg.startsWith("--bundles="));
}

function isPrereleaseTag(tag) {
  const version = tag.replace(/^v/u, "");
  return version.includes("-");
}

const args = splitArgs(readEnv("TAURI_BUILD_ARGS"));
const platform = readEnv("ASSET_PLATFORM");
const releaseTag = readEnv("RELEASE_TAG");

if (platform === "windows" && isPrereleaseTag(releaseTag) && !hasBundleOverride(args)) {
  args.push("--bundles", "nsis");
}

process.stdout.write(`${args.join(" ")}\n`);
