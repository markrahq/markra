import { spawnSync } from "node:child_process";

if (process.platform !== "darwin") process.exit(0);

const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE?.trim() ?? "";
const quickLookArch = targetTriple.startsWith("aarch64-")
  ? "arm64"
  : targetTriple.startsWith("x86_64-")
    ? "x86_64"
    : process.env.QUICKLOOK_ARCH?.trim() ?? "";

const result = spawnSync("bash", ["scripts/build-macos-quicklook.sh"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    ...(quickLookArch ? { QUICKLOOK_ARCH: quickLookArch } : {})
  },
  stdio: "inherit"
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
