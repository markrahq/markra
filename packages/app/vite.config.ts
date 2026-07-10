import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const appPackage = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version?: string };
const browserNodeStubPath = fileURLToPath(new URL("./src/lib/browser-node-stub.ts", import.meta.url));
const localTestWorkerConfig = process.env.CI
  ? {}
  : {
      maxWorkers: "67%" as const,
      pool: "threads" as const
    };

export default defineConfig(({ mode }) => ({
  define: {
    __MARKRA_APP_VERSION__: JSON.stringify(appPackage.version ?? "0.0.0"),
    __MARKRA_DEBUG__: JSON.stringify(mode !== "production")
  },
  resolve: mode === "test"
    ? undefined
    : {
        alias: [
          {
            find: /^node:(?:fs|os|path)$/,
            replacement: browserNodeStubPath
          }
        ]
      },
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    globals: true,
    ...localTestWorkerConfig,
    setupFiles: "./src/test/setup.ts"
  }
}));
