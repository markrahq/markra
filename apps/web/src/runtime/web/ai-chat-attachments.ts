import type {
  AppAiChatAttachmentRuntime,
  ReadAiChatAttachmentInput,
  SaveAiChatAttachmentInput
} from "@markra/app/runtime";
import {
  openWebRuntimeDatabase,
  requestToPromise,
  webRuntimeAiChatAttachmentStoreName
} from "./database";
import type { IndexedDbSettingsRuntimeOptions } from "./types";

type StoredAiChatAttachment = {
  bytes: number[];
  key: string;
  sessionId: string;
};

type StoredAiChatAttachmentManifest = {
  attachmentKeys: string[];
  key: string;
  sessionId: string;
};

function attachmentKey(input: ReadAiChatAttachmentInput) {
  return `${input.sessionId}/${input.attachmentId}/${input.mimeType}`;
}

function manifestKey(sessionId: string) {
  return `session:${sessionId}`;
}

export function createIndexedDbAiChatAttachmentRuntime(
  options: IndexedDbSettingsRuntimeOptions = {}
): AppAiChatAttachmentRuntime {
  let databasePromise: Promise<IDBDatabase> | null = null;
  const getDatabase = () => {
    databasePromise ??= openWebRuntimeDatabase(options);

    return databasePromise;
  };
  const getStore = async (mode: IDBTransactionMode) => {
    const database = await getDatabase();

    return database
      .transaction(webRuntimeAiChatAttachmentStoreName, mode)
      .objectStore(webRuntimeAiChatAttachmentStoreName);
  };

  return {
    async deleteSession(sessionId) {
      const store = await getStore("readwrite");
      const key = manifestKey(sessionId);
      const manifest = await requestToPromise<StoredAiChatAttachmentManifest | undefined>(store.get(key));

      for (const attachment of manifest?.attachmentKeys ?? []) {
        await requestToPromise(store.delete(attachment));
      }
      await requestToPromise(store.delete(key));
    },
    async read(input) {
      const store = await getStore("readonly");
      const attachment = await requestToPromise<StoredAiChatAttachment | undefined>(store.get(attachmentKey(input)));
      if (!attachment) throw new Error("AI chat attachment was not found.");

      return attachment.bytes;
    },
    async save(input: SaveAiChatAttachmentInput) {
      const store = await getStore("readwrite");
      const key = attachmentKey(input);
      const sessionManifestKey = manifestKey(input.sessionId);
      const manifest = await requestToPromise<StoredAiChatAttachmentManifest | undefined>(store.get(sessionManifestKey));

      await requestToPromise(store.put({
        bytes: input.bytes,
        key,
        sessionId: input.sessionId
      } satisfies StoredAiChatAttachment));
      await requestToPromise(store.put({
        attachmentKeys: Array.from(new Set([...(manifest?.attachmentKeys ?? []), key])),
        key: sessionManifestKey,
        sessionId: input.sessionId
      } satisfies StoredAiChatAttachmentManifest));
    }
  };
}
