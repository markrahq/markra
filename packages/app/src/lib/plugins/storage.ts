import type { PluginStorage } from "@markra/plugin-api";
import { getAppRuntime } from "../../runtime";

export function createPluginStorage(pluginId: string): PluginStorage {
  const storePath = `plugins/${pluginId}/settings.json`;

  return {
    async get<T>(key: string, fallback: T) {
      const store = await loadPluginStore(storePath);
      const value = await store.get<T>(key);

      return value === undefined ? fallback : value;
    },
    async remove(key: string) {
      const store = await loadPluginStore(storePath);

      await store.delete(key);
      return store.save();
    },
    async set<T>(key: string, value: T) {
      const store = await loadPluginStore(storePath);

      await store.set(key, value);
      return store.save();
    }
  };
}

function loadPluginStore(path: string) {
  return getAppRuntime().settings.loadStore(path, { autoSave: false, defaults: {} });
}
