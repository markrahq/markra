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
    deleted: false,
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
    deleted: tab.deleted,
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
    deleted: false,
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

type MarkdownListItemStart = {
  indent: string;
  kind: "bullet" | "ordered";
  quotePrefix: string;
};

function markdownBlockquotePrefixKey(line: string | undefined) {
  const match = /^((?:>\s*)+)/u.exec(line ?? "");
  return match ? ">".repeat(match[1]!.split(">").length - 1) : "";
}

function markdownListContentStart(line: string | undefined) {
  const source = line ?? "";
  const quoteMatch = /^((?:>\s*)+)/u.exec(source);
  return quoteMatch ? quoteMatch[0].length : 0;
}

function markdownListItemStart(line: string | undefined): MarkdownListItemStart | null {
  const source = line ?? "";
  const contentStart = markdownListContentStart(source);
  const match = /^([ ]{0,3})(?:[-+*]|\d{1,9}[.)])\s+/u.exec(source.slice(contentStart));
  if (!match) return null;

  return {
    indent: match[1] ?? "",
    kind: /^\s{0,3}\d/u.test(source.slice(contentStart)) ? "ordered" : "bullet",
    quotePrefix: markdownBlockquotePrefixKey(source)
  };
}

function matchingSimpleListItems(
  previousListItem: MarkdownListItemStart | null,
  nextListItem: MarkdownListItemStart | null,
  spacerQuotePrefix: string
) {
  return Boolean(
    previousListItem &&
    nextListItem &&
    previousListItem.indent === nextListItem.indent &&
    previousListItem.kind === nextListItem.kind &&
    previousListItem.quotePrefix === nextListItem.quotePrefix &&
    previousListItem.quotePrefix === spacerQuotePrefix
  );
}

function isComparableMarkdownListSpacer(line: string, previousLine: string | undefined, nextLine: string | undefined) {
  const quotePrefix = markdownBlockquotePrefixKey(line);
  const unquotedContent = quotePrefix ? line.replace(/^((?:>\s*)+)/u, "") : line;
  if (unquotedContent.trim() !== "") return false;

  return matchingSimpleListItems(
    markdownListItemStart(previousLine),
    markdownListItemStart(nextLine),
    quotePrefix
  );
}

function normalizeComparableMarkdownListSpacing(content: string) {
  const lines = content.split("\n");
  const normalized: string[] = [];
  let fencedMarker: "`" | "~" | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
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

    // Milkdown may serialize adjacent one-line list items without the spacer line;
    // keep that clean-file rewrite from becoming an unsaved edit.
    const isSimpleListSpacer =
      !fencedMarker &&
      isComparableMarkdownListSpacer(line, normalized[normalized.length - 1], lines[lineIndex + 1]);

    if (!isSimpleListSpacer) normalized.push(line);
  }

  return normalized.join("\n");
}

function isMarkdownWordCharacter(character: string | undefined) {
  return character !== undefined && /[\p{L}\p{N}]/u.test(character);
}

function normalizeComparableMarkdownLineEscapes(line: string) {
  let normalized = "";

  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "`") {
      const runStart = index;
      while (line[index + 1] === "`") index += 1;

      const marker = line.slice(runStart, index + 1);
      const closingIndex = line.indexOf(marker, index + 1);
      if (closingIndex >= 0) {
        normalized += line.slice(runStart, closingIndex + marker.length);
        index = closingIndex + marker.length - 1;
        continue;
      }

      normalized += line.slice(runStart, index + 1);
      continue;
    }

    if (
      line[index] === "\\" &&
      line[index + 1] === "_" &&
      isMarkdownWordCharacter(line[index - 1]) &&
      isMarkdownWordCharacter(line[index + 2])
    ) {
      // Milkdown escapes intraword underscores even though CommonMark treats them as literal text.
      normalized += "_";
      index += 1;
      continue;
    }

    normalized += line[index];
  }

  return normalized;
}

function normalizeComparableMarkdownEscapes(content: string) {
  const lines = content.split("\n");
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

    normalized.push(fencedMarker ? line : normalizeComparableMarkdownLineEscapes(line));
  }

  return normalized.join("\n");
}

function comparableMarkdown(content: string) {
  return normalizeComparableMarkdownEscapes(
    normalizeComparableMarkdownListSpacing(normalizeComparableMarkdownHeadings(content))
  )
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
