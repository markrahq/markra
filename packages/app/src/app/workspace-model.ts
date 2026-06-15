import { isMarkdownPath, parentPathFromPath, type SearchRange } from "@markra/shared";
import type { AiDiffResult } from "@markra/ai";
import type { MarkdownTabsBarDocumentItem } from "../components/MarkdownTabsBar";
import type { NativeMarkdownFolderFile } from "../lib/tauri";
import type { SelectionAnchor } from "../lib/selection-anchor";
import type { WorkspaceSearchResponse } from "../lib/workspace-search";

const aiResultSignatureSeparator = "\u001f";
const globalSearchRecentQueryLimit = 8;

export const emptyWorkspaceSearchResponse: WorkspaceSearchResponse = {
  results: [],
  searchedFileCount: 0,
  truncated: false,
  unreadableFileCount: 0
};

export type ImageDocumentTab = NativeMarkdownFolderFile & {
  id: string;
};

export function imageDocumentTabId(path: string) {
  return `image:${path}`;
}

export function createImageDocumentTab(file: NativeMarkdownFolderFile): ImageDocumentTab {
  return {
    ...file,
    id: imageDocumentTabId(file.path)
  };
}

export function unsavedMarkdownFileNameFromTreeInput(fileName: string) {
  const trimmedName = fileName.trim();
  if (!trimmedName) return "Untitled.md";
  return /\.(?:md|markdown)$/iu.test(trimmedName) ? trimmedName : `${trimmedName}.md`;
}

export function documentTabAsFolderFile(tab: MarkdownTabsBarDocumentItem): NativeMarkdownFolderFile | null {
  if (!tab.path) return null;

  return {
    ...(tab.displayKind === "image" ? { kind: "asset" as const } : {}),
    name: tab.name || "Untitled.md",
    path: tab.path,
    relativePath: tab.path
  };
}

export function defaultSaveDirectoryFromFileTree(sourcePath: string | null) {
  const trimmedSourcePath = sourcePath?.trim();
  if (!trimmedSourcePath) return null;
  if (!isMarkdownPath(trimmedSourcePath)) return trimmedSourcePath;

  return parentPathFromPath(trimmedSourcePath);
}

export function aiResultSignature(result: AiDiffResult) {
  if (result.type === "error") return `error${aiResultSignatureSeparator}${result.message}`;

  return [
    result.type,
    result.from,
    result.to,
    result.original,
    result.replacement
  ].join(aiResultSignatureSeparator);
}

export function aiPreviewActionKey(result: AiDiffResult, previewId?: string) {
  return previewId ? `preview${aiResultSignatureSeparator}${previewId}` : `result${aiResultSignatureSeparator}${aiResultSignature(result)}`;
}

export function selectionAnchorsEqual(left: SelectionAnchor | null, right: SelectionAnchor | null) {
  if (left === right) return true;
  if (!left || !right) return false;

  return left.bottom === right.bottom
    && left.left === right.left
    && left.right === right.right
    && left.top === right.top;
}

export function replaceTextRange(content: string, range: SearchRange, replacement: string) {
  return `${content.slice(0, range.from)}${replacement}${content.slice(range.to)}`;
}

export function replaceTextRanges(content: string, ranges: SearchRange[], replacement: string) {
  return [...ranges]
    .sort((left, right) => right.from - left.from)
    .reduce((nextContent, range) => replaceTextRange(nextContent, range, replacement), content);
}

export function restoreElementScrollTop(element: HTMLElement, scrollTop: number) {
  try {
    element.scrollTop = scrollTop;
  } catch {
    // Non-browser DOM doubles can expose scrollTop as read-only.
  }
}

export function nextGlobalSearchRecentQueries(current: string[], query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return current;

  const normalizedQueryKey = normalizedQuery.toLowerCase();
  const nextQueries = [
    normalizedQuery,
    ...current.filter((currentQuery) => currentQuery.toLowerCase() !== normalizedQueryKey)
  ].slice(0, globalSearchRecentQueryLimit);

  return current.length === nextQueries.length
    && current.every((currentQuery, index) => currentQuery === nextQueries[index])
    ? current
    : nextQueries;
}
