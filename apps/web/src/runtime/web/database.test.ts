import { FakeIdbTransaction, FakeIndexedDbFactory } from "../../test/web-runtime-fakes";
import {
  openWebRuntimeDatabase,
  requestToPromise,
  transactionToPromise,
  webRuntimeAiChatAttachmentStoreName,
  webRuntimeSettingsStoreName,
  webRuntimeWorkspaceEntryStoreName,
  webRuntimeWorkspaceStoreName
} from "./database";

describe("Web runtime database", () => {
  it("adds workspace stores without losing existing Web runtime stores", async () => {
    const factory = new FakeIndexedDbFactory();
    const database = await openWebRuntimeDatabase({ indexedDB: factory.indexedDB });

    expect(database.objectStoreNames.contains(webRuntimeSettingsStoreName)).toBe(true);
    expect(database.objectStoreNames.contains(webRuntimeAiChatAttachmentStoreName)).toBe(true);
    expect(database.objectStoreNames.contains(webRuntimeWorkspaceStoreName)).toBe(true);
    expect(database.objectStoreNames.contains(webRuntimeWorkspaceEntryStoreName)).toBe(true);
  });

  it("waits for transaction completion and rejects transaction failures", async () => {
    const transaction = new FakeIdbTransaction();
    const completion = transactionToPromise(transaction as unknown as IDBTransaction);
    transaction.fail(new DOMException("quota", "QuotaExceededError"));

    await expect(completion).rejects.toMatchObject({ name: "QuotaExceededError" });
  });

  it("completes successful transactions after queued requests settle", async () => {
    const factory = new FakeIndexedDbFactory();
    const database = await openWebRuntimeDatabase({ indexedDB: factory.indexedDB });
    const transaction = database.transaction(webRuntimeWorkspaceStoreName, "readonly");
    const store = transaction.objectStore(webRuntimeWorkspaceStoreName);
    const events: string[] = [];

    const record = await requestToPromise(store.get("workspace-1"));
    events.push("request");
    await transactionToPromise(transaction);
    events.push("transaction");

    expect(record).toBeUndefined();
    expect(events).toEqual(["request", "transaction"]);
  }, 100);
});
