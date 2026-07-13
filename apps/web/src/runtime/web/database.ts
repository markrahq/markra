import type { IndexedDbSettingsRuntimeOptions } from "./types";

export const webRuntimeDatabaseVersion = 3;
export const webRuntimeSettingsStoreName = "stores";
export const webRuntimeAiChatAttachmentStoreName = "ai-chat-attachments";
export const webRuntimeWorkspaceStoreName = "workspaces";
export const webRuntimeWorkspaceEntryStoreName = "workspace-entries";

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

export function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<unknown>((resolve, reject) => {
    transaction.oncomplete = () => resolve(undefined);
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
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
      if (!database.objectStoreNames.contains(webRuntimeWorkspaceStoreName)) {
        database.createObjectStore(webRuntimeWorkspaceStoreName, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(webRuntimeWorkspaceEntryStoreName)) {
        database.createObjectStore(webRuntimeWorkspaceEntryStoreName, { keyPath: ["workspaceId", "path"] });
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
