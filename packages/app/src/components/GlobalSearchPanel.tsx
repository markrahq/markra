import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CaseSensitive, ChevronDown, ChevronRight, Loader2, Search, X } from "lucide-react";
import { findSearchRanges, type AppLanguage } from "@markra/shared";
import type { WorkspaceSearchResult } from "../lib/workspace-search";

type GlobalSearchPanelProps = {
  caseSensitive: boolean;
  language?: AppLanguage;
  loading: boolean;
  query: string;
  results: readonly WorkspaceSearchResult[];
  searchedFileCount: number;
  unreadableFileCount: number;
  onCaseSensitiveChange: (caseSensitive: boolean) => unknown;
  onClose: () => unknown;
  onOpenResult: (result: WorkspaceSearchResult) => unknown;
  onQueryChange: (query: string) => unknown;
};

const labels: Record<string, {
  caseSensitive: string;
  close: string;
  empty: string;
  files: (count: number) => string;
  collapseFile: (path: string) => string;
  expandFile: (path: string) => string;
  fileSearchResults: (path: string) => string;
  loading: string;
  noResults: string;
  openResult: (path: string, line: number) => string;
  placeholder: string;
  results: string;
  resultCount: (count: number) => string;
  searchWorkspace: string;
  showMoreMatches: (count: number) => string;
  unreadable: (count: number) => string;
}> = {
  en: {
    caseSensitive: "Case sensitive",
    close: "Close search",
    empty: "Type to search",
    files: (count) => `${count} file${count === 1 ? "" : "s"}`,
    collapseFile: (path) => `Collapse ${path} search results`,
    expandFile: (path) => `Expand ${path} search results`,
    fileSearchResults: (path) => `${path} search results`,
    loading: "Searching...",
    noResults: "No results",
    openResult: (path, line) => `Open ${path} line ${line}`,
    placeholder: "Search files",
    results: "Search results",
    resultCount: (count) => `${count} result${count === 1 ? "" : "s"}`,
    searchWorkspace: "Search workspace",
    showMoreMatches: (count) => `show ${count} more match${count === 1 ? "" : "es"}`,
    unreadable: (count) => `${count} unreadable`
  },
  "zh-CN": {
    caseSensitive: "区分大小写",
    close: "关闭搜索",
    empty: "输入关键词搜索",
    files: (count) => `${count} 个文件`,
    collapseFile: (path) => `折叠 ${path} 的搜索结果`,
    expandFile: (path) => `展开 ${path} 的搜索结果`,
    fileSearchResults: (path) => `${path} 搜索结果`,
    loading: "搜索中...",
    noResults: "没有结果",
    openResult: (path, line) => `打开 ${path} 第 ${line} 行`,
    placeholder: "搜索文件内容",
    results: "搜索结果",
    resultCount: (count) => `${count} 个结果`,
    searchWorkspace: "全局搜索",
    showMoreMatches: (count) => `显示另外 ${count} 个匹配`,
    unreadable: (count) => `${count} 个文件不可读`
  },
  "zh-TW": {
    caseSensitive: "區分大小寫",
    close: "關閉搜尋",
    empty: "輸入關鍵字搜尋",
    files: (count) => `${count} 個檔案`,
    collapseFile: (path) => `摺疊 ${path} 的搜尋結果`,
    expandFile: (path) => `展開 ${path} 的搜尋結果`,
    fileSearchResults: (path) => `${path} 搜尋結果`,
    loading: "搜尋中...",
    noResults: "沒有結果",
    openResult: (path, line) => `開啟 ${path} 第 ${line} 行`,
    placeholder: "搜尋檔案內容",
    results: "搜尋結果",
    resultCount: (count) => `${count} 個結果`,
    searchWorkspace: "全域搜尋",
    showMoreMatches: (count) => `顯示另外 ${count} 個相符項目`,
    unreadable: (count) => `${count} 個檔案無法讀取`
  }
};

type GlobalSearchResultGroup = {
  file: WorkspaceSearchResult["file"];
  results: WorkspaceSearchResult[];
};

const collapsedGroupPreviewCount = 4;

function globalSearchLabels(language: AppLanguage) {
  return labels[language] ?? labels.en;
}

function groupSearchResultsByFile(results: readonly WorkspaceSearchResult[]) {
  const groups = new Map<string, GlobalSearchResultGroup>();

  results.forEach((result) => {
    const currentGroup = groups.get(result.file.path);
    if (currentGroup) {
      currentGroup.results.push(result);
      return;
    }

    groups.set(result.file.path, {
      file: result.file,
      results: [result]
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
  query,
  results,
  searchedFileCount,
  unreadableFileCount,
  onCaseSensitiveChange,
  onClose,
  onOpenResult,
  onQueryChange
}: GlobalSearchPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const label = globalSearchLabels(language);
  const [collapsedFilePaths, setCollapsedFilePaths] = useState<Set<string>>(() => new Set());
  const [expandedPreviewFilePaths, setExpandedPreviewFilePaths] = useState<Set<string>>(() => new Set());
  const resultGroups = useMemo(() => groupSearchResultsByFile(results), [results]);
  const showNoResults = query.trim().length > 0 && !loading && results.length === 0;
  const statusText = loading ? label.loading : label.resultCount(results.length);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

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
      className="global-search-panel absolute left-1/2 top-14 z-50 flex w-[min(calc(100%-2rem),640px)] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-(--border-strong) bg-(--bg-secondary)/98 text-[12px] text-(--text-primary) shadow-[0_18px_58px_rgba(0,0,0,0.18)] backdrop-blur-sm"
      role="dialog"
      aria-label={label.searchWorkspace}
    >
      <div className="flex min-w-0 items-center gap-1.5 border-b border-(--border-default) p-2">
        <Search aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={15} />
        <input
          className="h-8 min-w-0 flex-1 rounded-sm border border-(--border-default) bg-(--bg-primary) px-2 text-[12px] text-(--text-heading) outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-(--text-secondary) focus:border-(--accent) focus:shadow-[0_0_0_2px_var(--accent-soft)]"
          aria-label={label.searchWorkspace}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          placeholder={label.placeholder}
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
          aria-label={label.caseSensitive}
          aria-pressed={caseSensitive}
          type="button"
          onClick={() => onCaseSensitiveChange(!caseSensitive)}
        >
          <CaseSensitive aria-hidden="true" size={14} />
        </button>
        <button
          className="document-search-icon-button"
          aria-label={label.close}
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" size={14} />
        </button>
      </div>
      <div className="flex min-h-0 max-h-[min(52vh,420px)] flex-col">
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-(--border-default) px-3 text-[11px] font-[560] text-(--text-secondary)">
          {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={13} /> : null}
          <span>{statusText}</span>
          <span>{label.files(searchedFileCount)}</span>
          {unreadableFileCount > 0 ? <span>{label.unreadable(unreadableFileCount)}</span> : null}
        </div>
        {results.length > 0 ? (
          <ul
            className="m-0 min-h-0 list-none overflow-y-auto px-2 py-1"
            role="list"
            aria-label={label.results}
          >
            {resultGroups.map((group) => {
              const collapsed = collapsedFilePaths.has(group.file.path);
              const previewExpanded = expandedPreviewFilePaths.has(group.file.path);
              const visibleResults = previewExpanded
                ? group.results
                : group.results.slice(0, collapsedGroupPreviewCount);
              const hiddenResultCount = group.results.length - visibleResults.length;
              const directoryLabel = directoryLabelFromRelativePath(group.file.relativePath);

              return (
                <li className="border-b border-(--border-default) last:border-b-0" key={group.file.path}>
                  <section role="group" aria-label={label.fileSearchResults(group.file.relativePath)}>
                    <button
                      className="grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-sm border-0 bg-transparent px-1.5 py-2 text-left outline-none transition-[background-color,color] duration-150 hover:bg-(--bg-hover) focus-visible:bg-(--bg-active) focus-visible:ring-2 focus-visible:ring-(--accent)"
                      aria-expanded={!collapsed}
                      aria-label={
                        collapsed
                          ? label.expandFile(group.file.relativePath)
                          : label.collapseFile(group.file.relativePath)
                      }
                      type="button"
                      onClick={() => toggleFileGroup(group.file.path)}
                    >
                      {collapsed
                        ? <ChevronRight aria-hidden="true" className="text-(--text-secondary)" size={14} />
                        : <ChevronDown aria-hidden="true" className="text-(--text-secondary)" size={14} />}
                      <span className="min-w-0 truncate text-[14px] font-[720] text-(--text-heading)">
                        {group.file.name}
                      </span>
                      <span className="rounded-sm bg-(--bg-active) px-2 py-0.5 text-[12px] font-[620] tabular-nums text-(--text-heading)">
                        {group.results.length}
                      </span>
                    </button>
                    {!collapsed ? (
                      <div className="pb-2 pl-7 pr-1">
                        {directoryLabel ? (
                          <div className="mb-1 truncate font-mono text-[11px] text-(--text-secondary)">
                            {directoryLabel}
                          </div>
                        ) : null}
                        <ul className="m-0 list-none p-0" role="list" aria-label={`${group.file.relativePath} matches`}>
                          {visibleResults.map((result) => (
                            <li key={result.id}>
                              <button
                                className="block w-full cursor-pointer rounded-sm border-0 bg-transparent px-0 py-1 text-left outline-none transition-[background-color,color] duration-150 hover:bg-(--bg-hover) focus-visible:bg-(--bg-active) focus-visible:ring-2 focus-visible:ring-(--accent)"
                                aria-label={label.openResult(result.file.relativePath, result.lineNumber)}
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
                        {hiddenResultCount > 0 ? (
                          <button
                            className="mt-0.5 cursor-pointer rounded-sm border-0 bg-transparent px-0 py-1 text-left text-[12px] font-[560] text-(--text-secondary) outline-none transition-colors duration-150 hover:text-(--text-heading) focus-visible:text-(--text-heading) focus-visible:ring-2 focus-visible:ring-(--accent)"
                            type="button"
                            onClick={() => expandFilePreview(group.file.path)}
                          >
                            {label.showMoreMatches(hiddenResultCount)}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex min-h-24 items-center justify-center px-4 py-8 text-[12px] font-[560] text-(--text-secondary)">
            {showNoResults ? label.noResults : label.empty}
          </div>
        )}
      </div>
    </div>
  );
}
