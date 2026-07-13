import { FakeIndexedDbFactory } from "../../test/web-runtime-fakes";
import type { WebDirectoryHandle } from "./types";
import {
  createWorkspaceDirectoryHandle,
  createWorkspaceFileHandle,
  createWorkspaceUrl,
  parseWorkspaceUrl
} from "./workspace-handles";
import { createWorkspaceRepository, type WorkspaceRepository } from "./workspace";

async function collectEntryNames(directory: WebDirectoryHandle) {
  const names: string[] = [];
  for await (const [name] of directory.entries!()) names.push(name);

  return names;
}

async function createWorkspace() {
  const repository = createWorkspaceRepository({
    indexedDB: new FakeIndexedDbFactory().indexedDB
  });
  await repository.ensureDefaultWorkspace();

  return repository;
}

describe("IndexedDB-backed workspace handles", () => {
  it("creates, writes, lists, reopens, and removes repository-backed files", async () => {
    const repository = await createWorkspace();
    const root = createWorkspaceDirectoryHandle(repository, "default", "", "Markra");
    const docs = await root.getDirectoryHandle!("docs", { create: true });
    const note = await docs.getFileHandle!("note.md", { create: true });
    const writable = await note.createWritable!();
    await writable.write("# Local");
    await writable.close();

    await expect((await note.getFile()).text()).resolves.toBe("# Local");
    await expect(collectEntryNames(root)).resolves.toEqual(["docs"]);

    const reopenedRoot = createWorkspaceDirectoryHandle(repository, "default", "", "Markra");
    const reopenedDocs = await reopenedRoot.getDirectoryHandle!("docs");
    const reopenedNote = await reopenedDocs.getFileHandle!("note.md");
    await expect((await reopenedNote.getFile()).text()).resolves.toBe("# Local");

    await reopenedDocs.removeEntry!("note.md");
    await expect(reopenedDocs.getFileHandle!("note.md")).rejects.toMatchObject({
      name: "NotFoundError"
    });
  });

  it("does not commit a write until the writable stream closes", async () => {
    const repository = await createWorkspace();
    await repository.writeFile("default", "note.md", new Blob(["saved"]));
    const root = createWorkspaceDirectoryHandle(repository, "default", "", "Markra");
    const file = await root.getFileHandle!("note.md");

    const writable = await file.createWritable!();
    await writable.write("draft");
    await expect((await file.getFile()).text()).resolves.toBe("saved");
    await writable.close();
    await expect((await file.getFile()).text()).resolves.toBe("draft");
  });

  it("propagates storage read failures without truncating an existing file", async () => {
    const storedRepository = await createWorkspace();
    await storedRepository.writeFile("default", "note.md", new Blob(["preserved"]));
    const readFailure = new DOMException("Synthetic transaction failure", "NotFoundError");
    const repository: WorkspaceRepository = {
      ...storedRepository,
      async read() {
        throw readFailure;
      }
    };
    const root = createWorkspaceDirectoryHandle(repository, "default", "", "Markra");

    await expect(root.getFileHandle!("note.md", { create: true })).rejects.toBe(readFailure);
    await expect((await storedRepository.read("default", "note.md")).body?.text()).resolves.toBe(
      "preserved"
    );
  });

  it("validates file handle workspace ids and paths immediately", async () => {
    const repository = await createWorkspace();

    expect(() => createWorkspaceFileHandle(repository, "invalid/id", "note.md")).toThrow(TypeError);
    expect(() => createWorkspaceFileHandle(repository, "default", "../secret.md")).toThrow(TypeError);
  });

  it("moves a handle within its repository-backed workspace", async () => {
    const repository = await createWorkspace();
    const root = createWorkspaceDirectoryHandle(repository, "default", "", "Markra");
    const drafts = await root.getDirectoryHandle!("drafts", { create: true });
    const published = await root.getDirectoryHandle!("published", { create: true });
    const note = await drafts.getFileHandle!("note.md", { create: true });
    const writable = await note.createWritable!();
    await writable.write("ready");
    await writable.close();

    await note.move!(published, "release.md");

    expect(note.name).toBe("release.md");
    await expect(drafts.getFileHandle!("note.md")).rejects.toMatchObject({ name: "NotFoundError" });
    await expect((await note.getFile()).text()).resolves.toBe("ready");
    await expect(collectEntryNames(published)).resolves.toEqual(["release.md"]);
  });

  it("rejects creating children through a removed directory handle", async () => {
    const repository = await createWorkspace();
    const root = createWorkspaceDirectoryHandle(repository, "default", "", "Markra");
    const staleDocs = await root.getDirectoryHandle!("docs", { create: true });
    await root.removeEntry!("docs", { recursive: true });

    await expect(staleDocs.getFileHandle!("orphan.md", { create: true })).rejects.toMatchObject({
      name: "NotFoundError"
    });
    await expect(repository.exportEntries("default")).resolves.toEqual([]);
  });

  it("rejects moving into a removed directory handle", async () => {
    const repository = await createWorkspace();
    const root = createWorkspaceDirectoryHandle(repository, "default", "", "Markra");
    const staleTarget = await root.getDirectoryHandle!("archive", { create: true });
    const note = await root.getFileHandle!("note.md", { create: true });
    const writable = await note.createWritable!();
    await writable.write("preserved");
    await writable.close();
    await root.removeEntry!("archive", { recursive: true });

    await expect(note.move!(staleTarget, "note.md")).rejects.toMatchObject({
      name: "NotFoundError"
    });
    await expect((await note.getFile()).text()).resolves.toBe("preserved");
    await expect(repository.read("default", "archive/note.md")).rejects.toThrow("not found");
  });

  it("uses browser-compatible exceptions for missing, mismatched, and non-empty entries", async () => {
    const repository = await createWorkspace();
    const root = createWorkspaceDirectoryHandle(repository, "default", "", "Markra");
    const docs = await root.getDirectoryHandle!("docs", { create: true });
    await docs.getFileHandle!("note.md", { create: true });

    await expect(root.getFileHandle!("missing.md")).rejects.toMatchObject({ name: "NotFoundError" });
    await expect(root.getFileHandle!("docs")).rejects.toMatchObject({ name: "TypeMismatchError" });
    await expect(root.removeEntry!("docs")).rejects.toMatchObject({ name: "InvalidModificationError" });

    await root.removeEntry!("docs", { recursive: true });
    await expect(root.getDirectoryHandle!("docs")).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("round-trips canonical hierarchical workspace URLs", () => {
    const url = createWorkspaceUrl("default", "notes/你好 world.md");

    expect(createWorkspaceUrl("default", "")).toBe("web-workspace://default");
    expect(parseWorkspaceUrl("web-workspace://default")).toEqual({
      path: "",
      workspaceId: "default"
    });
    expect(url).toBe("web-workspace://default/notes/%E4%BD%A0%E5%A5%BD%20world.md");
    expect(parseWorkspaceUrl(url)).toEqual({
      path: "notes/你好 world.md",
      workspaceId: "default"
    });
  });

  it("resolves relative URLs within the current workspace directory", () => {
    const baseUrl = createWorkspaceUrl("default", "notes/guide.md");

    expect(new URL("image.png", baseUrl).href).toBe("web-workspace://default/notes/image.png");
  });

  it("rejects foreign and malformed workspace URLs", () => {
    expect(parseWorkspaceUrl("https://example.test/note.md")).toBeNull();
    expect(parseWorkspaceUrl("web-workspace://default?view=1/note.md")).toBeNull();
    expect(parseWorkspaceUrl("web-workspace://default/%2E%2E%2Fsecret.md")).toBeNull();
    expect(parseWorkspaceUrl("web-workspace://default/notes%2Fguide.md")).toBeNull();
  });
});
