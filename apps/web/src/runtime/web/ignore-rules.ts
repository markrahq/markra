import ignore from "ignore";
import type { WebDirectoryHandle } from "./types";

const markraIgnoreFileName = ".markraignore";
const builtInSkippedDirectoryNames = new Set([
  ".codex",
  ".git",
  ".markra-sync",
  ".obsidian",
  "build",
  "dist",
  "node_modules",
  "target"
]);

export type MarkdownIgnoreRules = {
  ignores: (relativePath: string, isDirectory: boolean) => boolean;
};

function normalizeRelativePath(path: string) {
  return path.replace(/\\+/gu, "/").replace(/^\.\/|^\/|\/$/gu, "");
}

async function readMarkraIgnore(root: WebDirectoryHandle) {
  try {
    const handle = await root.getFileHandle?.(markraIgnoreFileName);
    return handle ? await (await handle.getFile()).text() : "";
  } catch {
    // Missing or unreadable control files must not block opening a workspace.
    return "";
  }
}

export async function loadMarkdownIgnoreRules(
  root: WebDirectoryHandle,
  globalIgnoreRules = ""
): Promise<MarkdownIgnoreRules> {
  const matcher = ignore({ ignorecase: false });
  try {
    matcher.add(globalIgnoreRules);
  } catch {
    // Keep any valid rules already parsed and continue with workspace rules.
  }
  try {
    // Workspace rules are appended later so they can override global defaults.
    matcher.add(await readMarkraIgnore(root));
  } catch {
    // Invalid workspace rules fail open so users can still access and repair them.
  }

  return {
    ignores(relativePath, isDirectory) {
      const normalizedPath = normalizeRelativePath(relativePath);
      if (normalizedPath === markraIgnoreFileName) return true;

      const parts = normalizedPath.split("/").filter(Boolean);
      const directoryParts = isDirectory ? parts : parts.slice(0, -1);

      // Built-in exclusions stay authoritative so user negations cannot restore
      // generated or tool-heavy subtrees that Markra deliberately avoids scanning.
      if (directoryParts.some((part) => builtInSkippedDirectoryNames.has(part))) return true;

      return normalizedPath.length > 0 && matcher.ignores(isDirectory ? `${normalizedPath}/` : normalizedPath);
    }
  };
}
