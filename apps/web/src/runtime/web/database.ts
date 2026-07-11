import type { IndexedDbSettingsRuntimeOptions } from "./types";

export const webRuntimeDatabaseVersion = 2;
export const webRuntimeSettingsStoreName = "stores";
export const webRuntimeAiChatAttachmentStoreName = "ai-chat-attachments";

export function resolveIndexedDbFactory(indexedDb?: IDBFactory | null) {
  if (indexedDb) return indexedDb;
  if (typeof globalThis.indexedDB !== "undefined") return globalThis.indexedDB;

  throw new Error("IndexedDB is unavailable in this runtime.");
}

export function requestToPromise<TResult>(request: IDBRequest<TResult>) {
  return new Promise<TResult>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    };
  });
}

export function openWebRuntimeDatabase(
  options: IndexedDbSettingsRuntimeOptions,
  settingsStoreName = webRuntimeSettingsStoreName
) {
  const indexedDb = resolveIndexedDbFactory(options.indexedDB);
  const request = indexedDb.open(options.databaseName ?? "markra-web-runtime", webRuntimeDatabaseVersion);

  return new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(settingsStoreName)) {
        database.createObjectStore(settingsStoreName, { keyPath: "path" });
      }
      if (!database.objectStoreNames.contains(webRuntimeAiChatAttachmentStoreName)) {
        database.createObjectStore(webRuntimeAiChatAttachmentStoreName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB open failed."));
    };
    request.onblocked = () => {
      reject(new Error("IndexedDB open was blocked by another connection."));
    };
  });
}
