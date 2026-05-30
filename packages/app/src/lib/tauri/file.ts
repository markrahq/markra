import type {
  PicGoImageUploadSettings,
  S3ImageUploadSettings,
  WebDavImageUploadSettings
} from "../settings/app-settings";
import { getAppRuntime } from "../../runtime";

export type NativeMarkdownFile = {
  path: string;
  name: string;
  content: string;
};

export type NativeMarkdownFolderFile = {
  createdAt?: number;
  kind?: "asset" | "folder";
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
    };

export type SaveNativeMarkdownFileInput = {
  path: string | null;
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

export type SavedNativePandocFile = {
  path: string;
  name: string;
};

export type SaveNativeClipboardImageInput = {
  documentPath: string;
  fileName: string;
  folder: string;
  image: File;
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

export type NativeMarkdownPickerLabels = {
  title: string;
};

export type SavedNativeClipboardImage = {
  alt: string;
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

export function takeNativeOpenedMarkdownPaths() {
  return getAppRuntime().files.takeOpenedMarkdownPaths();
}

export function listenNativeOpenedMarkdownPaths(onPaths: (paths: string[]) => unknown | Promise<unknown>) {
  return getAppRuntime().files.listenOpenedMarkdownPaths(onPaths);
}

export function readNativeMarkdownFile(path: string) {
  return getAppRuntime().files.readMarkdownFile(path);
}

export function readNativeMarkdownTemplateFile(fileName: string) {
  return getAppRuntime().files.readMarkdownTemplateFile(fileName);
}

export function writeNativeMarkdownTemplateFile(fileName: string, contents: string) {
  return getAppRuntime().files.writeMarkdownTemplateFile(fileName, contents);
}

export function deleteNativeMarkdownTemplateFile(fileName: string) {
  return getAppRuntime().files.deleteMarkdownTemplateFile(fileName);
}

export function readNativeMarkdownImageFile(input: ReadNativeMarkdownImageInput) {
  return getAppRuntime().files.readMarkdownImageFile(input);
}

export function listNativeMarkdownFilesForPath(path: string) {
  return getAppRuntime().files.listMarkdownFilesForPath(path);
}

export function createNativeMarkdownTreeFile(
  rootPath: string,
  fileName: string,
  optionsOrParentPath: CreateNativeMarkdownTreeFileOptions | string | null = null
) {
  return getAppRuntime().files.createMarkdownTreeFile(rootPath, fileName, optionsOrParentPath);
}

export function createNativeMarkdownTreeFolder(rootPath: string, folderName: string, parentPath: string | null = null) {
  return getAppRuntime().files.createMarkdownTreeFolder(rootPath, folderName, parentPath);
}

export function renameNativeMarkdownTreeFile(rootPath: string, path: string, fileName: string) {
  return getAppRuntime().files.renameMarkdownTreeFile(rootPath, path, fileName);
}

export function moveNativeMarkdownTreeFile(rootPath: string, path: string, targetParentPath: string | null = null) {
  return getAppRuntime().files.moveMarkdownTreeFile(rootPath, path, targetParentPath);
}

export function deleteNativeMarkdownTreeFile(rootPath: string, path: string) {
  return getAppRuntime().files.deleteMarkdownTreeFile(rootPath, path);
}

export function confirmNativeMarkdownFileDelete(
  fileName: string,
  labels: { cancelLabel: string; message: string; okLabel: string }
) {
  return getAppRuntime().files.confirmMarkdownFileDelete(fileName, labels);
}

export function confirmNativeUnsavedMarkdownDocumentDiscard(
  fileName: string,
  labels: { cancelLabel: string; message: string; okLabel: string }
) {
  return getAppRuntime().files.confirmUnsavedMarkdownDocumentDiscard(fileName, labels);
}

export function openNativeMarkdownFileInNewWindow(path: string) {
  return getAppRuntime().files.openMarkdownFileInNewWindow(path);
}

export function openNativeMarkdownFolderInNewWindow(path: string) {
  return getAppRuntime().files.openMarkdownFolderInNewWindow(path);
}

export function openNativeMarkdownFile(labels?: NativeMarkdownPickerLabels) {
  return getAppRuntime().files.openMarkdownFile(labels);
}

export function openNativeMarkdownPath(labels?: NativeMarkdownPickerLabels) {
  return getAppRuntime().files.openMarkdownPath(labels);
}

export function resolveNativeMarkdownPath(path: string) {
  return getAppRuntime().files.resolveMarkdownPath(path);
}

export function openNativeMarkdownFolder(labels?: NativeMarkdownPickerLabels) {
  return getAppRuntime().files.openMarkdownFolder(labels);
}

export function saveNativeMarkdownFile(input: SaveNativeMarkdownFileInput) {
  return getAppRuntime().files.saveMarkdownFile(input);
}

export function saveNativeHtmlFile(input: SaveNativeHtmlFileInput) {
  return getAppRuntime().files.saveHtmlFile(input);
}

export function saveNativePdfFile(input: SaveNativePdfFileInput) {
  return getAppRuntime().files.savePdfFile(input);
}

export function saveNativePandocFile(input: SaveNativePandocFileInput) {
  return getAppRuntime().files.savePandocFile(input);
}

export function detectNativePandocPath() {
  return getAppRuntime().files.detectPandocPath();
}

export function saveNativeClipboardImage(input: SaveNativeClipboardImageInput) {
  return getAppRuntime().files.saveClipboardImage(input);
}

export function downloadNativeWebImage(input: DownloadNativeWebImageInput) {
  return getAppRuntime().files.downloadWebImage(input);
}

export function uploadNativeWebDavImage(input: UploadNativeWebDavImageInput) {
  return getAppRuntime().files.uploadWebDavImage(input);
}

export function uploadNativePicGoImage(input: UploadNativePicGoImageInput) {
  return getAppRuntime().files.uploadPicGoImage(input);
}

export function uploadNativeS3Image(input: UploadNativeS3ImageInput) {
  return getAppRuntime().files.uploadS3Image(input);
}

export function watchNativeMarkdownFile(
  path: string,
  onChange: NativeMarkdownFileChangeHandler,
  onTreeChange?: NativeMarkdownTreeChangeHandler
) {
  return getAppRuntime().files.watchMarkdownFile(path, onChange, onTreeChange);
}

export function watchNativeMarkdownTree(path: string, onTreeChange: NativeMarkdownTreeChangeHandler) {
  return getAppRuntime().files.watchMarkdownTree(path, onTreeChange);
}

export function installNativeMarkdownFileDrop(onDrop: NativeMarkdownFileDropHandler) {
  return getAppRuntime().files.installMarkdownFileDrop(onDrop);
}
