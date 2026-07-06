import { invokeNative } from "./invoke";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { debug, fileNameFromPath } from "@markra/shared";
import { networkSettingsForNativeRequest } from "./network";
import { listenNativeEvent, safeNativeEventCleanup } from "./events";
import type {
  PicGoImageUploadSettings,
  S3ImageUploadSettings,
  SyncNativeMarkdownFolderInput,
  WebDavImageUploadSettings,
  NativeMarkdownSyncSummary,
  WorkspaceSearchRequest,
  WorkspaceSearchResponse
} from "@markra/app/runtime";

type MarkdownFileResponse = {
  path: string;
  contents: string;
  sizeBytes: number;
};

type MarkdownFileHistoryEntryResponse = {
  id: string;
  createdAt: number;
  sizeBytes: number;
};

type MarkdownFileHistoryFileResponse = {
  id: string;
  contents: string;
};

type MarkdownTemplateFileResponse = {
  contents: string;
};

type TextFileResponse = {
  path: string;
  contents: string;
};

type MarkdownFolderFileResponse = {
  createdAt?: number;
  kind?: "asset" | "attachment" | "file" | "folder";
  modifiedAt?: number;
  path: string;
  relativePath: string;
};

type MarkdownOpenPathResponse =
  | {
      kind: "file";
      path: string;
    }
  | {
      kind: "folder";
      path: string;
    };

type MarkdownWorkspaceSearchResultResponse = Omit<WorkspaceSearchResponse["results"][number], "file"> & {
  file: MarkdownFolderFileResponse;
};

type MarkdownWorkspaceSearchResponse = Omit<WorkspaceSearchResponse, "results"> & {
  results: MarkdownWorkspaceSearchResultResponse[];
};

type MarkdownFileTreeLoadEventResponse = {
  done?: boolean;
  error?: string;
  files?: MarkdownFolderFileResponse[];
  requestId: string;
};

export type NativeMarkdownFile = {
  path: string;
  name: string;
  content: string;
  sizeBytes: number;
};

export type NativeSettingsFile = {
  path: string;
  name: string;
  content: string;
};

export type NativeMarkdownFileHistoryEntry = {
  id: string;
  createdAt: number;
  sizeBytes: number;
};

export type NativeMarkdownFileHistoryFile = {
  id: string;
  contents: string;
};

export type NativeMarkdownFolderFile = {
  createdAt?: number;
  kind?: "asset" | "attachment" | "folder";
  modifiedAt?: number;
  path: string;
  name: string;
  relativePath: string;
};

export type NativeMarkdownFolder = {
  path: string;
  name: string;
};

export type NativeMarkdownOpenTarget =
  | {
      kind: "file";
      file: NativeMarkdownFile;
    }
  | {
      kind: "folder";
      folder: NativeMarkdownFolder;
    };

export type NativeMarkdownDropPoint = {
  left: number;
  top: number;
};

export type CreateNativeMarkdownTreeFileOptions = {
  contents?: string | null;
  parentPath?: string | null;
};

export type NativeMarkdownDroppedTarget =
  | {
      kind: "file";
      path: string;
      name: string;
    }
  | {
      kind: "folder";
      path: string;
      name: string;
    }
  | {
      kind: "image";
      path: string;
      name: string;
      point?: NativeMarkdownDropPoint;
    };

export type SaveNativeMarkdownFileInput = {
  defaultDirectory?: string | null;
  historyCursorId?: string;
  path: string | null;
  skipHistorySnapshot?: boolean;
  suggestedName: string;
  contents: string;
};

export type SaveNativeHtmlFileInput = {
  suggestedName: string;
  contents: string;
};

export type SaveNativePdfFileInput = {
  suggestedName: string;
  contents: string;
};

export type SaveNativeSettingsFileInput = {
  suggestedName: string;
  contents: string;
};

export type NativePandocExportFormat = "docx" | "epub" | "latex";

export type SaveNativePandocFileInput = {
  documentPath: string | null;
  format: NativePandocExportFormat;
  markdown: string;
  pandocArgs: string;
  pandocPath: string;
  suggestedName: string;
};

export type SavedNativeMarkdownFile = {
  path: string;
  name: string;
};

export type SavedNativeHtmlFile = {
  path: string;
  name: string;
};

export type SavedNativePdfFile = {
  path: string;
  name: string;
};

export type SavedNativeSettingsFile = {
  path: string;
  name: string;
};

export type SavedNativePandocFile = {
  path: string;
  name: string;
};

export type SaveNativeClipboardImageInput = {
  copyToStorage?: boolean;
  documentPath: string | null;
  fileName: string;
  folder: string;
  image: File;
};

export type SaveNativeClipboardAttachmentInput = {
  attachment: File;
  copyToStorage?: boolean;
  documentPath: string | null;
  folder: string;
};

export type OpenNativeMarkdownAttachmentInput = {
  documentPath?: string | null;
  rootPath: string | null;
  src: string;
};

export type DownloadNativeWebImageInput = {
  src: string;
};

export type UploadNativeWebDavImageInput = {
  fileName: string;
  image: File;
  settings: WebDavImageUploadSettings;
};

export type UploadNativePicGoImageInput = {
  fileName: string;
  image: File;
  settings: PicGoImageUploadSettings;
};

export type UploadNativeS3ImageInput = {
  fileName: string;
  image: File;
  settings: S3ImageUploadSettings;
};

export type BackupNativeMarkdownFolderInput = {
  sourcePath: string;
  targetPath: string;
};

export type NativeMarkdownBackupSummary = {
  bytesCopied: number;
  copiedFiles: number;
  deletedFiles: number;
  deletedFolders: number;
  scannedFiles: number;
  skippedFiles: number;
};

type NativeMarkdownSyncResponse = NativeMarkdownSyncSummary;

export type NativeMarkdownPickerLabels = {
  title: string;
};

export type SavedNativeClipboardImage = {
  alt: string;
  src: string;
};

export type SavedNativeClipboardAttachment = {
  label: string;
  src: string;
};

export type ReadNativeMarkdownImageInput = {
  documentPath: string;
  src: string;
};

export type NativeMarkdownImageFile = {
  dataUrl: string;
  mimeType: string;
  path: string;
  src: string;
};

export type NativeMarkdownFileChangeHandler = (path: string) => unknown | Promise<unknown>;
export type NativeMarkdownTreeChangeHandler = (path: string) => unknown | Promise<unknown>;
export type NativeMarkdownFileDropHandler = (target: NativeMarkdownDroppedTarget) => unknown | Promise<unknown>;

type MarkdownFileChangedPayload = {
  path: string;
};

type MarkdownTreeChangedPayload = {
  path: string;
  rootPath: string;
};

type ClipboardImageFileResponse = {
  relativePath: string;
};

type WebImageDownloadResponse = {
  bytes: number[];
  fileName: string;
  mimeType: string;
};

type RemoteImageUploadResponse = {
  url: string;
};

type NativeMarkdownBackupResponse = NativeMarkdownBackupSummary;

type MarkdownImageFileResponse = {
  bytes: number[];
  mimeType: string;
  path: string;
};

type OpenedMarkdownPathsPayload = {
  paths?: unknown;
};

const markdownFileChangedEvent = "markra://file-changed";
const markdownTreeChangedEvent = "markra://tree-changed";
const openedMarkdownPathsEvent = "markra://opened-markdown-paths";

const markdownFilters = [
  {
    name: "Markdown",
    extensions: ["md", "markdown", "txt"]
  }
];

const htmlFilters = [
  {
    name: "HTML",
    extensions: ["html", "htm"]
  }
];

const imageFilters = [
  {
    name: "Images",
    extensions: ["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]
  }
];
const imageFileExtensions = new Set(imageFilters.flatMap((filter) => filter.extensions));

const pdfFilters = [
  {
    name: "PDF",
    extensions: ["pdf"]
  }
];

const settingsFilters = [
  {
    name: "Markra settings",
    extensions: ["json"]
  }
];

const pandocExportFilters: Record<NativePandocExportFormat, Array<{ extensions: string[]; name: string }>> = {
  docx: [
    {
      name: "Word document",
      extensions: ["docx"]
    }
  ],
  epub: [
    {
      name: "EPUB",
      extensions: ["epub"]
    }
  ],
  latex: [
    {
      name: "LaTeX",
      extensions: ["tex"]
    }
  ]
};

function isMarkdownTreeFilePath(path: string) {
  return /\.(md|markdown)$/i.test(path);
}

function isMarkdownTreeAssetPath(path: string) {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(path);
}

function normalizeOpenedMarkdownPaths(paths: unknown) {
  if (!Array.isArray(paths)) return [];

  return paths.filter((path): path is string => typeof path === "string" && path.trim().length > 0);
}

function parentPathFromPath(path: string) {
  const lastSeparatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (lastSeparatorIndex < 0) return ".";
  return path.slice(0, lastSeparatorIndex);
}

function treeRootPathFromPath(path: string) {
  if (isMarkdownTreeFilePath(path) || isMarkdownTreeAssetPath(path)) {
    return parentPathFromPath(path);
  }

  return path;
}

function normalizeNativeParentPath(path: string | null | undefined) {
  const trimmedPath = path?.trim();
  return trimmedPath ? trimmedPath : null;
}

function nativePathSeparator(path: string) {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

function nativeDefaultSavePath(defaultDirectory: string | null | undefined, suggestedName: string) {
  const directory = defaultDirectory?.trim();
  const name = suggestedName.trim() || "Untitled.md";
  if (!directory) return name;

  const separator = nativePathSeparator(directory);
  return `${directory.replace(/[\\/]+$/u, "")}${separator}${name.replace(/^[\\/]+/u, "")}`;
}

export async function takeNativeOpenedMarkdownPaths(): Promise<string[]> {
  return normalizeOpenedMarkdownPaths(await invokeNative("take_opened_markdown_paths"));
}

export async function listenNativeOpenedMarkdownPaths(onPaths: (paths: string[]) => unknown | Promise<unknown>) {
  return listenNativeEvent<OpenedMarkdownPathsPayload>(openedMarkdownPathsEvent, (event) => {
    const paths = normalizeOpenedMarkdownPaths(event.payload?.paths);
    if (paths.length === 0) return;

    Promise.resolve(onPaths(paths)).catch(() => {});
  });
}

export async function readNativeMarkdownFile(path: string): Promise<NativeMarkdownFile> {
  debug(() => ["[markra-history] native read file start", {
    path
  }]);
  const file = await invokeNative<MarkdownFileResponse>("read_markdown_file", {
    path
  });
  debug(() => ["[markra-history] native read file success", {
    contentsChars: file.contents.length,
    path: file.path,
    sizeBytes: file.sizeBytes
  }]);

  return {
    path: file.path,
    name: fileNameFromPath(file.path),
    content: file.contents,
    sizeBytes: file.sizeBytes
  };
}

export async function listNativeMarkdownFileHistory(path: string): Promise<NativeMarkdownFileHistoryEntry[]> {
  debug(() => ["[markra-history] native list history start", {
    path
  }]);
  const entries = await invokeNative<MarkdownFileHistoryEntryResponse[]>("list_markdown_file_history", {
    path
  });
  debug(() => ["[markra-history] native list history success", {
    entryCount: entries.length,
    firstEntryId: entries[0]?.id ?? null,
    path
  }]);
  return entries;
}

export async function readNativeMarkdownFileHistory(
  path: string,
  id: string
): Promise<NativeMarkdownFileHistoryFile> {
  debug(() => ["[markra-history] native read history start", {
    historyId: id,
    path
  }]);
  const file = await invokeNative<MarkdownFileHistoryFileResponse>("read_markdown_file_history", {
    id,
    path
  });
  debug(() => ["[markra-history] native read history success", {
    contentsChars: file.contents.length,
    historyId: file.id,
    path
  }]);
  return file;
}

export async function readNativeMarkdownTemplateFile(fileName: string): Promise<string> {
  const file = await invokeNative<MarkdownTemplateFileResponse>("read_markdown_template_file", {
    fileName
  });

  return file.contents;
}

export async function writeNativeMarkdownTemplateFile(fileName: string, contents: string) {
  await invokeNative("write_markdown_template_file", {
    contents,
    fileName
  });
}

export async function deleteNativeMarkdownTemplateFile(fileName: string) {
  await invokeNative("delete_markdown_template_file", {
    fileName
  });
}

function bytesToBase64(bytes: number[]) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
}

export async function readNativeMarkdownImageFile({
  documentPath,
  src
}: ReadNativeMarkdownImageInput): Promise<NativeMarkdownImageFile> {
  const image = await invokeNative<MarkdownImageFileResponse>("read_markdown_image_file", {
    documentPath,
    src
  });

  return {
    dataUrl: `data:${image.mimeType};base64,${bytesToBase64(image.bytes)}`,
    mimeType: image.mimeType,
    path: image.path,
    src
  };
}

export type ListNativeMarkdownFilesOptions = {
  managedAttachmentFolder?: string | null;
};

export type LoadNativeMarkdownFilesForPathOptions = ListNativeMarkdownFilesOptions & {
  onBatch?: (files: NativeMarkdownFolderFile[]) => unknown;
  signal?: AbortSignal | null;
};

export async function listNativeMarkdownFilesForPath(
  path: string,
  options: ListNativeMarkdownFilesOptions = {}
): Promise<NativeMarkdownFolderFile[]> {
  const args: {
    managedAttachmentFolder?: string | null;
    path: string;
  } = { path };
  if (options.managedAttachmentFolder !== undefined) {
    args.managedAttachmentFolder = options.managedAttachmentFolder;
  }
  const files = await invokeNative<MarkdownFolderFileResponse[]>("list_markdown_files_for_path", args);

  return files.map(markdownFolderFileFromResponse);
}

const markdownFileTreeLoadEvent = "markra://markdown-tree-load";
let markdownFileTreeLoadRequestIndex = 0;

function nextMarkdownFileTreeLoadRequestId() {
  markdownFileTreeLoadRequestIndex += 1;
  return `markdown-tree-load-${Date.now()}-${markdownFileTreeLoadRequestIndex}`;
}

function canceledMarkdownFileTreeLoadError() {
  return new Error("Markdown file tree load was canceled.");
}

export async function loadNativeMarkdownFilesForPath(
  path: string,
  options: LoadNativeMarkdownFilesForPathOptions = {}
): Promise<NativeMarkdownFolderFile[]> {
  const requestId = nextMarkdownFileTreeLoadRequestId();
  const allFiles: NativeMarkdownFolderFile[] = [];
  let removeListener: (() => unknown) | null = null;
  let abortHandler: EventListener | null = null;
  let settled = false;

  const cleanup = (cancelNativeLoad: boolean) => {
    const currentRemoveListener = removeListener;
    removeListener = null;
    currentRemoveListener?.();

    if (options.signal && abortHandler) {
      options.signal.removeEventListener("abort", abortHandler);
      abortHandler = null;
    }

    if (cancelNativeLoad) {
      invokeNative("cancel_markdown_files_load", { requestId }).catch(() => {});
    }
  };

  return new Promise<NativeMarkdownFolderFile[]>((resolve, reject) => {
    const fail = (error: unknown, cancelNativeLoad = true) => {
      if (settled) return;

      settled = true;
      cleanup(cancelNativeLoad);
      reject(error);
    };
    const complete = () => {
      if (settled) return;

      settled = true;
      cleanup(false);
      resolve(allFiles);
    };

    abortHandler = () => fail(canceledMarkdownFileTreeLoadError());

    if (options.signal?.aborted) {
      fail(canceledMarkdownFileTreeLoadError());
      return;
    }

    options.signal?.addEventListener("abort", abortHandler);

    listenNativeEvent<MarkdownFileTreeLoadEventResponse>(markdownFileTreeLoadEvent, (event) => {
      const payload = event.payload;
      if (payload.requestId !== requestId) return;

      if (payload.error) {
        fail(new Error(payload.error), false);
        return;
      }

      const batchFiles = payload.files?.map(markdownFolderFileFromResponse) ?? [];
      if (batchFiles.length > 0) {
        allFiles.push(...batchFiles);
        options.onBatch?.(batchFiles);
      }

      if (payload.done) complete();
    }).then((listenerCleanup) => {
      if (settled) {
        listenerCleanup();
        return;
      }

      removeListener = listenerCleanup;
      const args: {
        managedAttachmentFolder?: string | null;
        path: string;
        requestId: string;
      } = { path, requestId };
      if (options.managedAttachmentFolder !== undefined) {
        args.managedAttachmentFolder = options.managedAttachmentFolder;
      }

      invokeNative("load_markdown_files_for_path", args).catch((error: unknown) => {
        fail(error);
      });
    }).catch((error: unknown) => {
      fail(error, false);
    });
  });
}

export async function searchNativeMarkdownFilesForPath({
  caseSensitive,
  currentDocument,
  maxMatches,
  maxMatchesPerFile,
  path,
  query
}: WorkspaceSearchRequest): Promise<WorkspaceSearchResponse> {
  const search = await invokeNative<MarkdownWorkspaceSearchResponse>("search_markdown_files_for_path", {
    caseSensitive: caseSensitive === true,
    currentDocumentContent: currentDocument?.content,
    currentDocumentPath: currentDocument?.path,
    maxMatches,
    maxMatchesPerFile,
    path,
    query
  });

  return {
    ...search,
    results: search.results.map((result) => ({
      ...result,
      file: markdownFolderFileFromResponse(result.file)
    }))
  };
}

function markdownFolderFileFromResponse(file: MarkdownFolderFileResponse): NativeMarkdownFolderFile {
  const mappedFile: NativeMarkdownFolderFile = {
    path: file.path,
    name: fileNameFromPath(file.path),
    relativePath: file.relativePath
  };

  if (typeof file.createdAt === "number") {
    mappedFile.createdAt = file.createdAt;
  }

  if (typeof file.modifiedAt === "number") {
    mappedFile.modifiedAt = file.modifiedAt;
  }

  if (file.kind === "asset" || (!file.kind && isMarkdownTreeAssetPath(file.relativePath))) {
    mappedFile.kind = "asset";
  } else if (file.kind === "attachment") {
    mappedFile.kind = "attachment";
  } else if (file.kind === "folder" || (!file.kind && !isMarkdownTreeFilePath(file.relativePath))) {
    mappedFile.kind = "folder";
  }

  return mappedFile;
}

export async function createNativeMarkdownTreeFile(
  rootPath: string,
  fileName: string,
  optionsOrParentPath: CreateNativeMarkdownTreeFileOptions | string | null = null
): Promise<NativeMarkdownFolderFile> {
  const options = typeof optionsOrParentPath === "object" && optionsOrParentPath !== null
    ? optionsOrParentPath
    : { parentPath: optionsOrParentPath };
  const args: {
    contents?: string;
    fileName: string;
    parentPath: string | null;
    rootPath: string;
  } = {
    fileName,
    parentPath: normalizeNativeParentPath(options.parentPath),
    rootPath
  };

  if (typeof options.contents === "string") {
    args.contents = options.contents;
  }

  const file = await invokeNative<MarkdownFolderFileResponse>("create_markdown_tree_file", args);

  return markdownFolderFileFromResponse(file);
}

export async function createNativeMarkdownTreeFolder(
  rootPath: string,
  folderName: string,
  parentPath: string | null = null
): Promise<NativeMarkdownFolderFile> {
  const folder = await invokeNative<MarkdownFolderFileResponse>("create_markdown_tree_folder", {
    folderName,
    parentPath: normalizeNativeParentPath(parentPath),
    rootPath
  });

  return markdownFolderFileFromResponse(folder);
}

export async function renameNativeMarkdownTreeFile(
  rootPath: string,
  path: string,
  fileName: string
): Promise<NativeMarkdownFolderFile> {
  const file = await invokeNative<MarkdownFolderFileResponse>("rename_markdown_tree_file", {
    fileName,
    path,
    rootPath
  });

  return markdownFolderFileFromResponse(file);
}

export async function moveNativeMarkdownTreeFile(
  rootPath: string,
  path: string,
  targetParentPath: string | null = null
): Promise<NativeMarkdownFolderFile> {
  const file = await invokeNative<MarkdownFolderFileResponse>("move_markdown_tree_file", {
    path,
    rootPath,
    targetParentPath: normalizeNativeParentPath(targetParentPath)
  });

  return markdownFolderFileFromResponse(file);
}

export async function deleteNativeMarkdownTreeFile(rootPath: string, path: string) {
  await invokeNative("delete_markdown_tree_file", {
    path,
    rootPath
  });
}

export async function confirmNativeMarkdownFileDelete(
  fileName: string,
  labels: { cancelLabel: string; message: string; okLabel: string }
) {
  return confirm(labels.message, {
    cancelLabel: labels.cancelLabel,
    kind: "warning",
    okLabel: labels.okLabel,
    title: fileName
  });
}

export async function confirmNativeUnsavedMarkdownDocumentDiscard(
  fileName: string,
  labels: { cancelLabel: string; message: string; okLabel: string }
) {
  return confirm(labels.message, {
    cancelLabel: labels.cancelLabel,
    kind: "warning",
    okLabel: labels.okLabel,
    title: fileName
  });
}

export async function openNativeMarkdownFileInNewWindow(path: string) {
  await invokeNative("open_markdown_file_in_new_window", { path });
}

export async function openNativeMarkdownFolderInNewWindow(path: string) {
  await invokeNative("open_markdown_folder_in_new_window", { path });
}

export async function openNativeContainingFolder(path: string) {
  await invokeNative("open_containing_folder", { path });
}

export async function openNativeMarkdownAttachment({
  documentPath = null,
  rootPath,
  src
}: OpenNativeMarkdownAttachmentInput) {
  if (!rootPath) throw new Error("Markdown attachment root path is required.");

  await invokeNative("open_markdown_attachment", {
    documentPath,
    rootPath,
    src
  });
}

function pickerTitleOption(labels: NativeMarkdownPickerLabels | undefined) {
  const title = labels?.title.trim();
  return title ? { title } : {};
}

export async function openNativeMarkdownFile(labels?: NativeMarkdownPickerLabels): Promise<NativeMarkdownFile | null> {
  // The native dialog gives us a real filesystem path; Rust owns the actual disk read.
  const selectedPath = await open({
    multiple: false,
    fileAccessMode: "scoped",
    filters: markdownFilters,
    ...pickerTitleOption(labels)
  });

  if (!selectedPath || Array.isArray(selectedPath)) return null;

  return readNativeMarkdownFile(selectedPath);
}

function normalizeSelectedPaths(paths: string | string[] | null) {
  if (!paths) return [];

  return Array.isArray(paths) ? paths : [paths];
}

export async function openNativeLocalImages(labels?: NativeMarkdownPickerLabels): Promise<File[]> {
  const selectedPaths = normalizeSelectedPaths(await open({
    multiple: true,
    fileAccessMode: "scoped",
    filters: imageFilters,
    ...pickerTitleOption(labels)
  }));

  const images: File[] = [];
  for (const path of selectedPaths) {
    images.push(await readNativeLocalImageFile(path));
  }

  return images;
}

export async function readNativeLocalImageFile(path: string): Promise<File> {
  const image = await invokeNative<MarkdownImageFileResponse>("read_local_image_file", {
    path
  });

  return new File([new Uint8Array(image.bytes)], fileNameFromPath(image.path), {
    type: image.mimeType
  });
}

export async function openNativeMarkdownPath(labels?: NativeMarkdownPickerLabels): Promise<NativeMarkdownOpenTarget | null> {
  const title = labels?.title.trim();
  const target = title
    ? await invokeNative<MarkdownOpenPathResponse | null>("open_markdown_path", { title })
    : await invokeNative<MarkdownOpenPathResponse | null>("open_markdown_path");
  if (!target) return null;

  if (target.kind === "folder") {
    return {
      kind: "folder",
      folder: {
        path: target.path,
        name: fileNameFromPath(target.path)
      }
    };
  }

  return {
    kind: "file",
    file: await readNativeMarkdownFile(target.path)
  };
}

export async function openNativeSettingsFile(labels?: NativeMarkdownPickerLabels): Promise<NativeSettingsFile | null> {
  const selectedPath = await open({
    multiple: false,
    fileAccessMode: "scoped",
    filters: settingsFilters,
    ...pickerTitleOption(labels)
  });

  if (!selectedPath || Array.isArray(selectedPath)) return null;

  const file = await invokeNative<TextFileResponse>("read_text_file", {
    path: selectedPath
  });

  return {
    path: file.path,
    name: fileNameFromPath(file.path),
    content: file.contents
  };
}

function droppedTargetFromResponse(target: MarkdownOpenPathResponse): NativeMarkdownDroppedTarget {
  return {
    kind: target.kind,
    path: target.path,
    name: fileNameFromPath(target.path)
  };
}

export async function resolveNativeMarkdownPath(path: string): Promise<NativeMarkdownDroppedTarget> {
  const target = await invokeNative<MarkdownOpenPathResponse>("resolve_markdown_path", {
    path
  });

  return droppedTargetFromResponse(target);
}

function imageDropTargetFromPath(path: string, point?: NativeMarkdownDropPoint): NativeMarkdownDroppedTarget | null {
  const extension = path.split(/[\\/]/u).pop()?.split(".").pop()?.toLocaleLowerCase();
  if (!extension || !imageFileExtensions.has(extension)) return null;

  return {
    kind: "image",
    name: fileNameFromPath(path),
    path,
    ...(point ? { point } : {})
  };
}

function nativeDropPointFromPosition(position: unknown): NativeMarkdownDropPoint | undefined {
  if (!position || typeof position !== "object") return undefined;
  const { x, y } = position as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number") return undefined;

  const scaleFactor = typeof window.devicePixelRatio === "number" && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;

  return {
    left: x / scaleFactor,
    top: y / scaleFactor
  };
}

async function firstDroppedMarkdownTarget(paths: string[], point?: NativeMarkdownDropPoint) {
  for (const path of paths) {
    try {
      return droppedTargetFromResponse(await invokeNative<MarkdownOpenPathResponse>("resolve_markdown_path", {
        path
      }));
    } catch {
      const imageTarget = imageDropTargetFromPath(path, point);
      if (imageTarget) return imageTarget;
      // Keep looking; drag payloads can contain unsupported files.
    }
  }

  return null;
}

export async function openNativeMarkdownFolder(labels?: NativeMarkdownPickerLabels): Promise<NativeMarkdownFolder | null> {
  const selectedPath = await open({
    multiple: false,
    directory: true,
    recursive: true,
    fileAccessMode: "scoped",
    ...pickerTitleOption(labels)
  });

  if (!selectedPath || Array.isArray(selectedPath)) return null;

  return {
    path: selectedPath,
    name: fileNameFromPath(selectedPath)
  };
}

export async function saveNativeMarkdownFile({
  defaultDirectory,
  historyCursorId,
  path,
  skipHistorySnapshot,
  suggestedName,
  contents
}: SaveNativeMarkdownFileInput): Promise<SavedNativeMarkdownFile | null> {
  debug(() => ["[markra-history] native save markdown start", {
    contentsChars: contents.length,
    path,
    skipHistorySnapshot: skipHistorySnapshot === true,
    suggestedName
  }]);
  // Existing files save in place. Untitled documents first ask macOS for a target path.
  const targetPath =
    path ??
    (await save({
      defaultPath: nativeDefaultSavePath(defaultDirectory, suggestedName),
      filters: markdownFilters
    }));

  if (!targetPath) {
    debug(() => ["[markra-history] native save markdown canceled", {
      suggestedName
    }]);
    return null;
  }

  const writeArgs: {
    contents: string;
    historyCursorId?: string;
    path: string;
    skipHistorySnapshot?: boolean;
  } = {
    path: targetPath,
    contents
  };
  if (historyCursorId?.trim()) {
    writeArgs.historyCursorId = historyCursorId;
  }
  if (skipHistorySnapshot === true) {
    writeArgs.skipHistorySnapshot = true;
  }

  await invokeNative("write_markdown_file", writeArgs);
  debug(() => ["[markra-history] native save markdown success", {
    skipHistorySnapshot: skipHistorySnapshot === true,
    targetPath
  }]);

  return {
    path: targetPath,
    name: fileNameFromPath(targetPath)
  };
}

export async function saveNativeHtmlFile({
  suggestedName,
  contents
}: SaveNativeHtmlFileInput): Promise<SavedNativeHtmlFile | null> {
  const targetPath = await save({
    defaultPath: suggestedName,
    filters: htmlFilters
  });

  if (!targetPath) return null;

  await invokeNative("write_markdown_file", {
    path: targetPath,
    contents
  });

  return {
    path: targetPath,
    name: fileNameFromPath(targetPath)
  };
}

export async function saveNativePdfFile({
  suggestedName,
  contents
}: SaveNativePdfFileInput): Promise<SavedNativePdfFile | null> {
  const targetPath = await save({
    defaultPath: suggestedName,
    filters: pdfFilters
  });

  if (!targetPath) return null;

  await invokeNative("export_pdf_file", {
    path: targetPath,
    html: contents
  });

  return {
    path: targetPath,
    name: fileNameFromPath(targetPath)
  };
}

export async function saveNativeSettingsFile({
  suggestedName,
  contents
}: SaveNativeSettingsFileInput): Promise<SavedNativeSettingsFile | null> {
  const targetPath = await save({
    defaultPath: suggestedName,
    filters: settingsFilters
  });

  if (!targetPath) return null;

  await invokeNative("write_text_file", {
    path: targetPath,
    contents
  });

  return {
    path: targetPath,
    name: fileNameFromPath(targetPath)
  };
}

export async function saveNativePandocFile({
  documentPath,
  format,
  markdown,
  pandocArgs,
  pandocPath,
  suggestedName
}: SaveNativePandocFileInput): Promise<SavedNativePandocFile | null> {
  await invokeNative("check_pandoc_available", {
    pandocPath
  });

  const targetPath = await save({
    defaultPath: suggestedName,
    filters: pandocExportFilters[format]
  });

  if (!targetPath) return null;

  await invokeNative("export_pandoc_file", {
    documentPath,
    format,
    markdown,
    pandocArgs,
    pandocPath,
    path: targetPath
  });

  return {
    path: targetPath,
    name: fileNameFromPath(targetPath)
  };
}

export async function detectNativePandocPath(): Promise<string | null> {
  const path = await invokeNative<string | null>("detect_pandoc_path");
  const trimmedPath = typeof path === "string" ? path.trim() : "";

  return trimmedPath || null;
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

type NativeFilePath = File & {
  path?: unknown;
};

function nativeFilePath(file: File) {
  const path = (file as NativeFilePath).path;
  return typeof path === "string" && path.trim().length > 0 ? path.trim() : null;
}

function encodeFileUrlPathSegments(segments: string[]) {
  return segments.map(encodeMarkdownUrlSegment).join("/");
}

function fileUrlFromNativePath(path: string) {
  const normalized = path.trim().replace(/\\/gu, "/");
  if (!normalized) throw new Error("Clipboard file path is unavailable.");

  if (normalized.startsWith("//")) {
    const [host, ...segments] = normalized.slice(2).split("/");
    if (!host) throw new Error("Clipboard file path is unavailable.");

    return `file://${host}/${encodeFileUrlPathSegments(segments)}`;
  }

  if (/^[a-zA-Z]:\//u.test(normalized)) {
    const [drive, ...segments] = normalized.split("/");
    return `file:///${drive}/${encodeFileUrlPathSegments(segments)}`;
  }

  if (normalized.startsWith("/")) {
    const [, ...segments] = normalized.split("/");
    return `file:///${encodeFileUrlPathSegments(segments)}`;
  }

  throw new Error("Clipboard file path must be absolute.");
}

function fileUrlFromNativeFile(file: File) {
  const path = nativeFilePath(file);
  if (!path) throw new Error("Clipboard file path is unavailable.");

  return fileUrlFromNativePath(path);
}

async function requestWithNetwork<TRequest extends Record<string, unknown>>(request: TRequest) {
  const network = await networkSettingsForNativeRequest();

  return network ? { ...request, network } : request;
}

export async function saveNativeClipboardImage({
  copyToStorage = true,
  documentPath,
  fileName,
  folder,
  image
}: SaveNativeClipboardImageInput): Promise<SavedNativeClipboardImage> {
  if (!copyToStorage) {
    return {
      alt: imageAltFromFileName(image.name),
      src: fileUrlFromNativeFile(image)
    };
  }

  if (!documentPath) throw new Error("Current document must be a saved Markdown file.");

  const bytes = Array.from(new Uint8Array(await image.arrayBuffer()));
  const savedImage = await invokeNative<ClipboardImageFileResponse>("save_clipboard_image", {
    bytes,
    documentPath,
    fileName,
    folder,
    mimeType: image.type
  });

  return {
    alt: imageAltFromFileName(image.name),
    src: encodeMarkdownRelativePath(savedImage.relativePath)
  };
}

export async function saveNativeClipboardAttachment({
  attachment,
  copyToStorage = true,
  documentPath,
  folder
}: SaveNativeClipboardAttachmentInput): Promise<SavedNativeClipboardAttachment> {
  if (!copyToStorage) {
    return {
      label: attachment.name.trim() || fileNameFromPath(nativeFilePath(attachment) ?? "") || "attachment",
      src: fileUrlFromNativeFile(attachment)
    };
  }

  if (!documentPath) throw new Error("Current document must be a saved Markdown file.");

  const bytes = Array.from(new Uint8Array(await attachment.arrayBuffer()));
  const savedAttachment = await invokeNative<ClipboardImageFileResponse>("save_clipboard_attachment", {
    bytes,
    documentPath,
    fileName: attachment.name,
    folder
  });

  return {
    label: attachment.name.trim() || "attachment",
    src: encodeMarkdownRelativePath(savedAttachment.relativePath)
  };
}

export async function downloadNativeWebImage({ src }: DownloadNativeWebImageInput): Promise<File> {
  const downloadedImage = await invokeNative<WebImageDownloadResponse>("download_web_image", {
    request: await requestWithNetwork({
      url: src
    })
  });

  return new File([new Uint8Array(downloadedImage.bytes)], downloadedImage.fileName, {
    type: downloadedImage.mimeType
  });
}

export async function uploadNativeWebDavImage({
  fileName,
  image,
  settings
}: UploadNativeWebDavImageInput): Promise<SavedNativeClipboardImage> {
  const bytes = Array.from(new Uint8Array(await image.arrayBuffer()));
  const uploadedImage = await invokeNative<RemoteImageUploadResponse>("upload_webdav_image", {
    request: await requestWithNetwork({
      bytes,
      fileName,
      mimeType: image.type,
      password: settings.password,
      publicBaseUrl: settings.publicBaseUrl,
      serverUrl: settings.serverUrl,
      uploadPath: settings.uploadPath,
      username: settings.username
    })
  });

  return {
    alt: imageAltFromFileName(image.name),
    src: uploadedImage.url
  };
}

export async function uploadNativePicGoImage({
  fileName,
  image,
  settings
}: UploadNativePicGoImageInput): Promise<SavedNativeClipboardImage> {
  const bytes = Array.from(new Uint8Array(await image.arrayBuffer()));
  const uploadedImage = await invokeNative<RemoteImageUploadResponse>("upload_picgo_image", {
    request: await requestWithNetwork({
      bytes,
      fileName,
      mimeType: image.type,
      secret: settings.secret,
      serverUrl: settings.serverUrl
    })
  });

  return {
    alt: imageAltFromFileName(image.name),
    src: uploadedImage.url
  };
}

export async function uploadNativeS3Image({
  fileName,
  image,
  settings
}: UploadNativeS3ImageInput): Promise<SavedNativeClipboardImage> {
  const bytes = Array.from(new Uint8Array(await image.arrayBuffer()));
  const uploadedImage = await invokeNative<RemoteImageUploadResponse>("upload_s3_image", {
    request: await requestWithNetwork({
      accessKeyId: settings.accessKeyId,
      bucket: settings.bucket,
      bytes,
      endpointUrl: settings.endpointUrl,
      fileName,
      mimeType: image.type,
      publicBaseUrl: settings.publicBaseUrl,
      region: settings.region.trim() || "us-east-1",
      secretAccessKey: settings.secretAccessKey,
      uploadPath: settings.uploadPath
    })
  });

  return {
    alt: imageAltFromFileName(image.name),
    src: uploadedImage.url
  };
}

export async function backupNativeMarkdownFolder({
  sourcePath,
  targetPath
}: BackupNativeMarkdownFolderInput): Promise<NativeMarkdownBackupSummary> {
  return invokeNative<NativeMarkdownBackupResponse>("backup_markdown_folder", {
    sourcePath,
    targetPath
  });
}

export async function syncNativeMarkdownFolder({
  provider,
  sourcePath,
  webdav
}: SyncNativeMarkdownFolderInput): Promise<NativeMarkdownSyncSummary> {
  if (provider !== "webdav") {
    throw new Error("Only WebDAV sync is supported.");
  }

  return invokeNative<NativeMarkdownSyncResponse>("sync_webdav_markdown_folder", {
    request: await requestWithNetwork({
      password: webdav.password,
      remotePath: webdav.remotePath,
      serverUrl: webdav.serverUrl,
      sourcePath,
      username: webdav.username
    })
  });
}

export async function watchNativeMarkdownFile(
  path: string,
  onChange: NativeMarkdownFileChangeHandler,
  onTreeChange?: NativeMarkdownTreeChangeHandler
) {
  debug(() => ["[markra-history] native watch subscribe", {
    path
  }]);
  const unlistenFile = await listenNativeEvent<MarkdownFileChangedPayload>(markdownFileChangedEvent, (event) => {
    if (event.payload.path !== path) return;
    debug(() => ["[markra-history] native watch file event", {
      path: event.payload.path
    }]);
    onChange(event.payload.path);
  });
  let unlistenTree: (() => unknown) | null = null;

  try {
    if (onTreeChange) {
      const rootPath = parentPathFromPath(path);
      unlistenTree = await listenNativeEvent<MarkdownTreeChangedPayload>(markdownTreeChangedEvent, (event) => {
        if (event.payload.rootPath !== rootPath) return;
        debug(() => ["[markra-history] native watch tree event", {
          path: event.payload.path,
          rootPath: event.payload.rootPath
        }]);
        onTreeChange(event.payload.path);
      });
    }

    await invokeNative("watch_markdown_file", { path });
    debug(() => ["[markra-history] native watch ready", {
      path
    }]);
  } catch (error) {
    debug(() => ["[markra-history] native watch failed", {
      error: error instanceof Error ? error.message : String(error),
      path
    }]);
    unlistenFile();
    unlistenTree?.();
    throw error;
  }

  return () => {
    debug(() => ["[markra-history] native watch unsubscribe", {
      path
    }]);
    unlistenFile();
    unlistenTree?.();
    invokeNative("unwatch_markdown_file", { path });
  };
}

export async function watchNativeMarkdownTree(
  path: string,
  onTreeChange: NativeMarkdownTreeChangeHandler
) {
  const rootPath = treeRootPathFromPath(path);
  const unlistenTree = await listenNativeEvent<MarkdownTreeChangedPayload>(markdownTreeChangedEvent, (event) => {
    if (event.payload.rootPath !== rootPath) return;
    onTreeChange(event.payload.path);
  });

  try {
    await invokeNative("watch_markdown_tree", { rootPath: path });
  } catch (error) {
    unlistenTree();
    throw error;
  }

  return () => {
    unlistenTree();
    invokeNative("unwatch_markdown_tree", { rootPath: path });
  };
}

export async function installNativeMarkdownFileDrop(onDrop: NativeMarkdownFileDropHandler) {
  try {
    return safeNativeEventCleanup(await getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const point = nativeDropPointFromPosition(event.payload.position);

      firstDroppedMarkdownTarget(event.payload.paths, point).then((target) => {
        if (!target) return;

        onDrop(target);
      }).catch(() => {});
    }));
  } catch {
    return () => {};
  }
}
