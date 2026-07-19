import { rebaseMarkdownLocalLinks } from "@markra/markdown";
import { parentPathFromPath } from "@markra/shared";
import type {
  NativeMarkdownFile,
  NativeMarkdownFolderFile,
  SaveNativeMarkdownFileInput,
  SavedNativeMarkdownFile
} from "./tauri/file";

type MarkdownTreeMoveOperations = {
  moveFile: (
    file: NativeMarkdownFolderFile,
    targetParentPath: string | null
  ) => Promise<NativeMarkdownFolderFile | null>;
  readFile: (path: string) => Promise<NativeMarkdownFile>;
  saveFile: (input: SaveNativeMarkdownFileInput) => Promise<SavedNativeMarkdownFile | null>;
};

export type MarkdownTreeMoveResult = {
  content?: string;
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

  const source = await operations.readFile(file.path);
  const movedFile = await operations.moveFile(file, targetParentPath);
  if (!movedFile) return null;

  const content = rebaseMarkdownLocalLinks(source.content, file.relativePath, movedFile.relativePath);
  if (content === source.content) return { file: movedFile };

  try {
    const savedFile = await operations.saveFile({
      contents: content,
      path: movedFile.path,
      suggestedName: movedFile.name
    });
    if (!savedFile) throw new Error(`Could not update links in "${movedFile.relativePath}".`);
  } catch (saveError) {
    // A moved note with an unwritten rebase is broken, so put the original file back whenever possible.
    try {
      const restoredFile = await operations.moveFile(movedFile, parentPathFromPath(file.path));
      if (!restoredFile) throw new Error("The original file location could not be restored.");
    } catch (rollbackError) {
      throw new Error(
        `${errorMessage(saveError)} The move also could not be rolled back: ${errorMessage(rollbackError)}`,
        { cause: saveError }
      );
    }
    throw saveError;
  }

  return { content, file: movedFile };
}
