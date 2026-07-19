import { rebaseMarkdownLocalLinks } from "@markra/markdown";
import { parentPathFromPath } from "@markra/shared";
import type {
  NativeMarkdownFile,
  NativeMarkdownFolderFile,
  SaveNativeMarkdownFileInput,
  SavedNativeMarkdownFile
} from "./tauri/file";

type MarkdownTreeMoveOperations = {
  dirtyContent?: string | null;
  moveFile: (
    file: NativeMarkdownFolderFile,
    targetParentPath: string | null
  ) => Promise<NativeMarkdownFolderFile | null>;
  readFile: (path: string) => Promise<NativeMarkdownFile>;
  saveFile: (input: SaveNativeMarkdownFileInput) => Promise<SavedNativeMarkdownFile | null>;
};

export type MarkdownTreeMoveDocumentUpdate = {
  content: string;
  dirty: boolean;
};

export type MarkdownTreeMoveResult = {
  document?: MarkdownTreeMoveDocumentUpdate;
  file: NativeMarkdownFolderFile;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function moveMarkdownTreeFileWithLinks(
  file: NativeMarkdownFolderFile,
  targetParentPath: string | null,
  operations: MarkdownTreeMoveOperations
): Promise<MarkdownTreeMoveResult | null> {
  if (file.kind) {
    const movedFile = await operations.moveFile(file, targetParentPath);
    return movedFile ? { file: movedFile } : null;
  }

  const movedFile = await operations.moveFile(file, targetParentPath);
  if (!movedFile) return null;

  try {
    const sourceDirtyContent = operations.dirtyContent;
    let dirtyDocumentUpdate: MarkdownTreeMoveDocumentUpdate | undefined;
    if (sourceDirtyContent !== null && sourceDirtyContent !== undefined) {
      const rebasedDirtyContent = rebaseMarkdownLocalLinks(
        sourceDirtyContent,
        file.relativePath,
        movedFile.relativePath
      );
      if (rebasedDirtyContent !== sourceDirtyContent) {
        dirtyDocumentUpdate = { content: rebasedDirtyContent, dirty: true };
      }
    }
    const movedDiskFile = await operations.readFile(movedFile.path);
    const savedContent = rebaseMarkdownLocalLinks(
      movedDiskFile.content,
      file.relativePath,
      movedFile.relativePath
    );
    if (savedContent !== movedDiskFile.content) {
      const savedFile = await operations.saveFile({
        contents: savedContent,
        path: movedFile.path,
        suggestedName: movedFile.name
      });
      if (!savedFile) throw new Error(`Could not update links in "${movedFile.relativePath}".`);
    }

    if (sourceDirtyContent !== null && sourceDirtyContent !== undefined) {
      // Keep the editor draft separate from the saved file so moving a note never implicitly saves it.
      return {
        ...(dirtyDocumentUpdate ? { document: dirtyDocumentUpdate } : {}),
        file: movedFile
      };
    }

    return {
      ...(savedContent !== movedDiskFile.content
        ? { document: { content: savedContent, dirty: false } }
        : {}),
      file: movedFile
    };
  } catch (updateError) {
    // A moved note with an unwritten rebase is broken, so put the original file back whenever possible.
    try {
      const restoredFile = await operations.moveFile(movedFile, parentPathFromPath(file.path));
      if (!restoredFile) throw new Error("The original file location could not be restored.");
    } catch (rollbackError) {
      throw new Error(
        `${errorMessage(updateError)} The move also could not be rolled back: ${errorMessage(rollbackError)}`,
        { cause: updateError }
      );
    }
    throw updateError;
  }
}
