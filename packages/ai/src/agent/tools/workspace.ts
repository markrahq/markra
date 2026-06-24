import type { AgentWorkspaceFile } from "../read-only-tools";
import type { ReadWorkspaceFileArgs } from "./params";

const workspaceFileReadMaxChars = 24_000;
const markdownDocumentExtensionPattern = /\.(md|markdown)$/iu;

export function truncateWorkspaceFileContent(content: string) {
  if (content.length <= workspaceFileReadMaxChars) {
    return {
      text: content,
      truncated: false
    };
  }

  return {
    text: [
      content.slice(0, workspaceFileReadMaxChars),
      "",
      `[Truncated after ${workspaceFileReadMaxChars} characters.]`
    ].join("\n"),
    truncated: true
  };
}

export function resolveWorkspaceFile(
  workspaceFiles: AgentWorkspaceFile[],
  args: ReadWorkspaceFileArgs
) {
  const requestedRelativePath = args.relativePath?.trim();
  const requestedPath = args.path?.trim();

  if (!requestedRelativePath && !requestedPath) return null;

  return workspaceMarkdownFiles(workspaceFiles).find((file) => {
    if (requestedRelativePath) return file.relativePath === requestedRelativePath;

    return file.path === requestedPath || file.relativePath === requestedPath;
  }) ?? null;
}

export function isWorkspaceMarkdownFile(file: AgentWorkspaceFile) {
  return file.kind !== "asset" && file.kind !== "attachment" && file.kind !== "folder" && (
    markdownDocumentExtensionPattern.test(file.name) ||
    markdownDocumentExtensionPattern.test(file.relativePath)
  );
}

export function workspaceMarkdownFiles(workspaceFiles: readonly AgentWorkspaceFile[]) {
  return workspaceFiles.filter(isWorkspaceMarkdownFile);
}
