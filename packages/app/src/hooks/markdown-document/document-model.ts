import type {
  StoredWorkspaceDraftTab,
  StoredWorkspaceWindow
} from "../../lib/settings/app-settings";
import { normalizeMovedPath } from "../../lib/path-move";
import { pathNameFromPath, type DocumentState } from "@markra/shared";

export type MarkdownDocumentTab = DocumentState & {
  id: string;
};

export function createInitialDocumentState(): DocumentState {
  return {
    path: null,
    name: "Untitled.md",
    content: "",
    dirty: false,
    open: true,
    revision: 0
  };
}

export function blankDocumentName(name: string | null | undefined) {
  const trimmedName = name?.trim();
  return trimmedName ? trimmedName : "Untitled.md";
}

export function createDocumentTab(document: DocumentState, id: string): MarkdownDocumentTab {
  return {
    ...document,
    id
  };
}

export function documentFromTab(tab: MarkdownDocumentTab): DocumentState {
  return {
    path: tab.path,
    name: tab.name,
    content: tab.content,
    sizeBytes: tab.sizeBytes,
    dirty: tab.dirty,
    open: tab.open,
    revision: tab.revision
  };
}

export function documentFromDraftTab(draft: StoredWorkspaceDraftTab, revision: number): DocumentState {
  return {
    path: draft.path,
    name: draft.name,
    content: draft.content,
    dirty: true,
    open: true,
    revision
  };
}

export function fileTabId(path: string) {
  return `file:${path}`;
}

export function normalizeOpenFilePaths(paths: readonly (string | null | undefined)[]) {
  const seenPaths = new Set<string>();
  const normalizedPaths: string[] = [];

  paths.forEach((item) => {
    const path = item?.trim();
    if (!path || seenPaths.has(path)) return;

    seenPaths.add(path);
    normalizedPaths.push(path);
  });

  return normalizedPaths;
}

export function openFilePathsFromTabs(tabs: readonly MarkdownDocumentTab[]) {
  return normalizeOpenFilePaths(tabs.map((tab) => tab.open ? tab.path : null));
}

export function restoreFilePathsFromWorkspace(
  openFilePaths: readonly string[],
  filePath: string | null,
  documentTabsEnabled: boolean
) {
  if (!documentTabsEnabled) return filePath ? [filePath] : [];

  const paths = normalizeOpenFilePaths(openFilePaths);
  const activeFilePath = filePath?.trim() ?? "";

  if (activeFilePath && !paths.includes(activeFilePath)) paths.push(activeFilePath);

  return paths;
}

export function activeFilePathFromWindowRestore(window: StoredWorkspaceWindow) {
  return window.filePath ?? window.openFilePaths.at(-1) ?? null;
}

export function activeFilePathFromTabs(tabs: readonly MarkdownDocumentTab[], activeTabId: string | null) {
  return tabs.find((tab) => tab.id === activeTabId)?.path ?? null;
}

export function isPristineUntitledDocument(document: DocumentState) {
  return document.open && document.path === null && document.content === "" && !document.dirty && document.revision === 0;
}

function draftTabFromDocumentTab(tab: MarkdownDocumentTab): StoredWorkspaceDraftTab | null {
  if (!tab.open || !tab.dirty) return null;
  if (tab.path === null && tab.content.trim().length === 0) return null;

  return {
    content: tab.content,
    id: tab.id,
    name: tab.name || (tab.path ? pathNameFromPath(tab.path) : "Untitled.md"),
    path: tab.path
  };
}

export function draftWorkspacePatchFromTabs(tabs: readonly MarkdownDocumentTab[], activeTabId: string | null) {
  const draftTabs = tabs.flatMap((tab) => {
    const draft = draftTabFromDocumentTab(tab);
    return draft ? [draft] : [];
  });
  const activeDraftId = activeTabId && draftTabs.some((draft) => draft.id === activeTabId)
    ? activeTabId
    : null;

  return {
    activeDraftId,
    draftTabs
  };
}

function normalizeComparableMarkdownHeadings(content: string) {
  const lines = content.replace(/\r\n?/gu, "\n").split("\n");
  const normalized: string[] = [];
  let fencedMarker: "`" | "~" | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1]!.startsWith("~") ? "~" : "`";
      if (!fencedMarker) {
        fencedMarker = marker;
      } else if (fencedMarker === marker) {
        fencedMarker = null;
      }

      normalized.push(line);
      continue;
    }

    if (!fencedMarker) {
      const atxHeadingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u);
      if (atxHeadingMatch) {
        normalized.push(`${atxHeadingMatch[1]} ${atxHeadingMatch[2]!.trim()}`);
        continue;
      }

      const setextHeadingMatch = line.match(/^\s*(=+|-+)\s*$/u);
      const previousLine = normalized.at(-1);
      if (setextHeadingMatch && previousLine?.trim()) {
        const level = setextHeadingMatch[1]!.startsWith("=") ? 1 : 2;
        normalized[normalized.length - 1] = `${"#".repeat(level)} ${previousLine.trim()}`;
        continue;
      }
    }

    normalized.push(line);
  }

  return normalized.join("\n");
}

function comparableMarkdown(content: string) {
  return normalizeComparableMarkdownHeadings(content)
    .replace(/[ \t]+$/gmu, "")
    .trim();
}

export function isEquivalentEditorMarkdown(left: string, right: string) {
  return comparableMarkdown(left) === comparableMarkdown(right);
}

export function isDeletedDocumentPath(documentPath: string, deletedPath: string) {
  const normalizedDocumentPath = normalizeMovedPath(documentPath);
  const normalizedDeletedPath = normalizeMovedPath(deletedPath);

  return normalizedDocumentPath === normalizedDeletedPath || normalizedDocumentPath.startsWith(`${normalizedDeletedPath}/`);
}

export function defaultSaveDirectoryInput(defaultSaveDirectory: string | null | undefined, path: string | null) {
  if (path !== null) return {};

  const directory = defaultSaveDirectory?.trim();
  return directory ? { defaultDirectory: directory } : {};
}
