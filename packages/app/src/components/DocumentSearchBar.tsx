import { useEffect, useRef, type KeyboardEvent } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
import { t, type AppLanguage } from "@markra/shared";
import { Tooltip } from "@markra/ui";

type DocumentSearchBarProps = {
  activeIndex: number;
  caseSensitive: boolean;
  language?: AppLanguage;
  matchCount: number;
  query: string;
  readOnly?: boolean;
  replaceOpen: boolean;
  replacement: string;
  onCaseSensitiveChange: (caseSensitive: boolean) => unknown;
  onClose: () => unknown;
  onNext: () => unknown;
  onPrevious: () => unknown;
  onQueryChange: (query: string) => unknown;
  onReplace: () => unknown;
  onReplaceAll: () => unknown;
  onReplaceOpenChange: (open: boolean) => unknown;
  onReplacementChange: (replacement: string) => unknown;
};

const labels: Record<string, {
  caseSensitive: string;
  close: string;
  findInDocument: string;
  next: string;
  previous: string;
  replace: string;
  replaceAll: string;
  replacePlaceholder: string;
  toggleReplace: string;
}> = {
  en: {
    caseSensitive: "Case sensitive",
    close: "Close search",
    findInDocument: "Find in document",
    next: "Next match",
    previous: "Previous match",
    replace: "Replace",
    replaceAll: "All",
    replacePlaceholder: "Replace",
    toggleReplace: "Show replace"
  },
  "zh-CN": {
    caseSensitive: "区分大小写",
    close: "关闭搜索",
    findInDocument: "文档内搜索",
    next: "下一个匹配",
    previous: "上一个匹配",
    replace: "替换",
    replaceAll: "全部",
    replacePlaceholder: "替换为",
    toggleReplace: "显示替换"
  },
  "zh-TW": {
    caseSensitive: "區分大小寫",
    close: "關閉搜尋",
    findInDocument: "文件內搜尋",
    next: "下一個相符項目",
    previous: "上一個相符項目",
    replace: "取代",
    replaceAll: "全部",
    replacePlaceholder: "取代為",
    toggleReplace: "顯示取代"
  }
};

function documentSearchLabels(language: AppLanguage) {
  return labels[language] ?? labels.en;
}

export function DocumentSearchBar({
  activeIndex,
  caseSensitive,
  language = "en",
  matchCount,
  query,
  readOnly = false,
  replaceOpen,
  replacement,
  onCaseSensitiveChange,
  onClose,
  onNext,
  onPrevious,
  onQueryChange,
  onReplace,
  onReplaceAll,
  onReplaceOpenChange,
  onReplacementChange
}: DocumentSearchBarProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const label = documentSearchLabels(language);
  const activeLabel = matchCount > 0 && activeIndex >= 0 ? `${activeIndex + 1}/${matchCount}` : `0/${matchCount}`;

  useEffect(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Enter") return;

    event.preventDefault();
    if (event.shiftKey) {
      onPrevious();
    } else {
      onNext();
    }
  };

  const handleReplacementKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Enter") return;

    event.preventDefault();
    onReplace();
  };

  const navigationDisabled = matchCount === 0;
  const replaceDisabled = readOnly || matchCount === 0;

  return (
    <div
      className="document-search-bar absolute right-4 top-12 z-40 flex w-[min(calc(100%-2rem),460px)] flex-col gap-2 rounded-md border border-(--border-strong) bg-(--bg-secondary)/96 p-2 text-[12px] text-(--text-primary) shadow-[0_14px_42px_rgba(0,0,0,0.14)] backdrop-blur-sm"
      role="search"
      aria-label={label.findInDocument}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Search aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={14} />
        <input
          className="h-8 min-w-0 flex-1 rounded-sm border border-(--border-default) bg-(--bg-primary) px-2 text-[12px] text-(--text-heading) outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-(--text-secondary) focus:border-(--accent) focus:shadow-[0_0_0_2px_var(--accent-soft)]"
          aria-label={label.findInDocument}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          placeholder={t(language, "app.searchPlaceholder")}
          ref={searchInputRef}
          spellCheck={false}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <span className="w-12 shrink-0 text-center tabular-nums text-(--text-secondary)">{activeLabel}</span>
        <button
          className="document-search-icon-button"
          aria-label={label.previous}
          disabled={navigationDisabled}
          type="button"
          onClick={onPrevious}
        >
          <ChevronUp aria-hidden="true" size={14} />
        </button>
        <button
          className="document-search-icon-button"
          aria-label={label.next}
          disabled={navigationDisabled}
          type="button"
          onClick={onNext}
        >
          <ChevronDown aria-hidden="true" size={14} />
        </button>
        <Tooltip content={label.caseSensitive}>
          <button
            className="document-search-icon-button"
            aria-label={label.caseSensitive}
            aria-pressed={caseSensitive}
            type="button"
            onClick={() => onCaseSensitiveChange(!caseSensitive)}
          >
            <CaseSensitive aria-hidden="true" size={14} />
          </button>
        </Tooltip>
        <button
          className="document-search-icon-button"
          aria-label={label.toggleReplace}
          aria-pressed={replaceOpen}
          type="button"
          onClick={() => onReplaceOpenChange(!replaceOpen)}
        >
          <Replace aria-hidden="true" size={14} />
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
      {replaceOpen ? (
        <div className="flex min-w-0 items-center gap-1.5 pl-5">
          <input
            className="h-8 min-w-0 flex-1 rounded-sm border border-(--border-default) bg-(--bg-primary) px-2 text-[12px] text-(--text-heading) outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-(--text-secondary) focus:border-(--accent) focus:shadow-[0_0_0_2px_var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-55"
            aria-label={label.replacePlaceholder}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            disabled={readOnly}
            placeholder={label.replacePlaceholder}
            spellCheck={false}
            value={replacement}
            onChange={(event) => onReplacementChange(event.currentTarget.value)}
            onKeyDown={handleReplacementKeyDown}
          />
          <button
            className="document-search-text-button"
            disabled={replaceDisabled}
            type="button"
            onClick={onReplace}
          >
            {label.replace}
          </button>
          <button
            className="document-search-text-button"
            disabled={replaceDisabled}
            type="button"
            onClick={onReplaceAll}
          >
            {label.replaceAll}
          </button>
        </div>
      ) : null}
    </div>
  );
}
