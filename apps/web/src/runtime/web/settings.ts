import type {
  AppSettingsRuntime,
  RuntimeStoreLoadOptions
} from "@markra/app/runtime";
import type { IndexedDbSettingsRuntimeOptions } from "./types";
import { openWebRuntimeDatabase, requestToPromise, webRuntimeSettingsStoreName } from "./database";

type IndexedDbSettingsRecord = {
  path: string;
  values: Record<string, unknown>;
};

function normalizeRecordValues(record: IndexedDbSettingsRecord | undefined) {
  if (record && typeof record.values === "object" && record.values !== null) {
    return record.values;
  }

  return {};
}

export function createIndexedDbSettingsRuntime(
  options: IndexedDbSettingsRuntimeOptions = {}
): AppSettingsRuntime {
  const objectStoreName = options.objectStoreName ?? webRuntimeSettingsStoreName;
  let databasePromise: Promise<IDBDatabase> | null = null;

  async function getDatabase() {
    databasePromise ??= openWebRuntimeDatabase(options, objectStoreName);

    return databasePromise;
  }

  async function readStore(path: string) {
    const database = await getDatabase();
    const transaction = database.transaction(objectStoreName, "readonly");
    const objectStore = transaction.objectStore(objectStoreName);

    return requestToPromise<IndexedDbSettingsRecord | undefined>(objectStore.get(path));
  }

  async function writeStore(path: string, values: Record<string, unknown>) {
    const database = await getDatabase();
    const transaction = database.transaction(objectStoreName, "readwrite");
    const objectStore = transaction.objectStore(objectStoreName);

    await requestToPromise(objectStore.put({ path, values }));
  }

  return {
    async loadStore(path: string, loadOptions: RuntimeStoreLoadOptions) {
      const record = await readStore(path);
      const values = new Map<string, unknown>([
        ...Object.entries(loadOptions.defaults),
        ...Object.entries(normalizeRecordValues(record))
      ]);

      async function save() {
        await writeStore(path, Object.fromEntries(values));
      }

      return {
        async delete(key) {
          values.delete(key);
          if (loadOptions.autoSave) await save();
        },
        async get<T>(key: string) {
          return values.get(key) as T | undefined;
        },
        save,
        async set(key, value) {
          values.set(key, value);
          if (loadOptions.autoSave) await save();
        }
      };
    }
  };
}
