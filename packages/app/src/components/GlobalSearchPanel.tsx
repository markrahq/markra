import { useCallback, useEffect, useMemo, useRef, useState, type Key, type KeyboardEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CaseSensitive, ChevronDown, ChevronRight, Loader2, Search, X } from "lucide-react";
import { findSearchRanges, t, type AppLanguage, type I18nKey } from "@markra/shared";
import {
  isWorkspaceFileNameSearchResult,
  type WorkspaceSearchContentResult,
  type WorkspaceSearchFile,
  type WorkspaceSearchFileNameResult,
  type WorkspaceSearchResult
} from "../lib/workspace-search";

type GlobalSearchPanelProps = {
  caseSensitive: boolean;
  language?: AppLanguage;
  loading: boolean;
  placement?: "dialog" | "sidebar";
  query: string;
  recentQueries?: readonly string[];
  results: readonly WorkspaceSearchResult[];
  searchedFileCount: number;
  truncated: boolean;
  unreadableFileCount: number;
  onCaseSensitiveChange: (caseSensitive: boolean) => unknown;
  onClose: () => unknown;
  onOpenFile: (file: WorkspaceSearchFile) => unknown;
  onOpenResult: (result: WorkspaceSearchContentResult) => unknown;
  onQueryChange: (query: string) => unknown;
  onRecentQuerySelect?: (query: string) => unknown;
};

type GlobalSearchResultGroup = {
  file: WorkspaceSearchResult["file"];
  fileNameResult?: WorkspaceSearchFileNameResult;
  results: WorkspaceSearchContentResult[];
};

type VirtualResultGroupItem = {
  index: number;
  key: Key;
  start: number;
};

const collapsedGroupPreviewCount = 4;
const resultGroupOverscanCount = 6;
const collapsedResultGroupHeight = 43;
const expandedResultGroupBaseHeight = 53;
const resultGroupDirectoryHeight = 24;
const resultGroupMatchHeight = 28;
const resultGroupShowMoreHeight = 29;
const fallbackRenderedResultGroupCount = 12;

function formatSearchMessage(message: string, values: Record<string, number | string>) {
  return Object.entries(values).reduce(
    (currentMessage, [key, value]) => currentMessage.replaceAll(`{${key}}`, String(value)),
    message
  );
}

function countMessageKey(count: number, singularKey: I18nKey, pluralKey: I18nKey) {
  return count === 1 ? singularKey : pluralKey;
}

function groupSearchResultsByFile(results: readonly WorkspaceSearchResult[]) {
  const groups = new Map<string, GlobalSearchResultGroup>();

  results.forEach((result) => {
    const currentGroup = groups.get(result.file.path);
    if (currentGroup) {
      if (isWorkspaceFileNameSearchResult(result)) {
        currentGroup.fileNameResult = result;
      } else {
        currentGroup.results.push(result);
      }
      return;
    }

    groups.set(result.file.path, {
      file: result.file,
      fileNameResult: isWorkspaceFileNameSearchResult(result) ? result : undefined,
      results: isWorkspaceFileNameSearchResult(result) ? [] : [result]
    });
  });

  return Array.from(groups.values());
}

function directoryLabelFromRelativePath(relativePath: string) {
  const normalizedPath = relativePath.replaceAll("\\", "/");
  const lastSeparatorIndex = normalizedPath.lastIndexOf("/");
  if (lastSeparatorIndex < 0) return null;

  const directory = normalizedPath.slice(0, lastSeparatorIndex).trim();
  return directory ? `${directory} /` : null;
}

function estimateResultGroupHeight(
  group: GlobalSearchResultGroup | undefined,
  collapsedFilePaths: Set<string>,
  expandedPreviewFilePaths: Set<string>
) {
  if (!group || collapsedFilePaths.has(group.file.path)) return collapsedResultGroupHeight;

  if (group.results.length === 0) {
    return collapsedResultGroupHeight
      + (directoryLabelFromRelativePath(group.file.relativePath) ? resultGroupDirectoryHeight : 0);
  }

  const previewExpanded = expandedPreviewFilePaths.has(group.file.path);
  const visibleResultCount = previewExpanded
    ? group.results.length
    : Math.min(group.results.length, collapsedGroupPreviewCount);
  const hiddenResultCount = group.results.length - visibleResultCount;
  const directoryHeight = directoryLabelFromRelativePath(group.file.relativePath) ? resultGroupDirectoryHeight : 0;
  const showMoreHeight = hiddenResultCount > 0 ? resultGroupShowMoreHeight : 0;

  return expandedResultGroupBaseHeight
    + directoryHeight
    + visibleResultCount * resultGroupMatchHeight
    + showMoreHeight;
}

function firstVirtualResultGroups(
  resultGroups: readonly GlobalSearchResultGroup[],
  getResultGroupKey: (index: number) => Key,
  estimateResultGroupSize: (index: number) => number
): VirtualResultGroupItem[] {
  const count = Math.min(resultGroups.length, fallbackRenderedResultGroupCount);
  const virtualGroups: VirtualResultGroupItem[] = [];
  let start = 0;

  for (let index = 0; index < count; index += 1) {
    virtualGroups.push({
      index,
      key: getResultGroupKey(index),
      start
    });
    start += estimateResultGroupSize(index);
  }

  return virtualGroups;
}

function renderHighlightedSnippet(snippet: string, query: string, caseSensitive: boolean) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return snippet;

  const ranges = findSearchRanges(snippet, normalizedQuery, { caseSensitive });
  if (ranges.length === 0) return snippet;

  const nodes: ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.from > cursor) nodes.push(snippet.slice(cursor, range.from));

    nodes.push(
      <mark
        className="global-search-match rounded-xs bg-(--accent-soft) px-0.5 font-bold text-(--text-heading)"
        key={`${range.from}:${range.to}:${index}`}
      >
        {snippet.slice(range.from, range.to)}
      </mark>
    );
    cursor = range.to;
  });

  if (cursor < snippet.length) nodes.push(snippet.slice(cursor));

  return nodes;
}

export function GlobalSearchPanel({
  caseSensitive,
  language = "en",
  loading,
  placement = "dialog",
  query,
  recentQueries = [],
  results,
  searchedFileCount,
  truncated,
  unreadableFileCount,
  onCaseSensitiveChange,
  onClose,
  onOpenFile,
  onOpenResult,
  onQueryChange,
  onRecentQuerySelect
}: GlobalSearchPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [resultListElement, setResultListElement] = useState<HTMLDivElement | null>(null);
  const label = (key: I18nKey) => t(language, key);
  const searchLabel = (key: I18nKey, values: Record<string, number | string>) =>
    formatSearchMessage(label(key), values);
  const [collapsedFilePaths, setCollapsedFilePaths] = useState<Set<string>>(() => new Set());
  const [expandedPreviewFilePaths, setExpandedPreviewFilePaths] = useState<Set<string>>(() => new Set());
  const resultGroups = useMemo(() => groupSearchResultsByFile(results), [results]);
  const getResultGroupKey = useCallback((index: number) => resultGroups[index]?.file.path ?? index, [resultGroups]);
  const estimateVirtualResultGroupSize = useCallback(
    (index: number) => estimateResultGroupHeight(
      resultGroups[index],
      collapsedFilePaths,
      expandedPreviewFilePaths
    ),
    [collapsedFilePaths, expandedPreviewFilePaths, resultGroups]
  );
  const resultGroupVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: resultGroups.length,
    estimateSize: estimateVirtualResultGroupSize,
    getItemKey: getResultGroupKey,
    getScrollElement: () => resultListElement,
    initialRect: {
      height: 420,
      width: 640
    },
    overscan: resultGroupOverscanCount,
    useFlushSync: false
  });
  const measuredVirtualResultGroups = resultGroupVirtualizer.getVirtualItems();
  const virtualResultGroups: VirtualResultGroupItem[] = measuredVirtualResultGroups.length > 0
    ? measuredVirtualResultGroups
    : firstVirtualResultGroups(resultGroups, getResultGroupKey, estimateVirtualResultGroupSize);
  const measureVirtualResultGroup = typeof ResizeObserver === "undefined"
    ? undefined
    : resultGroupVirtualizer.measureElement;
  const showRecentQueries = query.trim().length === 0
    && !loading
    && results.length === 0
    && recentQueries.length > 0;
  const showNoResults = query.trim().length > 0 && !loading && results.length === 0;
  const statusText = loading
    ? label("app.workspaceSearch.loading")
    : truncated
      ? searchLabel(countMessageKey(
          results.length,
          "app.workspaceSearch.truncatedResultCount",
          "app.workspaceSearch.truncatedResultCountPlural"
        ), { count: results.length })
      : searchLabel(countMessageKey(
          results.length,
          "app.workspaceSearch.resultCount",
          "app.workspaceSearch.resultCountPlural"
        ), { count: results.length });
  const sidebarPlacement = placement === "sidebar";
  const panelClassName = sidebarPlacement
    ? "global-search-panel flex min-h-0 flex-1 flex-col overflow-hidden bg-(--bg-secondary) text-[12px] text-(--text-primary)"
    : "global-search-panel absolute left-1/2 top-14 z-50 flex w-[min(calc(100%-2rem),640px)] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-(--border-strong) bg-(--bg-secondary)/98 text-[12px] text-(--text-primary) shadow-[0_18px_58px_rgba(0,0,0,0.18)] backdrop-blur-sm";
  const resultSurfaceClassName = sidebarPlacement
    ? "flex min-h-0 flex-1 flex-col"
    : "flex min-h-0 max-h-[min(52vh,420px)] flex-col";

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    resultGroupVirtualizer.scrollToOffset(0);
  }, [resultGroupVirtualizer, results]);

  useEffect(() => {
    setCollapsedFilePaths(new Set());
    setExpandedPreviewFilePaths(new Set());
  }, [query]);

  useEffect(() => {
    resultGroupVirtualizer.measure();
  }, [collapsedFilePaths, expandedPreviewFilePaths, resultGroupVirtualizer]);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;

    event.preventDefault();
    onClose();
  };

  const toggleFileGroup = (path: string) => {
    setCollapsedFilePaths((current) => {
      const next = new Set(current);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  };

  const expandFilePreview = (path: string) => {
    setExpandedPreviewFilePaths((current) => new Set(current).add(path));
  };

  return (
    <div
      className={panelClassName}
      role={sidebarPlacement ? "search" : "dialog"}
      aria-label={label("app.workspaceSearch.searchWorkspace")}
    >
      <div className="flex min-w-0 items-center gap-1.5 border-b border-(--border-default) p-2">
        <Search aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={15} />
        <input
          className="h-8 min-w-0 flex-1 rounded-sm border border-(--border-default) bg-(--bg-primary) px-2 text-[12px] text-(--text-heading) outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-(--text-secondary) focus:border-(--accent) focus:shadow-[0_0_0_2px_var(--accent-soft)]"
          aria-label={label("app.workspaceSearch.searchWorkspace")}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          placeholder={label("app.workspaceSearch.placeholder")}
          ref={inputRef}
          role="searchbox"
          spellCheck={false}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <button
          className="document-search-icon-button"
          aria-label={label("app.workspaceSearch.caseSensitive")}
          aria-pressed={caseSensitive}
          type="button"
          onClick={() => onCaseSensitiveChange(!caseSensitive)}
        >
          <CaseSensitive aria-hidden="true" size={14} />
        </button>
        <button
          className="document-search-icon-button"
          aria-label={label("app.workspaceSearch.close")}
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" size={14} />
        </button>
      </div>
      <div className={resultSurfaceClassName}>
        <div className="flex h-8 min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-(--border-default) px-3 text-[11px] font-[560] text-(--text-secondary)">
          {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={13} /> : null}
          <span className="min-w-0 flex-1 truncate">{statusText}</span>
          <span className="shrink-0">
            {searchLabel(countMessageKey(
              searchedFileCount,
              "app.workspaceSearch.fileCount",
              "app.workspaceSearch.fileCountPlural"
            ), { count: searchedFileCount })}
          </span>
          {unreadableFileCount > 0 ? (
            <span className="min-w-0 truncate">
              {searchLabel("app.workspaceSearch.unreadableFileCount", { count: unreadableFileCount })}
            </span>
          ) : null}
        </div>
        {results.length > 0 ? (
          <div
            className="m-0 min-h-0 list-none overflow-y-auto px-2 py-1"
            ref={setResultListElement}
            role="list"
            aria-label={label("app.workspaceSearch.results")}
          >
            <div
              className="relative w-full"
              style={{ height: `${resultGroupVirtualizer.getTotalSize()}px` }}
            >
              {virtualResultGroups.map((virtualGroup) => {
                const group = resultGroups[virtualGroup.index];
                if (!group) return null;

                const collapsed = collapsedFilePaths.has(group.file.path);
                const previewExpanded = expandedPreviewFilePaths.has(group.file.path);
                const visibleResults = previewExpanded
                  ? group.results
                  : group.results.slice(0, collapsedGroupPreviewCount);
                const hiddenResultCount = group.results.length - visibleResults.length;
                const directoryLabel = directoryLabelFromRelativePath(group.file.relativePath);
                const resultCount = group.results.length + (group.fileNameResult ? 1 : 0);
                const fileName = group.fileNameResult
                  ? renderHighlightedSnippet(group.file.name, query, caseSensitive)
                  : group.file.name;

                return (
                  <div
                    className="absolute left-0 top-0 w-full border-b border-(--border-default)"
                    data-index={virtualGroup.index}
                    key={virtualGroup.key}
                    ref={measureVirtualResultGroup}
                    role="listitem"
                    style={{ transform: `translateY(${virtualGroup.start}px)` }}
                  >
                    <section
                      role="group"
                      aria-label={searchLabel("app.workspaceSearch.fileSearchResults", {
                        path: group.file.relativePath
                      })}
                    >
                      <div className="grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center rounded-sm px-1 py-1.5">
                        {group.results.length > 0 ? (
                          <button
                            className="document-search-icon-button"
                            aria-expanded={!collapsed}
                            aria-label={
                              collapsed
                                ? searchLabel("app.workspaceSearch.expandFile", { path: group.file.relativePath })
                                : searchLabel("app.workspaceSearch.collapseFile", { path: group.file.relativePath })
                            }
                            type="button"
                            onClick={() => toggleFileGroup(group.file.path)}
                          >
                            {collapsed
                              ? <ChevronRight aria-hidden="true" size={14} />
                              : <ChevronDown aria-hidden="true" size={14} />}
                          </button>
                        ) : (
                          <span aria-hidden="true" />
                        )}
                        <button
                          className="min-w-0 cursor-pointer truncate rounded-sm border-0 bg-transparent px-1 py-1 text-left text-[13px] font-[680] text-(--text-heading) outline-none transition-colors duration-150 hover:bg-(--bg-hover) focus-visible:bg-(--bg-active) focus-visible:ring-2 focus-visible:ring-(--accent)"
                          aria-label={searchLabel("app.workspaceSearch.openFile", {
                            path: group.file.relativePath
                          })}
                          type="button"
                          onClick={() => onOpenFile(group.file)}
                        >
                          {fileName}
                        </button>
                        <span className="rounded-sm bg-(--bg-active) px-2 py-0.5 text-[12px] font-[620] tabular-nums text-(--text-heading)">
                          {resultCount}
                        </span>
                      </div>
                      {!collapsed && (directoryLabel || group.results.length > 0) ? (
                        <div className="pb-2 pl-7 pr-1">
                          {directoryLabel ? (
                            <div className="mb-1 truncate font-mono text-[11px] text-(--text-secondary)">
                              {renderHighlightedSnippet(directoryLabel, query, caseSensitive)}
                            </div>
                          ) : null}
                          {visibleResults.length > 0 ? (
                            <ul className="m-0 list-none p-0" role="list" aria-label={`${group.file.relativePath} matches`}>
                              {visibleResults.map((result) => (
                                <li key={result.id}>
                                  <button
                                    className="block w-full cursor-pointer rounded-sm border-0 bg-transparent px-0 py-1 text-left outline-none transition-[background-color,color] duration-150 hover:bg-(--bg-hover) focus-visible:bg-(--bg-active) focus-visible:ring-2 focus-visible:ring-(--accent)"
                                    aria-label={searchLabel("app.workspaceSearch.openResult", {
                                      line: result.lineNumber,
                                      path: result.file.relativePath
                                    })}
                                    type="button"
                                    onClick={() => onOpenResult(result)}
                                  >
                                    <span className="block min-w-0 truncate font-mono text-[12px] leading-5 text-(--text-primary)">
                                      {renderHighlightedSnippet(result.snippet, query, caseSensitive)}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {hiddenResultCount > 0 ? (
                            <button
                              className="mt-0.5 cursor-pointer rounded-sm border-0 bg-transparent px-0 py-1 text-left text-[12px] font-[560] text-(--text-secondary) outline-none transition-colors duration-150 hover:text-(--text-heading) focus-visible:text-(--text-heading) focus-visible:ring-2 focus-visible:ring-(--accent)"
                              type="button"
                              onClick={() => expandFilePreview(group.file.path)}
                            >
                              {searchLabel(countMessageKey(
                                hiddenResultCount,
                                "app.workspaceSearch.showMoreMatches",
                                "app.workspaceSearch.showMoreMatchesPlural"
                              ), { count: hiddenResultCount })}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  </div>
                );
              })}
            </div>
          </div>
        ) : showRecentQueries ? (
          <div className="min-h-24 px-2 py-1">
            <div className="px-1.5 py-1 text-[11px] font-[560] text-(--text-secondary)">
              {label("app.workspaceSearch.recentSearches")}
            </div>
            <ul
              className="m-0 list-none p-0"
              role="list"
              aria-label={label("app.workspaceSearch.recentSearches")}
            >
              {recentQueries.map((recentQuery) => (
                <li key={recentQuery}>
                  <button
                    className="block w-full cursor-pointer rounded-sm border-0 bg-transparent px-1.5 py-1.5 text-left font-mono text-[12px] text-(--text-primary) outline-none transition-[background-color,color] duration-150 hover:bg-(--bg-hover) focus-visible:bg-(--bg-active) focus-visible:ring-2 focus-visible:ring-(--accent)"
                    aria-label={searchLabel("app.workspaceSearch.recentSearch", { query: recentQuery })}
                    type="button"
                    onClick={() => onRecentQuerySelect?.(recentQuery)}
                  >
                    <span className="block truncate">{recentQuery}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex min-h-24 items-center justify-center px-4 py-8 text-[12px] font-[560] text-(--text-secondary)">
            {showNoResults ? label("app.workspaceSearch.noResults") : label("app.workspaceSearch.empty")}
          </div>
        )}
      </div>
    </div>
  );
}
