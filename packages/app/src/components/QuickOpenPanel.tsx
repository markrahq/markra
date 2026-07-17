import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FileText, PanelRight, Search, X } from "lucide-react";
import { t, type AppLanguage, type I18nKey } from "@markra/shared";
import type { NativeMarkdownFolderFile } from "../lib/tauri";
import { quickOpenFiles, type QuickOpenMatchRange, type QuickOpenResult } from "../lib/quick-open";

type QuickOpenPanelProps = {
  currentPath?: string | null;
  files: readonly NativeMarkdownFolderFile[];
  language?: AppLanguage;
  openFilePaths?: readonly string[];
  onClose: () => unknown;
  onOpenFile: (file: NativeMarkdownFolderFile, options: { toSide: boolean }) => unknown;
};

const quickOpenResultLimit = 80;

function formatQuickOpenMessage(message: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (currentMessage, [key, value]) => currentMessage.replaceAll(`{${key}}`, value),
    message
  );
}

function renderHighlightedText(text: string, ranges: readonly QuickOpenMatchRange[]) {
  if (ranges.length === 0) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.from > cursor) nodes.push(text.slice(cursor, range.from));

    nodes.push(
      <mark
        className="quick-open-match rounded-xs bg-(--accent-soft) px-0.5 font-bold text-(--text-heading)"
        key={`${range.from}:${range.to}:${index}`}
      >
        {text.slice(range.from, range.to)}
      </mark>
    );
    cursor = range.to;
  });

  if (cursor < text.length) nodes.push(text.slice(cursor));

  return nodes;
}

export function QuickOpenPanel({
  currentPath = null,
  files,
  language = "en",
  openFilePaths = [],
  onClose,
  onOpenFile
}: QuickOpenPanelProps) {
  const label = (key: I18nKey) => t(language, key);
  const quickOpenLabel = (key: I18nKey, values: Record<string, string>) =>
    formatQuickOpenMessage(label(key), values);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedResultRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const results = useMemo(
    () => quickOpenFiles(files, query, {
      currentPath,
      limit: quickOpenResultLimit,
      openFilePaths
    }),
    [currentPath, files, openFilePaths, query]
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    selectedResultRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex]);

  const openResult = (result: QuickOpenResult | undefined, toSide: boolean) => {
    if (!result) return;

    onOpenFile(result.file, { toSide });
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(results.length - 1, current + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setSelectedIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setSelectedIndex(Math.max(0, results.length - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      openResult(results[selectedIndex], event.metaKey || event.ctrlKey);
    }
  };

  return (
    <div
      className="quick-open-panel absolute left-1/2 top-14 z-50 flex w-[min(calc(100%-2rem),620px)] -translate-x-1/2 flex-col overflow-hidden rounded-md border border-(--border-strong) bg-(--bg-secondary)/98 text-[12px] text-(--text-primary) shadow-[0_18px_58px_rgba(0,0,0,0.18)] backdrop-blur-sm"
      role="dialog"
      aria-label={label("app.quickOpen")}
    >
      <div className="flex min-w-0 items-center gap-1.5 border-b border-(--border-default) p-2">
        <Search aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={15} />
        <input
          className="h-8 min-w-0 flex-1 rounded-sm border border-(--border-default) bg-(--bg-primary) px-2 text-[12px] text-(--text-heading) outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-(--text-secondary) focus:border-(--accent) focus:shadow-[0_0_0_2px_var(--accent-soft)]"
          aria-label={label("app.quickOpen")}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          placeholder={label("app.quickOpen.placeholder")}
          ref={inputRef}
          role="searchbox"
          spellCheck={false}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <button
          className="document-search-icon-button"
          aria-label={label("app.workspaceSearch.close")}
          type="button"
          onClick={onClose}
        >
          <X aria-hidden="true" size={14} />
        </button>
      </div>
      <div className="min-h-0 max-h-[min(52vh,420px)] overflow-y-auto px-2 py-1">
        {results.length > 0 ? (
          <div className="m-0 list-none p-0" role="listbox" aria-label={label("app.quickOpen.results")}>
            {results.map((result, index) => {
              const selected = index === selectedIndex;

              return (
                // Keep pointer hover visual-only because WebKit may emit movement events while scrolling.
                <div
                  className={`group grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-1.5 py-1.5 transition-colors duration-150 ${
                    selected ? "bg-(--bg-active)" : "hover:bg-(--bg-hover)"
                  }`}
                  aria-current={result.current ? "page" : undefined}
                  aria-label={quickOpenLabel("app.quickOpen.openFile", { path: result.file.relativePath })}
                  aria-selected={selected}
                  key={result.file.path}
                  ref={selected ? selectedResultRef : undefined}
                  role="option"
                >
                  <FileText aria-hidden="true" className="text-(--text-secondary)" size={15} />
                  <button
                    className="min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left outline-none"
                    type="button"
                    onClick={() => openResult(result, false)}
                  >
                    <span className="block min-w-0 truncate text-[13px] font-[680] text-(--text-heading)">
                      {renderHighlightedText(result.file.name, result.nameMatches)}
                    </span>
                    <span className="block min-w-0 truncate font-mono text-[11px] text-(--text-secondary)">
                      {renderHighlightedText(result.file.relativePath, result.pathMatches)}
                    </span>
                  </button>
                  <button
                    className="document-search-icon-button opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-label={quickOpenLabel("app.quickOpen.openToSide", { path: result.file.relativePath })}
                    type="button"
                    onClick={() => openResult(result, true)}
                  >
                    <PanelRight aria-hidden="true" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-24 items-center justify-center px-4 py-8 text-[12px] font-[560] text-(--text-secondary)">
            {label("app.quickOpen.noResults")}
          </div>
        )}
      </div>
    </div>
  );
}
