import {
  configureAppRuntime,
  createDefaultAppRuntime,
  resetAppRuntimeForTests,
  type RuntimeStore
} from "../../runtime";
import { createPluginStorage } from "./storage";

describe("plugin storage", () => {
  afterEach(() => {
    resetAppRuntimeForTests();
  });

  it("stores plugin values in a plugin-scoped settings store", async () => {
    const stores = new Map<string, Map<string, unknown>>();
    const loadStore = vi.fn(async (path: string): Promise<RuntimeStore> => {
      if (!stores.has(path)) stores.set(path, new Map());
      const store = stores.get(path)!;

      return {
        async delete(key) {
          store.delete(key);
        },
        async get<T>(key: string) {
          return store.get(key) as T | undefined;
        },
        async save() {
          return undefined;
        },
        async set(key, value) {
          store.set(key, value);
        }
      };
    });
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      settings: {
        loadStore
      }
    });

    const referenceStorage = createPluginStorage("reference");
    const otherStorage = createPluginStorage("pandoc-tools");

    await expect(referenceStorage.get("path", "fallback.bib")).resolves.toBe("fallback.bib");
    await referenceStorage.set("path", "refs.bib");
    await otherStorage.set("path", "pandoc.bib");
    await expect(referenceStorage.get("path", "fallback.bib")).resolves.toBe("refs.bib");
    await expect(otherStorage.get("path", "fallback.bib")).resolves.toBe("pandoc.bib");
    await referenceStorage.remove("path");
    await expect(referenceStorage.get("path", "fallback.bib")).resolves.toBe("fallback.bib");

    expect(loadStore).toHaveBeenCalledWith("plugins/reference/settings.json", { autoSave: false, defaults: {} });
    expect(loadStore).toHaveBeenCalledWith("plugins/pandoc-tools/settings.json", { autoSave: false, defaults: {} });
  });
});
