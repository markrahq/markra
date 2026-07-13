import { FakeIndexedDbFactory } from "../../test/web-runtime-fakes";
import {
  openWebRuntimeDatabase,
  requestToPromise,
  transactionToPromise,
  webRuntimeWorkspaceEntryStoreName,
  webRuntimeWorkspaceStoreName
} from "./database";
import { createWorkspaceRepository, defaultWorkspaceId } from "./workspace";

function upload(path: string, contents: BlobPart, type = "text/plain") {
  const name = path.split("/").at(-1) ?? path;
  const file = new File([contents], name, { type });
  Object.defineProperty(file, "webkitRelativePath", { value: path });

  return file;
}

describe("Browser workspace repository", () => {
  it("creates the default workspace idempotently", async () => {
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const repository = createWorkspaceRepository({ indexedDB });

    await expect(repository.ensureDefaultWorkspace()).resolves.toEqual({
      id: defaultWorkspaceId,
      name: "Workspace"
    });
    await expect(repository.ensureDefaultWorkspace()).resolves.toEqual({
      id: defaultWorkspaceId,
      name: "Workspace"
    });
  });

  it("persists nested text and binary files across repository instances", async () => {
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const first = createWorkspaceRepository({ indexedDB });
    await first.ensureDefaultWorkspace();
    await first.createDirectory("default", "docs");
    await first.writeFile("default", "docs/note.md", new Blob(["# Offline"], { type: "text/markdown" }));
    await first.writeFile(
      "default",
      "docs/image.png",
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })
    );

    const second = createWorkspaceRepository({ indexedDB });
    await expect((await second.read("default", "docs/note.md")).body?.text()).resolves.toBe("# Offline");
    expect(new Uint8Array(await (await second.read("default", "docs/image.png")).body!.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
    await expect(second.list("default", "docs")).resolves.toEqual([
      expect.objectContaining({ kind: "directory", path: "docs" }),
      expect.objectContaining({ kind: "file", mediaType: "image/png", path: "docs/image.png" }),
      expect.objectContaining({ kind: "file", mediaType: "text/markdown", path: "docs/note.md" })
    ]);
  });

  it("moves directory descendants and removes them recursively", async () => {
    const repository = createWorkspaceRepository({ indexedDB: new FakeIndexedDbFactory().indexedDB });
    await repository.ensureDefaultWorkspace();
    await repository.createDirectory("default", "drafts");
    await repository.createDirectory("default", "drafts/assets");
    await repository.writeFile("default", "drafts/note.md", new Blob(["draft"]));
    await repository.writeFile("default", "drafts/assets/chart.bin", new Blob([new Uint8Array([4, 5])]));

    await expect(repository.move("default", "drafts", "published")).resolves.toEqual([
      expect.objectContaining({ path: "published" }),
      expect.objectContaining({ path: "published/assets" }),
      expect.objectContaining({ path: "published/assets/chart.bin" }),
      expect.objectContaining({ path: "published/note.md" })
    ]);
    await expect(repository.read("default", "drafts/note.md")).rejects.toThrow("not found");
    await expect(repository.remove("default", "published")).rejects.toThrow("not empty");

    await repository.remove("default", "published", true);

    await expect(repository.exportEntries("default")).resolves.toEqual([]);
  });

  it.each(["../secret.md", "/absolute.md", "docs/./note.md", "docs//note.md"])(
    "rejects invalid workspace path %s",
    async (path) => {
      const repository = createWorkspaceRepository({ indexedDB: new FakeIndexedDbFactory().indexedDB });
      await repository.ensureDefaultWorkspace();

      await expect(repository.writeFile("default", path, new Blob([]))).rejects.toThrow("Invalid workspace path");
    }
  );

  it("rejects entry conflicts before changing stored entries", async () => {
    const repository = createWorkspaceRepository({ indexedDB: new FakeIndexedDbFactory().indexedDB });
    await repository.ensureDefaultWorkspace();
    await repository.createDirectory("default", "docs");
    await repository.writeFile("default", "note.md", new Blob(["stable"]));

    await expect(repository.writeFile("default", "docs", new Blob(["replacement"]))).rejects.toThrow("docs");
    await expect(repository.move("default", "note.md", "docs")).rejects.toThrow("docs");
    await expect((await repository.read("default", "note.md")).body?.text()).resolves.toBe("stable");
    await expect(repository.read("default", "docs")).resolves.toEqual(expect.objectContaining({ kind: "directory" }));
  });

  it("rejects writing a file above an existing descendant", async () => {
    const repository = createWorkspaceRepository({ indexedDB: new FakeIndexedDbFactory().indexedDB });
    await repository.ensureDefaultWorkspace();
    await repository.writeFile("default", "notes/existing.md", new Blob(["stable"]));

    await expect(repository.writeFile("default", "notes", new Blob(["replacement"]))).rejects.toThrow("notes");
    await expect((await repository.read("default", "notes/existing.md")).body?.text()).resolves.toBe("stable");
    await expect(repository.read("default", "notes")).rejects.toThrow("not found");
  });

  it.each(["file", "directory"] as const)(
    "rejects moving a %s onto an occupied descendant namespace",
    async (kind) => {
      const repository = createWorkspaceRepository({ indexedDB: new FakeIndexedDbFactory().indexedDB });
      await repository.ensureDefaultWorkspace();
      await repository.writeFile("default", "target/existing.md", new Blob(["stable"]));
      if (kind === "file") {
        await repository.writeFile("default", "source", new Blob(["source"]));
      } else {
        await repository.createDirectory("default", "source");
        await repository.writeFile("default", "source/note.md", new Blob(["source"]));
      }

      await expect(repository.move("default", "source", "target")).rejects.toThrow("target");
      await expect((await repository.read("default", "target/existing.md")).body?.text()).resolves.toBe("stable");
      await expect(repository.read("default", "source")).resolves.toEqual(expect.objectContaining({ kind }));
    }
  );

  it("preserves an empty Blob media type", async () => {
    const repository = createWorkspaceRepository({ indexedDB: new FakeIndexedDbFactory().indexedDB });
    await repository.ensureDefaultWorkspace();

    await expect(repository.writeFile("default", "unknown.bin", new Blob(["data"]))).resolves.toEqual(
      expect.objectContaining({ mediaType: "" })
    );
    await expect(repository.read("default", "unknown.bin")).resolves.toEqual(
      expect.objectContaining({ mediaType: "" })
    );
  });

  it("imports a directory and removes its staging workspace", async () => {
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const repository = createWorkspaceRepository({ indexedDB });
    await repository.ensureDefaultWorkspace();

    await expect(repository.importDirectory("default", "archive", [
      upload("archive/readme.md", "hello", "text/markdown"),
      upload("archive/data.bin", new Uint8Array([8, 9]), "application/octet-stream")
    ])).resolves.toBe("archive");
    await expect((await repository.read("default", "archive/readme.md")).body?.text()).resolves.toBe("hello");

    const database = await openWebRuntimeDatabase({ indexedDB });
    const transaction = database.transaction(webRuntimeWorkspaceStoreName, "readonly");
    const workspaces = await requestToPromise<Record<string, unknown>[]>(
      transaction.objectStore(webRuntimeWorkspaceStoreName).getAll()
    );
    await transactionToPromise(transaction);
    expect(workspaces).toEqual([{ id: "default", lifecycle: "active", name: "Workspace" }]);
  });

  it("keeps the active workspace unchanged when a staged import conflicts", async () => {
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const repository = createWorkspaceRepository({ indexedDB });
    await repository.ensureDefaultWorkspace();
    await repository.writeFile("default", "notes/existing.md", new Blob(["existing"]));

    await expect(
      repository.importDirectory("default", "notes", [upload("notes/existing.md", "replacement")])
    ).rejects.toThrow("notes/existing.md");

    await expect((await repository.read("default", "notes/existing.md")).body?.text()).resolves.toBe("existing");
    await expect(repository.exportEntries("default")).resolves.toEqual([
      expect.objectContaining({ path: "notes/existing.md" })
    ]);
  });

  it("rejects a staged file that would become an ancestor of an active descendant", async () => {
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const repository = createWorkspaceRepository({ indexedDB });
    await repository.ensureDefaultWorkspace();
    await repository.writeFile("default", "archive/folder/existing.md", new Blob(["existing"]));

    await expect(
      repository.importDirectory("default", "archive", [upload("archive/folder", "replacement")])
    ).rejects.toThrow("archive/folder");

    await expect((await repository.read("default", "archive/folder/existing.md")).body?.text()).resolves.toBe(
      "existing"
    );
    await expect(repository.read("default", "archive/folder")).rejects.toThrow("not found");
  });

  it("rejects duplicate canonical import paths before publishing", async () => {
    const repository = createWorkspaceRepository({ indexedDB: new FakeIndexedDbFactory().indexedDB });
    await repository.ensureDefaultWorkspace();

    await expect(repository.importDirectory("default", "archive", [
      upload("archive/note.md", "first"),
      upload("archive/note.md", "second")
    ])).rejects.toThrow("archive/note.md");
    await expect(repository.exportEntries("default")).resolves.toEqual([]);
  });

  it("rejects a failed mutation without committing partial records", async () => {
    const factory = new FakeIndexedDbFactory();
    const repository = createWorkspaceRepository({ indexedDB: factory.indexedDB });
    await repository.ensureDefaultWorkspace();
    factory.failNextTransaction(new DOMException("quota", "QuotaExceededError"));

    await expect(repository.writeFile("default", "note.md", new Blob(["not saved"]))).rejects.toMatchObject({
      name: "QuotaExceededError"
    });
    await expect(repository.exportEntries("default")).resolves.toEqual([]);
  });

  it("rolls back every record in a failed directory move", async () => {
    const factory = new FakeIndexedDbFactory();
    const repository = createWorkspaceRepository({ indexedDB: factory.indexedDB });
    await repository.ensureDefaultWorkspace();
    await repository.createDirectory("default", "drafts");
    await repository.writeFile("default", "drafts/one.md", new Blob(["one"]));
    await repository.writeFile("default", "drafts/two.md", new Blob(["two"]));
    factory.failNextTransaction(new DOMException("quota", "QuotaExceededError"));

    await expect(repository.move("default", "drafts", "published")).rejects.toMatchObject({
      name: "QuotaExceededError"
    });
    await expect(repository.exportEntries("default")).resolves.toEqual([
      expect.objectContaining({ path: "drafts" }),
      expect.objectContaining({ path: "drafts/one.md" }),
      expect.objectContaining({ path: "drafts/two.md" })
    ]);
  });

  it("removing a file never removes legacy descendant records", async () => {
    const indexedDB = new FakeIndexedDbFactory().indexedDB;
    const repository = createWorkspaceRepository({ indexedDB });
    await repository.ensureDefaultWorkspace();
    const database = await openWebRuntimeDatabase({ indexedDB });
    const transaction = database.transaction(webRuntimeWorkspaceEntryStoreName, "readwrite");
    const store = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
    const timestamp = Date.now();
    await Promise.all([
      requestToPromise(store.put({
        body: new Blob(["parent"]),
        createdAt: timestamp,
        kind: "file",
        mediaType: "",
        modifiedAt: timestamp,
        path: "legacy",
        workspaceId: "default"
      })),
      requestToPromise(store.put({
        body: new Blob(["child"]),
        createdAt: timestamp,
        kind: "file",
        mediaType: "",
        modifiedAt: timestamp,
        path: "legacy/child.md",
        workspaceId: "default"
      }))
    ]);
    await transactionToPromise(transaction);

    await repository.remove("default", "legacy", true);

    await expect(repository.read("default", "legacy")).rejects.toThrow("not found");
    await expect((await repository.read("default", "legacy/child.md")).body?.text()).resolves.toBe("child");
  });
});
