import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") process.exit(0);

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// actool's app-icon name must match CFBundleIconName in Info.plist.
const iconName = "Markra";
const source = join(desktopRoot, "src-tauri", "icons", `${iconName}.icon`);
const output = join(desktopRoot, "src-tauri", "icons", "generated");
const catalog = join(output, "Assets.car");
const partialPlist = join(output, "partial.plist");

let versionOutput;
try {
  versionOutput = execFileSync("xcodebuild", ["-version"], { encoding: "utf8" });
} catch {
  throw new Error("Building the macOS adaptive icon requires Xcode 26 or later.");
}

const versionMatch = /^Xcode\s+(\d+)(?:\.(\d+))?/m.exec(versionOutput);
const majorVersion = Number(versionMatch?.[1] ?? 0);
if (majorVersion < 26) {
  throw new Error(
    `Building the macOS adaptive icon requires Xcode 26 or later; found ${versionOutput.trim()}.`
  );
}

rmSync(output, { force: true, recursive: true });
mkdirSync(output, { recursive: true });

try {
  execFileSync(
    "xcrun",
    [
      "actool",
      source,
      "--compile",
      output,
      "--output-partial-info-plist",
      partialPlist,
      "--app-icon",
      iconName,
      "--enable-on-demand-resources",
      "NO",
      "--target-device",
      "mac",
      "--minimum-deployment-target",
      "10.13",
      "--platform",
      "macosx"
    ],
    { stdio: "inherit" }
  );
} catch (error) {
  throw new Error("Failed to compile the macOS adaptive icon with Xcode actool.", { cause: error });
}

if (!existsSync(catalog)) {
  throw new Error(`actool did not produce the expected asset catalog at ${catalog}.`);
}
