import { describe, expect, it } from "vitest";
import type { UserConfig, UserConfigExport } from "vite";
import { createMarkraAppViteConfig } from "./index";

async function resolveConfig(configExport: UserConfigExport) {
  if (typeof configExport === "function") {
    return configExport({
      command: "serve",
      isPreview: false,
      isSsrBuild: false,
      mode: "development"
    });
  }

  return configExport;
}

function resolveAliasEntries(config: UserConfig) {
  const alias = config.resolve?.alias;

  return Array.isArray(alias) ? alias : [];
}

describe("createMarkraAppViteConfig", () => {
  it("aliases built-in plugin workspace packages for host app builds", async () => {
    const config = await resolveConfig(createMarkraAppViteConfig({
      browserNodeStubUrl: new URL("../../../app/src/lib/browser-node-stub.ts", import.meta.url),
      packageJsonUrl: new URL("../../../app/package.json", import.meta.url),
      stripDebug: false
    })) as UserConfig;
    const aliases = resolveAliasEntries(config);

    expect(aliases).toEqual(expect.arrayContaining([
      expect.objectContaining({
        find: "@markra/document-stats",
        replacement: expect.stringContaining("/packages/document-stats/src/index.ts")
      }),
      expect.objectContaining({
        find: "@markra/plugin-api",
        replacement: expect.stringContaining("/packages/plugin-api/src/index.ts")
      }),
      expect.objectContaining({
        find: "@markra/plugin-api/react",
        replacement: expect.stringContaining("/packages/plugin-api/src/react.ts")
      }),
      expect.objectContaining({
        find: "@markra/ui/settings",
        replacement: expect.stringContaining("/packages/ui/src/settings.tsx")
      })
    ]));
  });
});
