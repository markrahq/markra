import { FakeIndexedDbFactory } from "../../test/web-runtime-fakes";
import {
  openWebRuntimeDatabase,
  requestToPromise,
  transactionToPromise,
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
});
