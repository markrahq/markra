import type {
  AppFileRuntime,
  AppSettingsRuntime,
  NativeMarkdownDroppedTarget,
  NativeMarkdownFile,
  NativeMarkdownFolder,
  NativeMarkdownFolderFile,
  NativeMarkdownImageFile,
  NativeMarkdownOpenTarget,
  SavedNativeClipboardImage,
  SavedNativeHtmlFile,
  SavedNativeMarkdownFile,
  SavedNativePdfFile,
  SaveNativeClipboardImageInput,
  SaveNativeHtmlFileInput,
  SaveNativeMarkdownFileInput,
  SaveNativePdfFileInput
} from "@markra/app/runtime";
import {
  confirmWithBrowser,
  createBrowserDownload,
  createBrowserPrint,
  pickBrowserDirectoryFiles,
  resolveBrowserPicker
} from "./browser";
import type {
  WebDirectoryHandle,
  WebFileHandle,
  WebRuntimeOptions
} from "./types";

type WebHandlePath =
  | {
      id: string;
      kind: "file";
      relativePath: string;
    }
  | {
      id: string;
      kind: "folder";
      relativePath: string;
    };

type DirectoryUploadFile = File & {
  webkitRelativePath?: string;
};

type UploadedDirectoryNode = {
  children: Map<string, UploadedDirectoryNode | WebFileHandle>;
  name: string;
};

type WebFileSystemDropItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<WebDirectoryHandle | WebFileHandle | null>;
};

const markdownTemplateStorePath = "markdown-templates.json";
const markdownFileType = "text/markdown;charset=utf-8";
const htmlFileType = "text/html;charset=utf-8";
const markdownExtensions = new Set(["md", "markdown"]);
const markdownOpenExtensions = new Set(["md", "markdown", "txt"]);
const assetExtensions = new Set(["avif", "bmp", "gif", "jpg", "jpeg", "png", "svg", "webp"]);
const skippedDirectoryNames = new Set([".git", "node_modules", "target", "dist", "build"]);
const fileHandleStorePath = "web-file-handles.json";
const directoryHandleStorePath = "web-directory-handles.json";

function extensionFromName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();

  return extension && extension !== name.toLowerCase() ? extension : "";
}

function isMarkdownFileName(name: string) {
  return markdownExtensions.has(extensionFromName(name));
}

function isMarkdownOpenFileName(name: string) {
  return markdownOpenExtensions.has(extensionFromName(name));
}

function isAssetFileName(name: string) {
  return assetExtensions.has(extensionFromName(name));
}

function folderFileKindFromName(name: string) {
  return isAssetFileName(name) ? { kind: "asset" as const } : {};
}

function encodePathSegments(path: string) {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function decodePathSegments(path: string) {
  return path.split("/").filter(Boolean).map(decodeURIComponent).join("/");
}

function joinRelativePath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

function normalizeWebRelativePath(path: string) {
  return path.replace(/\/+/gu, "/").replace(/^\/|\/$/gu, "");
}

function baseNameFromPath(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function imageAltFromFileName(fileName: string) {
  const trimmedName = fileName.trim();
  if (!trimmedName) return "image";

  const withoutExtension = trimmedName.replace(/\.[^.]*$/u, "").trim();
  return withoutExtension || "image";
}

function encodeMarkdownUrlSegment(segment: string) {
  return encodeURIComponent(segment).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeMarkdownRelativePath(path: string) {
  return path.split("/").map(encodeMarkdownUrlSegment).join("/");
}

function normalizeClipboardImageFolder(folder: string) {
  const segments = folder.split(/[\\/]+/u).map((segment) => segment.trim()).filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Clipboard image folder is invalid.");
  }

  return segments.join("/");
}

function uniqueFileNameCandidate(fileName: string, attempt: number) {
  if (attempt === 0) return fileName;

  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex <= 0) return `${fileName}-${attempt + 1}`;

  return `${fileName.slice(0, extensionIndex)}-${attempt + 1}${fileName.slice(extensionIndex)}`;
}

function createHandleId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();

  return `handle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createFilePath(id: string, name: string) {
  return `web-file://${id}/${encodeURIComponent(name)}`;
}

function createFolderPath(id: string, relativePath = "") {
  const encodedPath = encodePathSegments(relativePath);

  return encodedPath ? `web-folder://${id}/${encodedPath}` : `web-folder://${id}`;
}

function parseWebHandlePath(path: string): WebHandlePath | null {
  try {
    const url = new URL(path);
    if (url.protocol === "web-file:") {
      return {
        id: url.hostname,
        kind: "file",
        relativePath: decodePathSegments(url.pathname)
      };
    }
    if (url.protocol === "web-folder:") {
      return {
        id: url.hostname,
        kind: "folder",
        relativePath: decodePathSegments(url.pathname)
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function fileToDataUrl(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

function isDirectoryHandle(handle: WebFileHandle | WebDirectoryHandle): handle is WebDirectoryHandle {
  return handle.kind === "directory" || "entries" in handle;
}

function isUsableDirectoryHandle(handle: unknown): handle is WebDirectoryHandle {
  if (!handle || typeof handle !== "object") return false;

  const candidate = handle as WebDirectoryHandle;
  return (
    typeof candidate.entries === "function" ||
    typeof candidate.values === "function" ||
    typeof candidate.getDirectoryHandle === "function"
  );
}

function isUsableFileHandle(handle: unknown): handle is WebFileHandle {
  if (!handle || typeof handle !== "object") return false;

  const candidate = handle as WebFileHandle;
  return typeof candidate.name === "string" && typeof candidate.getFile === "function";
}

function createUploadedFileHandle(file: File): WebFileHandle {
  return {
    getFile: async () => file,
    kind: "file",
    name: file.name
  };
}

function isUploadedDirectoryNode(value: UploadedDirectoryNode | WebFileHandle): value is UploadedDirectoryNode {
  return "children" in value;
}

function uploadedDirectoryNodeAsHandle(node: UploadedDirectoryNode): WebDirectoryHandle {
  return {
    async *entries() {
      for (const [name, child] of node.children.entries()) {
        yield [
          name,
          isUploadedDirectoryNode(child) ? uploadedDirectoryNodeAsHandle(child) : child
        ] satisfies [string, WebDirectoryHandle | WebFileHandle];
      }
    },
    async getDirectoryHandle(name) {
      const child = node.children.get(name);
      if (child && isUploadedDirectoryNode(child)) return uploadedDirectoryNodeAsHandle(child);

      throw new DOMException("Directory not found", "NotFoundError");
    },
    async getFileHandle(name) {
      const child = node.children.get(name);
      if (child && !isUploadedDirectoryNode(child)) return child;
      if (child && isUploadedDirectoryNode(child)) {
        throw new DOMException("Entry is not a file", "TypeMismatchError");
      }

      throw new DOMException("File not found", "NotFoundError");
    },
    kind: "directory",
    name: node.name
  };
}

function ensureUploadedDirectoryChild(parent: UploadedDirectoryNode, name: string) {
  const existing = parent.children.get(name);
  if (existing && isUploadedDirectoryNode(existing)) return existing;

  const child = {
    children: new Map<string, UploadedDirectoryNode | WebFileHandle>(),
    name
  };
  parent.children.set(name, child);

  return child;
}

function uploadedFileRelativePath(file: File) {
  return (file as DirectoryUploadFile).webkitRelativePath?.trim() || file.name;
}

function isDirectoryUploadFile(file: File) {
  return Boolean((file as DirectoryUploadFile).webkitRelativePath?.split("/").filter(Boolean).length > 1);
}

function uploadedDirectoryRootName(files: File[]) {
  const firstPath = uploadedFileRelativePath(files[0]);
  const [rootName] = firstPath.split("/").filter(Boolean);

  return rootName || "Selected files";
}

function createUploadedDirectoryHandle(files: File[]) {
  if (files.length === 0) return null;

  const rootName = uploadedDirectoryRootName(files);
  const root: UploadedDirectoryNode = {
    children: new Map(),
    name: rootName
  };

  for (const file of files) {
    const segments = uploadedFileRelativePath(file).split("/").filter(Boolean);
    if (segments[0] === rootName && segments.length > 1) {
      segments.shift();
    }
    const fileName = segments.pop() ?? file.name;
    let directory = root;

    for (const segment of segments) {
      directory = ensureUploadedDirectoryChild(directory, segment);
    }
    directory.children.set(fileName, createUploadedFileHandle(file));
  }

  return uploadedDirectoryNodeAsHandle(root);
}

export function createWebFileRuntime(
  settings: AppSettingsRuntime,
  options: WebRuntimeOptions
): AppFileRuntime {
  const fileHandles = new Map<string, WebFileHandle>();
  const directoryHandles = new Map<string, WebDirectoryHandle>();
  const downloadFile = options.downloadFile ?? createBrowserDownload(options.document);
  const printFile = options.printFile ?? createBrowserPrint(options.document);
  const confirm = options.confirm ?? confirmWithBrowser;
  const showOpenFilePicker = options.showOpenFilePicker ?? resolveBrowserPicker("showOpenFilePicker");
  const showSaveFilePicker = options.showSaveFilePicker ?? resolveBrowserPicker("showSaveFilePicker");
  const showDirectoryPicker = options.showDirectoryPicker ?? resolveBrowserPicker("showDirectoryPicker");
  const pickDirectoryFiles = options.pickDirectoryFiles ?? (() => pickBrowserDirectoryFiles(options.document));
  const dropTarget = options.document ?? globalThis.document ?? null;
  const openExternalUrl = options.openExternalUrl ?? ((url: string) => {
    globalThis.open?.(url, "_blank", "noopener,noreferrer");
  });

  function cacheFileHandle(handle: WebFileHandle) {
    const id = createHandleId();
    fileHandles.set(id, handle);

    return {
      id,
      path: createFilePath(id, handle.name)
    };
  }

  async function registerFileHandle(handle: WebFileHandle) {
    const registered = cacheFileHandle(handle);
    await persistFileHandle(registered.id, handle);

    return registered.path;
  }

  function registerDirectoryHandle(handle: WebDirectoryHandle) {
    const id = createHandleId();
    directoryHandles.set(id, handle);

    return {
      id,
      path: createFolderPath(id)
    };
  }

  async function directoryHandleStore() {
    return settings.loadStore(directoryHandleStorePath, { autoSave: false, defaults: {} });
  }

  async function fileHandleStore() {
    return settings.loadStore(fileHandleStorePath, { autoSave: false, defaults: {} });
  }

  async function persistFileHandle(id: string, handle: WebFileHandle) {
    try {
      const store = await fileHandleStore();
      await store.set(id, handle);
      await store.save();
    } catch {
      // Browser file handles are best-effort persistent permissions.
    }
  }

  async function persistDirectoryHandle(id: string, handle: WebDirectoryHandle) {
    try {
      const store = await directoryHandleStore();
      await store.set(id, handle);
      await store.save();
    } catch {
      // Browser directory handles are best-effort persistent permissions.
    }
  }

  async function directoryHandleForId(id: string) {
    const cached = directoryHandles.get(id);
    if (cached) return cached;

    try {
      const store = await directoryHandleStore();
      const stored = await store.get<WebDirectoryHandle>(id);
      if (isUsableDirectoryHandle(stored)) {
        directoryHandles.set(id, stored);
        return stored;
      }
    } catch {
      // Missing permissions or uncloneable test handles fall back to unavailable.
    }

    return null;
  }

  async function fileHandleForId(id: string) {
    const cached = fileHandles.get(id);
    if (cached) return cached;

    try {
      const store = await fileHandleStore();
      const stored = await store.get<WebFileHandle>(id);
      if (isUsableFileHandle(stored)) {
        fileHandles.set(id, stored);
        return stored;
      }
    } catch {
      // Missing permissions or unavailable handles fall back to unavailable.
    }

    return null;
  }

  async function markdownFileFromHandle(handle: WebFileHandle): Promise<NativeMarkdownFile> {
    const file = await handle.getFile();

    return {
      content: await file.text(),
      name: file.name || handle.name,
      path: await registerFileHandle(handle)
    };
  }

  function browserWindowTarget() {
    return options.document?.defaultView ?? (typeof window === "undefined" ? null : window);
  }

  function createMarkdownRouteUrl(searchKey: "folder" | "path", path: string) {
    const windowTarget = browserWindowTarget();
    if (!windowTarget) return null;

    const url = new URL(windowTarget.location.href);
    url.searchParams.delete(searchKey === "path" ? "folder" : "path");
    url.searchParams.delete("blank");
    url.searchParams.delete("settings");
    url.searchParams.delete("settingsTarget");
    url.searchParams.set(searchKey, path);

    return url.href;
  }

  async function openMarkdownRouteInNewWindow(searchKey: "folder" | "path", path: string) {
    const routeUrl = createMarkdownRouteUrl(searchKey, path);
    if (!routeUrl) return;

    await openExternalUrl(routeUrl);
  }

  async function resolveDirectory(root: WebDirectoryHandle, relativePath: string) {
    let directory = root;
    for (const segment of relativePath.split("/").filter(Boolean)) {
      if (!directory.getDirectoryHandle) {
        throw new Error("Browser directory handle cannot resolve child folders.");
      }
      directory = await directory.getDirectoryHandle(segment);
    }

    return directory;
  }

  async function directoryForPath(path: string) {
    const parsedPath = parseWebHandlePath(path);
    if (parsedPath?.kind !== "folder") {
      throw new Error("Path is not a web folder handle.");
    }
    const root = await directoryHandleForId(parsedPath.id);
    if (!root) {
      throw new Error("Web folder handle is no longer available.");
    }

    return {
      directory: await resolveDirectory(root, parsedPath.relativePath),
      id: parsedPath.id,
      relativePath: parsedPath.relativePath,
      root
    };
  }

  async function treeEntryForPath(rootPath: string, path: string) {
    const parsedPath = parseWebHandlePath(path);
    if (parsedPath?.kind !== "folder" || !parsedPath.relativePath) {
      throw new Error("Path is not a web folder entry.");
    }

    const { id, root } = await directoryForPath(rootPath);
    if (parsedPath.id !== id) throw new Error("Path belongs to a different web folder.");

    const segments = parsedPath.relativePath.split("/").filter(Boolean);
    const name = segments.pop();
    if (!name) throw new Error("Path is not a movable web folder entry.");

    const parentRelativePath = segments.join("/");
    const parent = await resolveDirectory(root, parentRelativePath);

    try {
      const directory = await parent.getDirectoryHandle?.(name);
      if (directory) {
        return {
          handle: directory,
          id,
          kind: "folder" as const,
          name,
          parent,
          parentRelativePath,
          relativePath: parsedPath.relativePath,
          root
        };
      }
    } catch {
      // Fall through and try resolving the entry as a file.
    }

    const file = await parent.getFileHandle?.(name);
    if (!file) throw new Error("Browser directory handle cannot resolve child files.");

    return {
      handle: file,
      id,
      kind: "file" as const,
      name,
      parent,
      parentRelativePath,
      relativePath: parsedPath.relativePath,
      root
    };
  }

  async function targetDirectoryForPath(rootPath: string, targetParentPath: string | null | undefined) {
    const { id, root } = await directoryForPath(rootPath);
    if (!targetParentPath) {
      return {
        directory: root,
        id,
        relativePath: ""
      };
    }

    const parsedTargetPath = parseWebHandlePath(targetParentPath);
    if (parsedTargetPath?.kind !== "folder") throw new Error("Target path is not a web folder handle.");
    if (parsedTargetPath.id !== id) throw new Error("Target path belongs to a different web folder.");

    return {
      directory: await resolveDirectory(root, parsedTargetPath.relativePath),
      id,
      relativePath: parsedTargetPath.relativePath
    };
  }

  async function entryExists(directory: WebDirectoryHandle, name: string) {
    try {
      if (await directory.getFileHandle?.(name)) return true;
    } catch {
      // Missing file entries are checked as folders below.
    }

    try {
      if (await directory.getDirectoryHandle?.(name)) return true;
    } catch {
      return false;
    }

    return false;
  }

  async function assertTargetEntryAvailable(directory: WebDirectoryHandle, name: string) {
    if (await entryExists(directory, name)) {
      throw new Error("Target file already exists.");
    }
  }

  async function ensureDirectory(directory: WebDirectoryHandle, relativePath: string) {
    let current = directory;
    for (const segment of relativePath.split("/").filter(Boolean)) {
      if (!current.getDirectoryHandle) throw new Error("Browser directory handle cannot create folders.");
      current = await current.getDirectoryHandle(segment, { create: true });
    }

    return current;
  }

  async function uniqueFileName(directory: WebDirectoryHandle, fileName: string) {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const candidate = uniqueFileNameCandidate(fileName, attempt);
      if (!await entryExists(directory, candidate)) return candidate;
    }

    throw new Error("Could not create a unique clipboard image file.");
  }

  async function copyFileHandle(source: WebFileHandle, targetDirectory: WebDirectoryHandle, targetName: string) {
    if (!targetDirectory.getFileHandle) throw new Error("Browser directory handle cannot create files.");

    const target = await targetDirectory.getFileHandle(targetName, { create: true });
    const sourceFile = await source.getFile();
    if (!await writeFileHandle(target, sourceFile)) {
      throw new Error("Browser file handle cannot be written.");
    }
  }

  async function copyDirectoryHandle(source: WebDirectoryHandle, targetDirectory: WebDirectoryHandle, targetName: string) {
    if (!targetDirectory.getDirectoryHandle) throw new Error("Browser directory handle cannot create folders.");

    const target = await targetDirectory.getDirectoryHandle(targetName, { create: true });
    const iterator = source.entries?.() ?? fallbackDirectoryEntries(source);
    if (!iterator) throw new Error("Browser directory handle cannot list files.");

    for await (const [name, handle] of iterator) {
      if (isDirectoryHandle(handle)) {
        await copyDirectoryHandle(handle, target, name);
      } else {
        await copyFileHandle(handle, target, name);
      }
    }
  }

  async function removeTreeEntry(parent: WebDirectoryHandle, name: string) {
    if (!parent.removeEntry) throw new Error("Browser directory handle cannot delete entries.");

    await parent.removeEntry(name, { recursive: true });
  }

  function movedTreeFile(id: string, relativePath: string, name: string, kind: "file" | "folder") {
    return {
      ...(kind === "folder" ? { kind: "folder" as const } : folderFileKindFromName(name)),
      name,
      path: createFolderPath(id, relativePath),
      relativePath
    };
  }

  async function resolveFileFromFolderPath(id: string, relativePath: string) {
    const root = await directoryHandleForId(id);
    if (!root) throw new Error("Web folder handle is no longer available.");
    const segments = relativePath.split("/").filter(Boolean);
    const fileName = segments.pop();
    if (!fileName) throw new Error("Path is not a file.");

    const directory = await resolveDirectory(root, segments.join("/"));
    if (!directory.getFileHandle) {
      throw new Error("Browser directory handle cannot resolve child files.");
    }

    return directory.getFileHandle(fileName);
  }

  async function readFileFromPath(path: string): Promise<{ file: File; handle: WebFileHandle; path: string }> {
    const parsedPath = parseWebHandlePath(path);
    if (parsedPath?.kind === "file") {
      const handle = await fileHandleForId(parsedPath.id);
      if (!handle) throw new Error("Web file handle is no longer available.");

      return {
        file: await handle.getFile(),
        handle,
        path
      };
    }
    if (parsedPath?.kind === "folder") {
      const handle = await resolveFileFromFolderPath(parsedPath.id, parsedPath.relativePath);

      return {
        file: await handle.getFile(),
        handle,
        path
      };
    }

    throw new Error("Path is not a web file handle.");
  }

  async function writeFileHandle(handle: WebFileHandle, contents: BlobPart) {
    if (!handle.createWritable) return false;

    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();

    return true;
  }

  async function saveDownload(
    input: SaveNativeMarkdownFileInput | SaveNativeHtmlFileInput | SaveNativePdfFileInput,
    type: string
  ) {
    await downloadFile({
      contents: input.contents,
      name: input.suggestedName,
      type
    });

    return {
      name: input.suggestedName,
      path: `web-download://${encodeURIComponent(input.suggestedName)}`
    };
  }

  async function collectMarkdownEntries(
    id: string,
    directory: WebDirectoryHandle,
    parentRelativePath: string,
    entries: NativeMarkdownFolderFile[]
  ) {
    const iterator = directory.entries?.() ?? fallbackDirectoryEntries(directory);
    if (!iterator) throw new Error("Browser directory handle cannot list files.");

    for await (const [name, handle] of iterator) {
      const relativePath = joinRelativePath(parentRelativePath, name);
      if (isDirectoryHandle(handle)) {
        if (!skippedDirectoryNames.has(name)) {
          entries.push({
            kind: "folder",
            name,
            path: createFolderPath(id, relativePath),
            relativePath
          });
          await collectMarkdownEntries(id, handle, relativePath, entries);
        }
        continue;
      }

      if (isMarkdownFileName(name) || isAssetFileName(name)) {
        entries.push({
          ...(isAssetFileName(name) ? { kind: "asset" as const } : {}),
          name,
          path: createFolderPath(id, relativePath),
          relativePath
        });
      }
    }
  }

  async function templateStore() {
    return settings.loadStore(markdownTemplateStorePath, { autoSave: false, defaults: {} });
  }

  async function* fallbackDirectoryEntries(directory: WebDirectoryHandle) {
    const values = directory.values?.();
    if (!values) return;

    for await (const handle of values) {
      yield [handle.name, handle] satisfies [string, WebDirectoryHandle | WebFileHandle];
    }
  }

  function dropEventDataTransfer(event: Event) {
    return (event as DragEvent).dataTransfer ?? null;
  }

  function dropFiles(dataTransfer: DataTransfer | null) {
    return Array.from(dataTransfer?.files ?? []);
  }

  function dropItems(dataTransfer: DataTransfer | null) {
    return Array.from(dataTransfer?.items ?? []);
  }

  function hasPotentialMarkdownDrop(dataTransfer: DataTransfer | null) {
    return dropFiles(dataTransfer).length > 0 ||
      dropItems(dataTransfer).some((item) => {
        const dropItem = item as WebFileSystemDropItem;

        return item.kind === "file" || typeof dropItem.getAsFileSystemHandle === "function";
      });
  }

  async function droppedTargetFromFile(file: File): Promise<NativeMarkdownDroppedTarget | null> {
    if (!isMarkdownOpenFileName(file.name)) return null;

    const handle = createUploadedFileHandle(file);

    return {
      kind: "file",
      name: file.name,
      path: await registerFileHandle(handle)
    };
  }

  async function droppedTargetFromDirectory(handle: WebDirectoryHandle): Promise<NativeMarkdownDroppedTarget> {
    const registered = registerDirectoryHandle(handle);
    await persistDirectoryHandle(registered.id, handle);

    return {
      kind: "folder",
      name: handle.name,
      path: registered.path
    };
  }

  async function droppedTargetFromHandle(
    handle: WebFileHandle | WebDirectoryHandle
  ): Promise<NativeMarkdownDroppedTarget | null> {
    if (isDirectoryHandle(handle)) return droppedTargetFromDirectory(handle);

    const file = await handle.getFile();
    if (!isMarkdownOpenFileName(file.name || handle.name)) return null;

    return {
      kind: "file",
      name: file.name || handle.name,
      path: await registerFileHandle(handle)
    };
  }

  async function droppedTargetFromUploadFiles(files: File[]) {
    const directoryFiles = files.filter(isDirectoryUploadFile);
    if (directoryFiles.length > 0) {
      const handle = createUploadedDirectoryHandle(directoryFiles);
      if (handle) return droppedTargetFromDirectory(handle);
    }

    const file = files.find((candidate) => isMarkdownOpenFileName(candidate.name));

    return file ? droppedTargetFromFile(file) : null;
  }

  async function droppedTargetFromDataTransfer(dataTransfer: DataTransfer | null) {
    for (const item of dropItems(dataTransfer)) {
      const dropItem = item as WebFileSystemDropItem;
      const handle = await dropItem.getAsFileSystemHandle?.();
      if (handle) {
        const target = await droppedTargetFromHandle(handle);
        if (target) return target;
      }
    }

    return droppedTargetFromUploadFiles(dropFiles(dataTransfer));
  }

  return {
    confirmMarkdownFileDelete: async (_fileName, labels) => confirm(labels.message),
    confirmUnsavedMarkdownDocumentDiscard: async (_fileName, labels) => confirm(labels.message),
    async createMarkdownTreeFile(rootPath, fileName, optionsOrParentPath = null) {
      const options = typeof optionsOrParentPath === "object" && optionsOrParentPath !== null
        ? optionsOrParentPath
        : { parentPath: optionsOrParentPath };
      const { directory, id } = await directoryForPath(rootPath);
      const parent = options.parentPath ? (await directoryForPath(options.parentPath)).directory : directory;
      if (!parent.getFileHandle) throw new Error("Browser directory handle cannot create files.");
      const handle = await parent.getFileHandle(fileName, { create: true });
      await writeFileHandle(handle, options.contents ?? "");
      const relativePath = options.parentPath
        ? joinRelativePath(parseWebHandlePath(options.parentPath)?.relativePath ?? "", fileName)
        : fileName;

      return {
        name: fileName,
        path: createFolderPath(id, relativePath),
        relativePath
      };
    },
    async createMarkdownTreeFolder(rootPath, folderName, parentPath = null) {
      const { directory, id } = await directoryForPath(rootPath);
      const parent = parentPath ? (await directoryForPath(parentPath)).directory : directory;
      if (!parent.getDirectoryHandle) throw new Error("Browser directory handle cannot create folders.");
      await parent.getDirectoryHandle(folderName, { create: true });
      const relativePath = parentPath
        ? joinRelativePath(parseWebHandlePath(parentPath)?.relativePath ?? "", folderName)
        : folderName;

      return {
        kind: "folder",
        name: folderName,
        path: createFolderPath(id, relativePath),
        relativePath
      };
    },
    async deleteMarkdownTemplateFile(fileName) {
      const store = await templateStore();
      await store.delete(fileName);
      await store.save();
    },
    async deleteMarkdownTreeFile(rootPath, path) {
      const parsedPath = parseWebHandlePath(path);
      if (parsedPath?.kind !== "folder") throw new Error("Path is not a web folder entry.");
      const segments = parsedPath.relativePath.split("/").filter(Boolean);
      const name = segments.pop();
      if (!name) return;
      const { root } = await directoryForPath(rootPath);
      const parent = await resolveDirectory(root, segments.join("/"));
      if (!parent.removeEntry) throw new Error("Browser directory handle cannot delete entries.");
      await parent.removeEntry(name, { recursive: true });
    },
    detectPandocPath: async () => null,
    async downloadWebImage(input) {
      const response = await (options.fetch ?? globalThis.fetch)(input.src);
      const blob = await response.blob();

      return new File([blob], baseNameFromPath(new URL(input.src, "https://example.test").pathname), {
        type: blob.type || "application/octet-stream"
      });
    },
    installMarkdownFileDrop: async (onDrop) => {
      if (!dropTarget) return () => undefined;

      const handleDragOver = (event: Event) => {
        if (hasPotentialMarkdownDrop(dropEventDataTransfer(event))) {
          event.preventDefault();
        }
      };
      const handleDrop = (event: Event) => {
        const dataTransfer = dropEventDataTransfer(event);
        if (!hasPotentialMarkdownDrop(dataTransfer)) return;

        event.preventDefault();
        droppedTargetFromDataTransfer(dataTransfer)
          .then(async (target) => {
            if (!target) return;

            await onDrop(target);
          })
          .catch((error: unknown) => {
            console.error("Failed to open dropped Markdown target.", error);
          });
      };

      dropTarget.addEventListener("dragover", handleDragOver);
      dropTarget.addEventListener("drop", handleDrop);

      return () => {
        dropTarget.removeEventListener("dragover", handleDragOver);
        dropTarget.removeEventListener("drop", handleDrop);
      };
    },
    listenOpenedMarkdownPaths: async () => () => undefined,
    async listMarkdownFilesForPath(path) {
      const parsedPath = parseWebHandlePath(path);
      if (parsedPath?.kind !== "folder") return [];
      const root = await directoryHandleForId(parsedPath.id);
      if (!root) throw new Error("Web folder handle is no longer available.");
      const entries: NativeMarkdownFolderFile[] = [];

      await collectMarkdownEntries(parsedPath.id, root, "", entries);

      return entries.sort((left, right) => left.relativePath.toLowerCase().localeCompare(right.relativePath.toLowerCase()));
    },
    async moveMarkdownTreeFile(rootPath, path, targetParentPath = null) {
      const source = await treeEntryForPath(rootPath, path);
      const target = await targetDirectoryForPath(rootPath, targetParentPath);
      if (source.kind === "folder") {
        const normalizedSource = normalizeWebRelativePath(source.relativePath);
        const normalizedTarget = normalizeWebRelativePath(target.relativePath);
        if (normalizedTarget === normalizedSource || normalizedTarget.startsWith(`${normalizedSource}/`)) {
          throw new Error("Cannot move a folder inside itself.");
        }
      }

      await assertTargetEntryAvailable(target.directory, source.name);
      if (source.kind === "folder") {
        await copyDirectoryHandle(source.handle, target.directory, source.name);
      } else {
        await copyFileHandle(source.handle, target.directory, source.name);
      }
      await removeTreeEntry(source.parent, source.name);

      const relativePath = joinRelativePath(target.relativePath, source.name);

      return movedTreeFile(source.id, relativePath, source.name, source.kind);
    },
    async openMarkdownFile() {
      if (!showOpenFilePicker) return null;
      const [handle] = await showOpenFilePicker({
        multiple: false,
        types: [{
          accept: {
            "text/markdown": [".md", ".markdown"],
            "text/plain": [".txt"]
          },
          description: "Markdown"
        }]
      });
      if (!handle) return null;

      return markdownFileFromHandle(handle);
    },
    openMarkdownFileInNewWindow: async (path) => openMarkdownRouteInNewWindow("path", path),
    async openMarkdownFolder() {
      if (showDirectoryPicker) {
        const handle = await showDirectoryPicker();
        const registered = registerDirectoryHandle(handle);
        await persistDirectoryHandle(registered.id, handle);

        return {
          name: handle.name,
          path: registered.path
        } satisfies NativeMarkdownFolder;
      }

      const handle = createUploadedDirectoryHandle(await pickDirectoryFiles());
      if (!handle) return null;
      const registered = registerDirectoryHandle(handle);
      await persistDirectoryHandle(registered.id, handle);

      return {
        name: handle.name,
        path: registered.path
      } satisfies NativeMarkdownFolder;
    },
    openMarkdownFolderInNewWindow: async (path) => openMarkdownRouteInNewWindow("folder", path),
    async openMarkdownPath(labels) {
      const file = await this.openMarkdownFile(labels);
      if (!file) return null;

      return {
        file,
        kind: "file"
      } satisfies NativeMarkdownOpenTarget;
    },
    async readMarkdownFile(path) {
      const { file } = await readFileFromPath(path);
      if (!isMarkdownOpenFileName(file.name)) throw new Error("Selected file is not a supported Markdown file.");

      return {
        content: await file.text(),
        name: file.name,
        path
      };
    },
    async readMarkdownImageFile(input) {
      const documentPath = parseWebHandlePath(input.documentPath);
      if (documentPath?.kind !== "folder") throw new Error("Current document is not a web folder file.");
      const documentSegments = documentPath.relativePath.split("/").filter(Boolean);
      documentSegments.pop();
      const imagePath = joinRelativePath(documentSegments.join("/"), input.src);
      const handle = await resolveFileFromFolderPath(documentPath.id, imagePath);
      const file = await handle.getFile();

      return {
        dataUrl: await fileToDataUrl(file),
        mimeType: file.type || "application/octet-stream",
        path: createFolderPath(documentPath.id, imagePath),
        src: input.src
      } satisfies NativeMarkdownImageFile;
    },
    async readMarkdownTemplateFile(fileName) {
      const store = await templateStore();

      return (await store.get<string>(fileName)) ?? "";
    },
    async renameMarkdownTreeFile(rootPath, path, fileName) {
      const source = await treeEntryForPath(rootPath, path);
      const normalizedFileName = fileName.trim();
      if (!normalizedFileName) throw new Error("File name is required.");
      if (normalizedFileName === source.name) {
        return movedTreeFile(source.id, source.relativePath, source.name, source.kind);
      }

      await assertTargetEntryAvailable(source.parent, normalizedFileName);
      if (source.kind === "folder") {
        await copyDirectoryHandle(source.handle, source.parent, normalizedFileName);
      } else {
        await copyFileHandle(source.handle, source.parent, normalizedFileName);
      }
      await removeTreeEntry(source.parent, source.name);

      const relativePath = joinRelativePath(source.parentRelativePath, normalizedFileName);

      return movedTreeFile(source.id, relativePath, normalizedFileName, source.kind);
    },
    async resolveMarkdownPath(path) {
      const parsedPath = parseWebHandlePath(path);
      if (parsedPath?.kind === "folder" && parsedPath.relativePath) {
        const fileName = baseNameFromPath(parsedPath.relativePath);
        return {
          kind: "file",
          name: fileName,
          path
        };
      }
      if (parsedPath?.kind === "folder") {
        const handle = await directoryHandleForId(parsedPath.id);
        return {
          kind: "folder",
          name: handle?.name ?? "Folder",
          path
        };
      }
      if (parsedPath?.kind === "file") {
        const handle = await fileHandleForId(parsedPath.id);
        return {
          kind: "file",
          name: handle?.name ?? baseNameFromPath(parsedPath.relativePath),
          path
        };
      }

      throw new Error("Path is not a web file system handle.");
    },
    async saveClipboardImage(input: SaveNativeClipboardImageInput): Promise<SavedNativeClipboardImage> {
      const parsedDocumentPath = parseWebHandlePath(input.documentPath);
      if (parsedDocumentPath?.kind !== "folder" || !parsedDocumentPath.relativePath) {
        const url = URL.createObjectURL(input.image);

        return {
          alt: imageAltFromFileName(input.image.name),
          src: url
        };
      }

      const root = await directoryHandleForId(parsedDocumentPath.id);
      if (!root) throw new Error("Web folder handle is no longer available.");

      const documentSegments = parsedDocumentPath.relativePath.split("/").filter(Boolean);
      documentSegments.pop();
      const documentDirectory = await resolveDirectory(root, documentSegments.join("/"));
      const folder = normalizeClipboardImageFolder(input.folder);
      const targetDirectory = await ensureDirectory(documentDirectory, folder);
      const fileName = await uniqueFileName(targetDirectory, input.fileName);

      await copyFileHandle(createUploadedFileHandle(input.image), targetDirectory, fileName);

      return {
        alt: imageAltFromFileName(input.image.name),
        src: encodeMarkdownRelativePath(joinRelativePath(folder, fileName))
      };
    },
    async saveHtmlFile(input: SaveNativeHtmlFileInput): Promise<SavedNativeHtmlFile> {
      return saveDownload(input, htmlFileType);
    },
    async saveMarkdownFile(input: SaveNativeMarkdownFileInput): Promise<SavedNativeMarkdownFile> {
      if (input.path) {
        const parsedPath = parseWebHandlePath(input.path);
        const handle = parsedPath?.kind === "file"
          ? await fileHandleForId(parsedPath.id)
          : parsedPath?.kind === "folder"
            ? await resolveFileFromFolderPath(parsedPath.id, parsedPath.relativePath)
            : null;
        if (handle && await writeFileHandle(handle, input.contents)) {
          const file = await handle.getFile();

          return {
            name: file.name || handle.name,
            path: input.path
          };
        }
      }

      if (showSaveFilePicker) {
        const handle = await showSaveFilePicker({
          suggestedName: input.suggestedName,
          types: [{
            accept: {
              "text/markdown": [".md", ".markdown"]
            },
            description: "Markdown"
          }]
        });
        await writeFileHandle(handle, input.contents);

        return {
          name: handle.name,
          path: await registerFileHandle(handle)
        };
      }

      return saveDownload(input, markdownFileType);
    },
    savePandocFile: async () => null,
    async savePdfFile(input: SaveNativePdfFileInput): Promise<SavedNativePdfFile> {
      await printFile({
        contents: input.contents,
        name: input.suggestedName,
        type: htmlFileType
      });

      return {
        name: input.suggestedName,
        path: `web-print://${encodeURIComponent(input.suggestedName)}`
      };
    },
    takeOpenedMarkdownPaths: async () => [],
    uploadS3Image: async () => {
      throw new Error("S3 uploads require a backend proxy in the web runtime.");
    },
    uploadPicGoImage: async () => {
      throw new Error("PicGo/PicList uploads require the desktop runtime.");
    },
    async uploadWebDavImage(input) {
      const normalizedBaseUrl = input.settings.serverUrl.replace(/\/+$/, "");
      const uploadPath = input.settings.uploadPath.replace(/^\/+|\/+$/g, "");
      const targetUrl = `${normalizedBaseUrl}/${uploadPath ? `${uploadPath}/` : ""}${encodeURIComponent(input.fileName)}`;
      const auth = btoa(`${input.settings.username}:${input.settings.password}`);
      const response = await (options.fetch ?? globalThis.fetch)(targetUrl, {
        body: input.image,
        headers: {
          authorization: `Basic ${auth}`
        },
        method: "PUT"
      });
      if (!response.ok) throw new Error(`WebDAV upload failed with status ${response.status}.`);
      const publicBaseUrl = input.settings.publicBaseUrl.replace(/\/+$/, "");

      return {
        alt: input.fileName,
        src: `${publicBaseUrl}/${uploadPath ? `${uploadPath}/` : ""}${encodeURIComponent(input.fileName)}`
      };
    },
    watchMarkdownFile: async () => () => undefined,
    watchMarkdownTree: async () => () => undefined,
    async writeMarkdownTemplateFile(fileName, contents) {
      const store = await templateStore();
      await store.set(fileName, contents);
      await store.save();
    }
  };
}
