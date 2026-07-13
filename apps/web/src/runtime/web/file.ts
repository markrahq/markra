import type {
  AppFileRuntime,
  AppSettingsRuntime,
  NativeMarkdownDroppedTarget,
  NativeMarkdownFile,
  NativeMarkdownFolder,
  NativeMarkdownFolderFile,
  NativeMarkdownImageFile,
  NativeMarkdownOpenTarget,
  NativeSettingsFile,
  ListNativeMarkdownFilesOptions,
  ReadNativeMarkdownImageInput,
  SavedNativeClipboardAttachment,
  SavedNativeClipboardImage,
  SavedNativeHtmlFile,
  SavedNativeMarkdownFile,
  SavedNativePdfFile,
  SavedNativeSettingsFile,
  SaveNativeClipboardAttachmentInput,
  SaveNativeClipboardImageInput,
  SaveNativeHtmlFileInput,
  SaveNativeMarkdownFileInput,
  SaveNativePdfFileInput,
  SaveNativeSettingsFileInput
} from "@markra/app/runtime";
import { zipSync } from "fflate";
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
import {
  createWorkspaceDirectoryHandle,
  createWorkspaceFileHandle,
  createWorkspaceUrl,
  parseWorkspaceUrl
} from "./workspace-handles";
import type { WorkspaceRepository } from "./workspace";

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

type RuntimeFolderPath = {
  id: string;
  relativePath: string;
  workspace: boolean;
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
const jsonFileType = "application/json;charset=utf-8";
const markdownExtensions = new Set(["md", "markdown"]);
const markdownOpenExtensions = new Set(["md", "markdown", "txt"]);
const assetExtensions = new Set(["avif", "bmp", "gif", "jpg", "jpeg", "png", "svg", "webp"]);
const skippedDirectoryNames = new Set([".git", "node_modules"]);
const fileHandleStorePath = "web-file-handles.json";
const directoryHandleStorePath = "web-directory-handles.json";
const settingsFilePickerTypes = [{
  accept: {
    "application/json": [".json"]
  },
  description: "Markra settings"
}];

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
  if (isAssetFileName(name)) return { kind: "asset" as const };
  if (isMarkdownFileName(name)) return {};

  return { kind: "attachment" as const };
}

function normalizeManagedAttachmentFolder(folder: string | null | undefined) {
  const normalized = folder?.trim().replace(/\\/gu, "/").replace(/\/+/gu, "/") ?? "";
  if (!normalized || normalized === ".") return null;

  const parts = normalized
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".");

  return parts.length ? parts.join("/") : null;
}

function relativePathIsBelowFolder(path: string, folder: string | null) {
  if (folder === null) return true;

  const normalizedPath = path.trim().replace(/\\/gu, "/").replace(/\/+/gu, "/").replace(/^\.\/+/u, "");
  return normalizedPath === folder || normalizedPath.startsWith(`${folder}/`);
}

function shouldIncludeFolderFile(file: NativeMarkdownFolderFile, managedAttachmentFolder: string | null) {
  return file.kind !== "attachment" || relativePathIsBelowFolder(file.relativePath, managedAttachmentFolder);
}

function encodePathSegments(path: string) {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function decodePathSegments(path: string) {
  return path.split("/").filter(Boolean).map(decodeURIComponent).join("/");
}

function decodeMarkdownRelativePath(src: string) {
  const path = src.split(/[?#]/u)[0] ?? "";

  try {
    return path.split("/").map((segment) => decodeURIComponent(segment)).join("/");
  } catch {
    return path;
  }
}

function joinRelativePath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

function normalizeWebRelativePath(path: string) {
  return path.replace(/\/+/gu, "/").replace(/^\/|\/$/gu, "");
}

function resolveWebRelativePath(parentPath: string, localSrc: string) {
  // Markdown may climb parent folders, but browser handles cannot escape their selected root.
  const segments = localSrc.startsWith("/")
    ? []
    : parentPath.split("/").filter(Boolean);

  for (const segment of localSrc.replace(/\\/gu, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) throw new Error("Image path is outside the web folder root.");
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return normalizeWebRelativePath(segments.join("/"));
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

function parseRuntimeFolderPath(path: string): RuntimeFolderPath | null {
  const workspace = parseWorkspaceUrl(path);
  if (workspace) {
    return {
      id: workspace.workspaceId,
      relativePath: workspace.path,
      workspace: true
    };
  }

  const external = parseWebHandlePath(path);
  if (external?.kind !== "folder") return null;

  return {
    id: external.id,
    relativePath: external.relativePath,
    workspace: false
  };
}

function sameFolderRuntime(left: RuntimeFolderPath, right: RuntimeFolderPath) {
  return left.id === right.id && left.workspace === right.workspace;
}

function pathAtOrBelow(path: string, rootPath: string) {
  return !rootPath || path === rootPath || path.startsWith(`${rootPath}/`);
}

function pathRelativeToRoot(path: string, rootPath: string) {
  if (!rootPath) return path;
  if (path === rootPath) return "";
  if (!path.startsWith(`${rootPath}/`)) throw new Error("Path is outside the selected web folder.");

  return path.slice(rootPath.length + 1);
}

function createRuntimeFolderPath(location: RuntimeFolderPath, relativePath: string) {
  return location.workspace
    ? createWorkspaceUrl(location.id, relativePath)
    : createFolderPath(location.id, relativePath);
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
  workspaceRepository: WorkspaceRepository,
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
      path: await registerFileHandle(handle),
      sizeBytes: file.size
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
    const parsedPath = parseRuntimeFolderPath(path);
    if (!parsedPath) {
      throw new Error("Path is not a web folder handle.");
    }
    const root = parsedPath.workspace
      ? createWorkspaceDirectoryHandle(
          workspaceRepository,
          parsedPath.id,
          "",
          (await workspaceRepository.ensureDefaultWorkspace()).name
        )
      : await directoryHandleForId(parsedPath.id);
    if (!root) {
      throw new Error("Web folder handle is no longer available.");
    }

    return {
      directory: await resolveDirectory(root, parsedPath.relativePath),
      id: parsedPath.id,
      location: parsedPath,
      relativePath: parsedPath.relativePath,
      root
    };
  }

  async function treeEntryForPath(rootPath: string, path: string) {
    const parsedPath = parseRuntimeFolderPath(path);
    if (!parsedPath?.relativePath) {
      throw new Error("Path is not a web folder entry.");
    }

    const rootDirectory = await directoryForPath(rootPath);
    if (!sameFolderRuntime(parsedPath, rootDirectory.location)) {
      throw new Error("Path belongs to a different web folder.");
    }
    if (!pathAtOrBelow(parsedPath.relativePath, rootDirectory.relativePath)) {
      throw new Error("Path is outside the selected web folder.");
    }

    const segments = parsedPath.relativePath.split("/").filter(Boolean);
    const name = segments.pop();
    if (!name) throw new Error("Path is not a movable web folder entry.");

    const parentRelativePath = segments.join("/");
    const parent = await resolveDirectory(rootDirectory.root, parentRelativePath);

    try {
      const directory = await parent.getDirectoryHandle?.(name);
      if (directory) {
        return {
          handle: directory,
          location: parsedPath,
          kind: "folder" as const,
          name,
          parent,
          parentRelativePath,
          relativePath: parsedPath.relativePath,
          root: rootDirectory.root,
          rootRelativePath: rootDirectory.relativePath
        };
      }
    } catch {
      // Fall through and try resolving the entry as a file.
    }

    const file = await parent.getFileHandle?.(name);
    if (!file) throw new Error("Browser directory handle cannot resolve child files.");

    return {
      handle: file,
      location: parsedPath,
      kind: "file" as const,
      name,
      parent,
      parentRelativePath,
      relativePath: parsedPath.relativePath,
      root: rootDirectory.root,
      rootRelativePath: rootDirectory.relativePath
    };
  }

  async function targetDirectoryForPath(rootPath: string, targetParentPath: string | null | undefined) {
    const rootDirectory = await directoryForPath(rootPath);
    if (!targetParentPath) {
      return {
        directory: rootDirectory.directory,
        location: rootDirectory.location,
        relativePath: rootDirectory.relativePath,
        rootRelativePath: rootDirectory.relativePath
      };
    }

    const parsedTargetPath = parseRuntimeFolderPath(targetParentPath);
    if (!parsedTargetPath) throw new Error("Target path is not a web folder handle.");
    if (!sameFolderRuntime(parsedTargetPath, rootDirectory.location)) {
      throw new Error("Target path belongs to a different web folder.");
    }
    if (!pathAtOrBelow(parsedTargetPath.relativePath, rootDirectory.relativePath)) {
      throw new Error("Target path is outside the selected web folder.");
    }

    return {
      directory: await resolveDirectory(rootDirectory.root, parsedTargetPath.relativePath),
      location: parsedTargetPath,
      relativePath: parsedTargetPath.relativePath,
      rootRelativePath: rootDirectory.relativePath
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

  function isExclusiveCreateConflict(error: unknown) {
    return typeof error === "object"
      && error !== null
      && "name" in error
      && error.name === "InvalidModificationError";
  }

  async function createFileExclusive(directory: WebDirectoryHandle, name: string) {
    if (directory.createFileExclusive) return directory.createFileExclusive(name);

    await assertTargetEntryAvailable(directory, name);
    if (!directory.getFileHandle) throw new Error("Browser directory handle cannot create files.");

    return directory.getFileHandle(name, { create: true });
  }

  async function createDirectoryExclusive(directory: WebDirectoryHandle, name: string) {
    if (directory.createDirectoryExclusive) return directory.createDirectoryExclusive(name);

    await assertTargetEntryAvailable(directory, name);
    if (!directory.getDirectoryHandle) throw new Error("Browser directory handle cannot create folders.");

    return directory.getDirectoryHandle(name, { create: true });
  }

  async function createUniqueWorkspaceFile(directory: WebDirectoryHandle, fileName: string) {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const candidate = uniqueFileNameCandidate(fileName, attempt);
      try {
        return {
          handle: await createFileExclusive(directory, candidate),
          name: candidate
        };
      } catch (error) {
        if (!isExclusiveCreateConflict(error)) throw error;
      }
    }

    throw new Error("Could not create a unique workspace file.");
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

  function movedTreeFile(
    location: RuntimeFolderPath,
    rootRelativePath: string,
    path: string,
    name: string,
    kind: "file" | "folder"
  ) {
    const relativePath = pathRelativeToRoot(path, rootRelativePath);

    return {
      ...(kind === "folder" ? { kind: "folder" as const } : folderFileKindFromName(name)),
      name,
      path: createRuntimeFolderPath(location, path),
      relativePath
    };
  }

  async function resolveFileFromFolderPath(path: string) {
    const parsedPath = parseRuntimeFolderPath(path);
    if (!parsedPath?.relativePath) throw new Error("Path is not a file.");
    const root = parsedPath.workspace
      ? createWorkspaceDirectoryHandle(
          workspaceRepository,
          parsedPath.id,
          "",
          (await workspaceRepository.ensureDefaultWorkspace()).name
        )
      : await directoryHandleForId(parsedPath.id);
    if (!root) throw new Error("Web folder handle is no longer available.");
    const segments = parsedPath.relativePath.split("/").filter(Boolean);
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
      const handle = await resolveFileFromFolderPath(path);

      return {
        file: await handle.getFile(),
        handle,
        path
      };
    }

    const workspacePath = parseWorkspaceUrl(path);
    if (workspacePath?.path) {
      await workspaceRepository.ensureDefaultWorkspace();
      const handle = createWorkspaceFileHandle(
        workspaceRepository,
        workspacePath.workspaceId,
        workspacePath.path
      );

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
    input: SaveNativeMarkdownFileInput | SaveNativeHtmlFileInput | SaveNativePdfFileInput | SaveNativeSettingsFileInput,
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
    directory: WebDirectoryHandle,
    parentRelativePath: string,
    entries: NativeMarkdownFolderFile[],
    managedAttachmentFolder: string | null,
    createPath: (relativePath: string) => string
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
            path: createPath(relativePath),
            relativePath
          });
          await collectMarkdownEntries(handle, relativePath, entries, managedAttachmentFolder, createPath);
        }
        continue;
      }

      const file = {
        ...folderFileKindFromName(name),
        name,
        path: createPath(relativePath),
        relativePath
      };
      if (shouldIncludeFolderFile(file, managedAttachmentFolder)) entries.push(file);
    }
  }

  async function listWorkspaceMarkdownEntries(
    location: RuntimeFolderPath,
    managedAttachmentFolder: string | null
  ) {
    const storedEntries = await workspaceRepository.list(
      location.id,
      location.relativePath || undefined
    );
    const entries: NativeMarkdownFolderFile[] = [];
    for (const entry of storedEntries) {
      const relativePath = pathRelativeToRoot(entry.path, location.relativePath);
      if (!relativePath) continue;

      const segments = relativePath.split("/");
      const directorySegments = entry.kind === "directory" ? segments : segments.slice(0, -1);
      if (directorySegments.some((segment) => skippedDirectoryNames.has(segment))) continue;

      const name = segments.at(-1) ?? relativePath;
      const file = entry.kind === "directory"
        ? {
            kind: "folder" as const,
            name,
            path: createRuntimeFolderPath(location, entry.path),
            relativePath
          }
        : {
            ...folderFileKindFromName(name),
            name,
            path: createRuntimeFolderPath(location, entry.path),
            relativePath
          };
      if (entry.kind === "directory" || shouldIncludeFolderFile(file, managedAttachmentFolder)) {
        entries.push(file);
      }
    }

    return entries;
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

  async function readMarkdownImageFile(input: ReadNativeMarkdownImageInput) {
    const documentPath = parseRuntimeFolderPath(input.documentPath);
    if (!documentPath) throw new Error("Current document is not a web folder file.");
    const documentSegments = documentPath.relativePath.split("/").filter(Boolean);
    documentSegments.pop();
    const localSrc = decodeMarkdownRelativePath(input.src);
    const imagePath = resolveWebRelativePath(documentSegments.join("/"), localSrc);
    const handle = await resolveFileFromFolderPath(createRuntimeFolderPath(documentPath, imagePath));
    const file = await handle.getFile();

    return {
      dataUrl: await fileToDataUrl(file),
      mimeType: file.type || "application/octet-stream",
      path: createRuntimeFolderPath(documentPath, imagePath),
      src: input.src
    } satisfies NativeMarkdownImageFile;
  }

  return {
    backupMarkdownFolder: async () => {
      throw new Error("Local folder backups require the desktop runtime.");
    },
    canExportMarkdownFolder: (path) => parseWorkspaceUrl(path) !== null,
    syncMarkdownFolder: async () => {
      throw new Error("Remote sync requires the desktop runtime.");
    },
    confirmMarkdownFileDelete: async (_fileName, labels) => confirm(labels.message),
    confirmUnsavedMarkdownDocumentDiscard: async (_fileName, labels) => confirm(labels.message),
    async createMarkdownTreeFile(rootPath, fileName, optionsOrParentPath = null) {
      const options = typeof optionsOrParentPath === "object" && optionsOrParentPath !== null
        ? optionsOrParentPath
        : { parentPath: optionsOrParentPath };
      const root = await directoryForPath(rootPath);
      const parentPath = options.parentPath ? await directoryForPath(options.parentPath) : root;
      if (!sameFolderRuntime(root.location, parentPath.location)) {
        throw new Error("Parent path belongs to a different web folder.");
      }
      if (!pathAtOrBelow(parentPath.relativePath, root.relativePath)) {
        throw new Error("Parent path is outside the selected web folder.");
      }
      const parent = parentPath.directory;
      if (!parent.getFileHandle) throw new Error("Browser directory handle cannot create files.");
      let handle: WebFileHandle;
      try {
        handle = await createFileExclusive(parent, fileName);
      } catch (error) {
        if (!isExclusiveCreateConflict(error)) throw error;
        throw new Error("Target entry already exists.");
      }
      await writeFileHandle(handle, options.contents ?? "");
      const path = joinRelativePath(parentPath.relativePath, fileName);
      const relativePath = pathRelativeToRoot(path, root.relativePath);

      return {
        name: fileName,
        path: createRuntimeFolderPath(root.location, path),
        relativePath
      };
    },
    async createMarkdownTreeFolder(rootPath, folderName, parentPath = null) {
      const root = await directoryForPath(rootPath);
      const resolvedParent = parentPath ? await directoryForPath(parentPath) : root;
      if (!sameFolderRuntime(root.location, resolvedParent.location)) {
        throw new Error("Parent path belongs to a different web folder.");
      }
      if (!pathAtOrBelow(resolvedParent.relativePath, root.relativePath)) {
        throw new Error("Parent path is outside the selected web folder.");
      }
      const parent = resolvedParent.directory;
      if (!parent.getDirectoryHandle) throw new Error("Browser directory handle cannot create folders.");
      try {
        await createDirectoryExclusive(parent, folderName);
      } catch (error) {
        if (!isExclusiveCreateConflict(error)) throw error;
        throw new Error("Target entry already exists.");
      }
      const path = joinRelativePath(resolvedParent.relativePath, folderName);
      const relativePath = pathRelativeToRoot(path, root.relativePath);

      return {
        kind: "folder",
        name: folderName,
        path: createRuntimeFolderPath(root.location, path),
        relativePath
      };
    },
    async deleteMarkdownTemplateFile(fileName) {
      const store = await templateStore();
      await store.delete(fileName);
      await store.save();
    },
    async deleteMarkdownTreeFile(rootPath, path) {
      const parsedPath = parseRuntimeFolderPath(path);
      if (!parsedPath) throw new Error("Path is not a web folder entry.");
      const segments = parsedPath.relativePath.split("/").filter(Boolean);
      const name = segments.pop();
      if (!name) return;
      const rootDirectory = await directoryForPath(rootPath);
      if (!sameFolderRuntime(parsedPath, rootDirectory.location)) {
        throw new Error("Path belongs to a different web folder.");
      }
      if (!pathAtOrBelow(parsedPath.relativePath, rootDirectory.relativePath)) {
        throw new Error("Path is outside the selected web folder.");
      }
      const parent = await resolveDirectory(rootDirectory.root, segments.join("/"));
      if (!parent.removeEntry) throw new Error("Browser directory handle cannot delete entries.");
      await parent.removeEntry(name, { recursive: true });
    },
    detectPandocPath: async () => null,
    async exportMarkdownFolder(path) {
      const workspacePath = parseWorkspaceUrl(path);
      if (!workspacePath) throw new Error("Path is not a web workspace folder.");
      await workspaceRepository.ensureDefaultWorkspace();
      const entries = await workspaceRepository.exportEntries(
        workspacePath.workspaceId,
        workspacePath.path || undefined
      );
      const archiveEntries: Array<readonly [string, Uint8Array]> = [];
      for (const entry of entries) {
        const relativePath = pathRelativeToRoot(entry.path, workspacePath.path);
        if (!relativePath) continue;
        if (entry.kind === "directory") {
          archiveEntries.push([`${relativePath}/`, new Uint8Array()]);
          continue;
        }

        archiveEntries.push([
          relativePath,
          new Uint8Array(await (entry.body ?? new Blob([])).arrayBuffer())
        ]);
      }
      const name = `${baseNameFromPath(workspacePath.path) || "Markra"}.zip`;
      const contents = new Blob([zipSync(Object.fromEntries(archiveEntries))], {
        type: "application/zip"
      });
      await downloadFile({ contents, name, type: "application/zip" });

      return {
        name,
        path: `web-download://${encodeURIComponent(name)}`
      };
    },
    async getDefaultMarkdownFolder() {
      const workspace = await workspaceRepository.ensureDefaultWorkspace();

      return {
        name: workspace.name,
        path: createWorkspaceUrl(workspace.id, "")
      };
    },
    async downloadWebImage(input) {
      const response = await (options.fetch ?? globalThis.fetch)(input.src);
      const blob = await response.blob();

      return new File([blob], baseNameFromPath(new URL(input.src, "https://example.test").pathname), {
        type: blob.type || "application/octet-stream"
      });
    },
    async importLocalFile() {
      throw new Error("Importing local files requires the desktop runtime.");
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
    listMarkdownFileHistory: async () => [],
    async listMarkdownFilesForPath(path, options: ListNativeMarkdownFilesOptions = {}) {
      const parsedPath = parseRuntimeFolderPath(path);
      if (!parsedPath) return [];
      const managedAttachmentFolder = normalizeManagedAttachmentFolder(options.managedAttachmentFolder);
      if (parsedPath.workspace) {
        // A flat repository scan prevents recursive handles from re-reading the same subtree at every depth.
        const entries = await listWorkspaceMarkdownEntries(parsedPath, managedAttachmentFolder);

        return entries.sort((left, right) =>
          left.relativePath.toLowerCase().localeCompare(right.relativePath.toLowerCase())
        );
      }

      const resolved = await directoryForPath(path);
      const entries: NativeMarkdownFolderFile[] = [];

      await collectMarkdownEntries(
        resolved.directory,
        "",
        entries,
        managedAttachmentFolder,
        (relativePath) => createRuntimeFolderPath(
          parsedPath,
          joinRelativePath(parsedPath.relativePath, relativePath)
        )
      );

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
      if (source.location.workspace) {
        if (!source.handle.move) throw new Error("Workspace entry cannot be moved atomically.");
        await source.handle.move(target.directory);
      } else if (source.kind === "folder") {
        await copyDirectoryHandle(source.handle, target.directory, source.name);
      } else {
        await copyFileHandle(source.handle, target.directory, source.name);
      }
      if (!source.location.workspace) await removeTreeEntry(source.parent, source.name);

      const relativePath = joinRelativePath(target.relativePath, source.name);

      return movedTreeFile(
        target.location,
        target.rootRelativePath,
        relativePath,
        source.name,
        source.kind
      );
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
    async openContainingFolder() {
      throw new Error("Opening containing folders requires the desktop runtime.");
    },
    openLocalImages: async () => [],
    openLocalFiles: async () => [],
    async openMarkdownAttachment(input) {
      const parsedDocumentPath = input.documentPath ? parseRuntimeFolderPath(input.documentPath) : null;
      if (!parsedDocumentPath?.relativePath) {
        throw new Error("Current document is not a web folder file.");
      }

      const documentSegments = parsedDocumentPath.relativePath.split("/").filter(Boolean);
      documentSegments.pop();
      const localSrc = decodeMarkdownRelativePath(input.src);
      const attachmentPath = normalizeWebRelativePath(joinRelativePath(documentSegments.join("/"), localSrc));
      const handle = await resolveFileFromFolderPath(createRuntimeFolderPath(parsedDocumentPath, attachmentPath));
      const file = await handle.getFile();
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
    },
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

      const files = await pickDirectoryFiles();
      if (files.length === 0) return null;
      const workspace = await workspaceRepository.ensureDefaultWorkspace();
      const rootName = uploadedDirectoryRootName(files);
      const relativePath = await workspaceRepository.importDirectory(workspace.id, rootName, files);

      return {
        name: rootName,
        path: createWorkspaceUrl(workspace.id, relativePath)
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
    async openSettingsFile(): Promise<NativeSettingsFile | null> {
      if (!showOpenFilePicker) return null;
      const [handle] = await showOpenFilePicker({
        multiple: false,
        types: settingsFilePickerTypes
      });
      if (!handle) return null;
      const file = await handle.getFile();

      return {
        content: await file.text(),
        name: file.name || handle.name,
        path: await registerFileHandle(handle)
      };
    },
    async readLocalImageFile(path) {
      const { file } = await readFileFromPath(path);
      if (!isAssetFileName(file.name)) throw new Error("Selected file is not a supported image file.");

      return file;
    },
    async readMarkdownFile(path) {
      const { file } = await readFileFromPath(path);
      if (!isMarkdownOpenFileName(file.name)) throw new Error("Selected file is not a supported Markdown file.");

      return {
        content: await file.text(),
        name: file.name,
        path,
        sizeBytes: file.size
      };
    },
    readMarkdownFileHistory: () => Promise.reject(new Error("Markdown history is unavailable in the web runtime.")),
    readMarkdownImageFile,
    resolveMarkdownImageSrc: async (input) => (await readMarkdownImageFile(input)).dataUrl,
    async readMarkdownTemplateFile(fileName) {
      const store = await templateStore();

      return (await store.get<string>(fileName)) ?? "";
    },
    async renameMarkdownTreeFile(rootPath, path, fileName) {
      const source = await treeEntryForPath(rootPath, path);
      const normalizedFileName = fileName.trim();
      if (!normalizedFileName) throw new Error("File name is required.");
      if (normalizedFileName === source.name) {
        return movedTreeFile(
          source.location,
          source.rootRelativePath,
          source.relativePath,
          source.name,
          source.kind
        );
      }

      await assertTargetEntryAvailable(source.parent, normalizedFileName);
      if (source.location.workspace) {
        if (!source.handle.move) throw new Error("Workspace entry cannot be renamed atomically.");
        await source.handle.move(normalizedFileName);
      } else if (source.kind === "folder") {
        await copyDirectoryHandle(source.handle, source.parent, normalizedFileName);
      } else {
        await copyFileHandle(source.handle, source.parent, normalizedFileName);
      }
      if (!source.location.workspace) await removeTreeEntry(source.parent, source.name);

      const relativePath = joinRelativePath(source.parentRelativePath, normalizedFileName);

      return movedTreeFile(
        source.location,
        source.rootRelativePath,
        relativePath,
        normalizedFileName,
        source.kind
      );
    },
    async resolveMarkdownPath(path) {
      const workspacePath = parseWorkspaceUrl(path);
      if (workspacePath?.path) {
        return {
          kind: "file",
          name: baseNameFromPath(workspacePath.path),
          path
        };
      }
      if (workspacePath) {
        return {
          kind: "folder",
          name: (await workspaceRepository.ensureDefaultWorkspace()).name,
          path
        };
      }
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
      if (input.copyToStorage === false) {
        return {
          alt: imageAltFromFileName(input.image.name),
          src: URL.createObjectURL(input.image)
        };
      }

      const parsedDocumentPath = parseRuntimeFolderPath(input.documentPath ?? "");
      if (!parsedDocumentPath?.relativePath) {
        const url = URL.createObjectURL(input.image);

        return {
          alt: imageAltFromFileName(input.image.name),
          src: url
        };
      }

      const documentSegments = parsedDocumentPath.relativePath.split("/").filter(Boolean);
      documentSegments.pop();
      const documentDirectory = (await directoryForPath(createRuntimeFolderPath(
        parsedDocumentPath,
        documentSegments.join("/")
      ))).directory;
      const folder = normalizeClipboardImageFolder(input.folder);
      const targetDirectory = await ensureDirectory(documentDirectory, folder);
      const fileName = await uniqueFileName(targetDirectory, input.fileName);

      await copyFileHandle(createUploadedFileHandle(input.image), targetDirectory, fileName);

      return {
        alt: imageAltFromFileName(input.image.name),
        src: encodeMarkdownRelativePath(joinRelativePath(folder, fileName))
      };
    },
    async saveClipboardAttachment(input: SaveNativeClipboardAttachmentInput): Promise<SavedNativeClipboardAttachment> {
      if (input.copyToStorage === false) {
        return {
          label: input.attachment.name.trim() || "attachment",
          src: URL.createObjectURL(input.attachment)
        };
      }

      const parsedDocumentPath = parseRuntimeFolderPath(input.documentPath ?? "");
      if (!parsedDocumentPath?.relativePath) {
        const url = URL.createObjectURL(input.attachment);

        return {
          label: input.attachment.name.trim() || "attachment",
          src: url
        };
      }

      const documentSegments = parsedDocumentPath.relativePath.split("/").filter(Boolean);
      documentSegments.pop();
      const documentDirectory = (await directoryForPath(createRuntimeFolderPath(
        parsedDocumentPath,
        documentSegments.join("/")
      ))).directory;
      const folder = normalizeClipboardImageFolder(input.folder);
      const targetDirectory = await ensureDirectory(documentDirectory, folder);
      const fileName = await uniqueFileName(targetDirectory, input.attachment.name.trim() || "attachment");

      await copyFileHandle(createUploadedFileHandle(input.attachment), targetDirectory, fileName);

      return {
        label: input.attachment.name.trim() || fileName,
        src: encodeMarkdownRelativePath(joinRelativePath(folder, fileName))
      };
    },
    async saveHtmlFile(input: SaveNativeHtmlFileInput): Promise<SavedNativeHtmlFile> {
      return saveDownload(input, htmlFileType);
    },
    async saveMarkdownFile(input: SaveNativeMarkdownFileInput): Promise<SavedNativeMarkdownFile> {
      if (input.path) {
        const parsedPath = parseWebHandlePath(input.path);
        const workspacePath = parseWorkspaceUrl(input.path);
        const handle = workspacePath?.path
          ? createWorkspaceFileHandle(workspaceRepository, workspacePath.workspaceId, workspacePath.path)
          : parsedPath?.kind === "file"
            ? await fileHandleForId(parsedPath.id)
            : parsedPath?.kind === "folder"
              ? await resolveFileFromFolderPath(input.path)
              : null;
        if (workspacePath) await workspaceRepository.ensureDefaultWorkspace();
        if (handle && await writeFileHandle(handle, input.contents)) {
          const file = await handle.getFile();

          return {
            name: file.name || handle.name,
            path: input.path
          };
        }
      }

      const defaultWorkspace = parseWorkspaceUrl(input.defaultDirectory ?? "");
      if (defaultWorkspace) {
        const workspace = await workspaceRepository.ensureDefaultWorkspace();
        const directory = createWorkspaceDirectoryHandle(
          workspaceRepository,
          defaultWorkspace.workspaceId,
          defaultWorkspace.path,
          baseNameFromPath(defaultWorkspace.path) || workspace.name
        );
        const created = await createUniqueWorkspaceFile(directory, input.suggestedName);
        const { fileName, handle } = { fileName: created.name, handle: created.handle };
        await writeFileHandle(handle, input.contents);
        const path = joinRelativePath(defaultWorkspace.path, fileName);

        return {
          name: fileName,
          path: createWorkspaceUrl(defaultWorkspace.workspaceId, path)
        };
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
    async saveSettingsFile(input: SaveNativeSettingsFileInput): Promise<SavedNativeSettingsFile> {
      if (showSaveFilePicker) {
        const handle = await showSaveFilePicker({
          suggestedName: input.suggestedName,
          types: settingsFilePickerTypes
        });
        await writeFileHandle(handle, input.contents);

        return {
          name: handle.name,
          path: await registerFileHandle(handle)
        };
      }

      return saveDownload(input, jsonFileType);
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
