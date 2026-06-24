import type {
  AgentWorkspaceFile,
  WorkspaceChangePlanOperations
} from "@markra/ai";
import { normalizeWorkspaceRelativePath } from "@markra/ai";
import { parentPathFromPath, pathNameFromPath } from "@markra/shared";
import type { NativeMarkdownFolderFile } from "./tauri";

export type WorkspacePlanNativeOperations = {
  createFile: (
    fileName: string,
    parentPath: string | null,
    contents: string
  ) => Promise<NativeMarkdownFolderFile | null> | NativeMarkdownFolderFile | null;
  createFolder: (
    folderName: string,
    parentPath: string | null
  ) => Promise<NativeMarkdownFolderFile | null> | NativeMarkdownFolderFile | null;
  moveFile: (
    file: NativeMarkdownFolderFile,
    targetParentPath: string | null
  ) => Promise<NativeMarkdownFolderFile | null> | NativeMarkdownFolderFile | null;
  readFile: (path: string) => Promise<string> | string;
  renameFile: (
    file: NativeMarkdownFolderFile,
    fileName: string
  ) => Promise<NativeMarkdownFolderFile | null> | NativeMarkdownFolderFile | null;
  workspaceFiles: readonly AgentWorkspaceFile[];
  writeFile: (file: NativeMarkdownFolderFile, content: string) => Promise<unknown> | unknown;
};

export function createWorkspaceChangePlanOperations(
  options: WorkspacePlanNativeOperations
): WorkspaceChangePlanOperations {
  const foldersByRelativePath = new Map<string, NativeMarkdownFolderFile>();

  options.workspaceFiles.forEach((file) => {
    if (file.kind !== "folder") return;
    foldersByRelativePath.set(normalizeWorkspaceRelativePath(file.relativePath), nativeFileFromWorkspaceFile(file));
  });

  const ensureParentPath = async (relativePath: string) => {
    const parentRelativePath = parentPathFromPath(normalizeWorkspaceRelativePath(relativePath));
    if (!parentRelativePath) return null;

    return ensureFolderPath(parentRelativePath, foldersByRelativePath, options);
  };

  return {
    createFile: async (relativePath, content) => {
      const parentPath = await ensureParentPath(relativePath);
      const fileName = pathNameFromPath(relativePath);
      const createdFile = await options.createFile(fileName, parentPath, content);
      if (!createdFile) {
        throw new Error(`Workspace change could not create "${relativePath}".`);
      }
    },
    moveFile: async (file, toRelativePath) => {
      const targetParentPath = await ensureParentPath(toRelativePath);
      const targetFileName = pathNameFromPath(toRelativePath);
      const currentParentRelativePath = parentPathFromPath(normalizeWorkspaceRelativePath(file.relativePath));
      const targetParentRelativePath = parentPathFromPath(normalizeWorkspaceRelativePath(toRelativePath));
      const nativeFile = nativeFileFromWorkspaceFile(file);
      const parentChanged = (currentParentRelativePath ?? "") !== (targetParentRelativePath ?? "");
      const movedFile = parentChanged
        ? await options.moveFile(nativeFile, targetParentPath)
        : nativeFile;
      if (!movedFile) {
        throw new Error(`Workspace change could not move "${file.relativePath}".`);
      }

      if (movedFile.name === targetFileName) return;

      const renamedFile = await options.renameFile(movedFile, targetFileName);
      if (!renamedFile) {
        throw new Error(`Workspace change could not rename "${movedFile.relativePath}".`);
      }
    },
    readFile: (file) => options.readFile(file.path),
    writeFile: (file, content) => options.writeFile(nativeFileFromWorkspaceFile(file), content)
  };
}

async function ensureFolderPath(
  relativePath: string,
  foldersByRelativePath: Map<string, NativeMarkdownFolderFile>,
  operations: Pick<WorkspacePlanNativeOperations, "createFolder">
) {
  const segments = normalizeWorkspaceRelativePath(relativePath).split("/").filter(Boolean);
  let currentRelativePath = "";
  let currentParentPath: string | null = null;

  for (const segment of segments) {
    currentRelativePath = currentRelativePath ? `${currentRelativePath}/${segment}` : segment;
    const existingFolder = foldersByRelativePath.get(currentRelativePath);
    if (existingFolder) {
      currentParentPath = existingFolder.path;
      continue;
    }

    const createdFolder = await operations.createFolder(segment, currentParentPath);
    if (!createdFolder) {
      throw new Error(`Workspace change could not create folder "${currentRelativePath}".`);
    }

    const normalizedCreatedPath = normalizeWorkspaceRelativePath(createdFolder.relativePath || currentRelativePath);
    foldersByRelativePath.set(normalizedCreatedPath, createdFolder);
    currentParentPath = createdFolder.path;
  }

  return currentParentPath;
}

function nativeFileFromWorkspaceFile(file: AgentWorkspaceFile): NativeMarkdownFolderFile {
  const nativeFile: NativeMarkdownFolderFile = {
    name: file.name,
    path: file.path,
    relativePath: file.relativePath
  };

  if (file.kind) {
    nativeFile.kind = file.kind;
  }

  return nativeFile;
}
