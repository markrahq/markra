import type {
  PluginOpenTextFileOptions,
  PluginTextFile,
  PluginWorkspace,
  PluginWorkspaceFile,
  PluginWorkspaceListFilesOptions
} from "@markra/plugin-api";
import {
  getAppRuntime,
  type AppFileRuntime,
  type NativeMarkdownFile,
  type NativeMarkdownFolderFile
} from "../../runtime";
import { normalizeComparablePath } from "../path-move";

export type PluginWorkspaceFileRuntime = Pick<
  AppFileRuntime,
  "listMarkdownFilesForPath" | "loadMarkdownFilesForPath" | "openMarkdownFile" | "readMarkdownFile"
>;

export type PluginWorkspaceOptions = {
  files?: PluginWorkspaceFileRuntime;
  rootPath?: string | null;
};

const workspaceUnavailableMessage = "Plugin workspace file access requires an active workspace.";

export function createPluginWorkspace(options: PluginWorkspaceOptions = {}): PluginWorkspace {
  const files = options.files ?? getAppRuntime().files;
  const rootPath = options.rootPath ?? null;

  return {
    async listFiles(listOptions) {
      const activeRootPath = requireActiveWorkspaceRoot(rootPath);
      const nativeFiles = files.loadMarkdownFilesForPath
        ? await files.loadMarkdownFilesForPath(activeRootPath, {})
        : await files.listMarkdownFilesForPath(activeRootPath, {});

      return nativeFiles
        .filter(isPluginWorkspaceFile)
        .filter((file) => matchesExtensionFilter(file, listOptions))
        .map(pluginWorkspaceFileFromNativeFile);
    },
    async openTextFile(openOptions) {
      const file = await files.openMarkdownFile(pickerLabelsFromOpenOptions(openOptions));

      return file ? pluginTextFileFromNativeFile(file) : null;
    },
    async readTextFile(path) {
      const activeRootPath = requireActiveWorkspaceRoot(rootPath);
      if (!isPathInsideRoot(path, activeRootPath)) {
        throw new Error("Plugin workspace file reads are only available inside the active workspace.");
      }

      const file = await files.readMarkdownFile(path);
      return file.content;
    }
  };
}

function requireActiveWorkspaceRoot(rootPath: string | null) {
  const normalizedRootPath = rootPath?.trim();
  if (!normalizedRootPath) throw new Error(workspaceUnavailableMessage);

  return normalizedRootPath;
}

function isPathInsideRoot(path: string, rootPath: string) {
  const normalizedPath = normalizeComparablePath(path);
  const normalizedRootPath = normalizeComparablePath(rootPath);
  if (!normalizedPath || !normalizedRootPath) return false;
  if (normalizedPath === normalizedRootPath) return true;

  const rootWithSeparator = normalizedRootPath.endsWith("/")
    ? normalizedRootPath
    : `${normalizedRootPath}/`;

  return normalizedPath.startsWith(rootWithSeparator);
}

function pickerLabelsFromOpenOptions(options: PluginOpenTextFileOptions | undefined) {
  return options?.title ? { title: options.title } : undefined;
}

function isPluginWorkspaceFile(file: NativeMarkdownFolderFile) {
  return file.kind !== "folder";
}

function matchesExtensionFilter(file: NativeMarkdownFolderFile, options: PluginWorkspaceListFilesOptions | undefined) {
  const extensions = normalizedExtensions(options?.extensions);
  if (extensions.length === 0) return true;

  return extensions.includes(fileExtension(file.name));
}

function normalizedExtensions(extensions: readonly string[] | undefined) {
  return (extensions ?? [])
    .map((extension) => {
      const trimmedExtension = extension.trim().toLowerCase();
      if (!trimmedExtension) return null;

      return trimmedExtension.startsWith(".") ? trimmedExtension : `.${trimmedExtension}`;
    })
    .filter((extension): extension is string => extension !== null);
}

function fileExtension(fileName: string) {
  const extensionIndex = fileName.lastIndexOf(".");

  return extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : "";
}

function pluginTextFileFromNativeFile(file: NativeMarkdownFile): PluginTextFile {
  return {
    content: file.content,
    name: file.name,
    path: file.path,
    ...(typeof file.sizeBytes === "number" ? { sizeBytes: file.sizeBytes } : {})
  };
}

function pluginWorkspaceFileFromNativeFile(file: NativeMarkdownFolderFile): PluginWorkspaceFile {
  return {
    name: file.name,
    path: file.path,
    relativePath: file.relativePath,
    ...(file.kind === "asset" || file.kind === "attachment" ? { kind: file.kind } : {}),
    ...(typeof file.createdAt === "number" ? { createdAt: file.createdAt } : {}),
    ...(typeof file.modifiedAt === "number" ? { modifiedAt: file.modifiedAt } : {}),
    ...(typeof file.sizeBytes === "number" ? { sizeBytes: file.sizeBytes } : {})
  };
}
