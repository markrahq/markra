import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { debug, t, type AppLanguage } from "@markra/shared";
import { Tooltip } from "@markra/ui";
import {
  listNativeMarkdownFileHistory,
  readNativeMarkdownFileHistory,
  type NativeMarkdownFileHistoryEntry
} from "../lib/tauri";

export type DocumentHistoryDialogProps = {
  documentPath: string;
  language?: AppLanguage;
  onClose: () => unknown;
  onRestore: (contents: string, historyId: string) => unknown | Promise<unknown>;
  refreshKey?: number;
  rightInsetPx?: number;
  windowsSelfDrawnChrome?: boolean;
};

const documentHistoryPanelHorizontalGapPx = 12;
const documentHistoryPanelGapPx = 8;
const documentHistoryPanelMinimumWidthPx = 192;
const documentHistoryPanelViewportMarginPx = 4;
const titlebarRowHeightPx = 40;

function formatHistoryDate(language: AppLanguage, timestamp: number) {
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

function formatHistorySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;

  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function DocumentHistoryDialog({
  documentPath,
  language = "en",
  onClose,
  onRestore,
  refreshKey = 0,
  rightInsetPx = 0,
  windowsSelfDrawnChrome = false
}: DocumentHistoryDialogProps) {
  const label = (key: string) => t(language, key);
  const [entries, setEntries] = useState<NativeMarkdownFileHistoryEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ contents: string; id: string } | null>(null);
  const [previewPendingId, setPreviewPendingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [restorePending, setRestorePending] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const loadedDocumentPathRef = useRef<string | null>(null);
  const previewRequestIdRef = useRef(0);
  const normalizedRightInsetPx = Math.max(0, rightInsetPx);
  const panelTopPx = titlebarRowHeightPx * (windowsSelfDrawnChrome ? 2 : 1) + documentHistoryPanelGapPx;
  const viewportWidthPx = typeof window === "undefined" ? Number.POSITIVE_INFINITY : window.innerWidth;
  const requestedPanelRightPx = normalizedRightInsetPx + documentHistoryPanelHorizontalGapPx;
  // Preserve a usable panel on narrow windows even when fully avoiding the AI sidebar is impossible.
  const maximumPanelRightPx = Math.max(
    documentHistoryPanelHorizontalGapPx,
    viewportWidthPx - documentHistoryPanelMinimumWidthPx - documentHistoryPanelViewportMarginPx
  );
  const panelRightPx = Math.min(requestedPanelRightPx, maximumPanelRightPx);
  const panelWidthInsetPx = panelRightPx + documentHistoryPanelViewportMarginPx;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || panelRef.current?.contains(target)) return;

      // The trigger owns the toggle; dismissing on pointerdown would let its following click reopen the panel.
      if (target instanceof Element && target.closest("[data-document-history-trigger]")) return;

      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      onClose();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    const documentPathChanged = loadedDocumentPathRef.current !== documentPath;
    loadedDocumentPathRef.current = documentPath;

    if (documentPathChanged) {
      setEntries([]);
      setEntriesLoading(true);
      setSelectedId(null);
      setPreview(null);
      setPreviewError(false);
      setPreviewPendingId(null);
      setRestorePending(false);
      previewRequestIdRef.current += 1;
    }
    setEntriesError(false);

    debug(() => ["[markra-history] list start", {
      documentPath,
      mode: documentPathChanged ? "reset" : "refresh"
    }]);

    listNativeMarkdownFileHistory(documentPath)
      .then((historyEntries) => {
        if (!active) return;

        debug(() => ["[markra-history] list success", {
          documentPath,
          entryCount: historyEntries.length,
          firstEntryId: historyEntries[0]?.id ?? null
        }]);
        setEntries(historyEntries);
        setSelectedId((current) => {
          if (current === null) return current;

          return historyEntries.some((entry) => entry.id === current) ? current : null;
        });
        setPreview((current) => {
          if (current === null) return current;

          return historyEntries.some((entry) => entry.id === current.id) ? current : null;
        });
      })
      .catch((error: unknown) => {
        if (!active) return;

        debug(() => ["[markra-history] list failed", {
          documentPath,
          error: error instanceof Error ? error.message : String(error)
        }]);
        if (documentPathChanged) {
          setEntriesError(true);
        }
      })
      .finally(() => {
        if (!active) return;

        setEntriesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [documentPath, refreshKey]);

  const previewEntry = (entry: NativeMarkdownFileHistoryEntry) => {
    if (previewPendingId !== null || restorePending) {
      debug(() => ["[markra-history] preview ignored", {
        documentPath,
        historyId: entry.id,
        previewPendingId,
        restorePending
      }]);
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    setPreviewError(false);
    setPreviewPendingId(entry.id);
    setSelectedId(entry.id);
    debug(() => ["[markra-history] preview click", {
      documentPath,
      historyId: entry.id,
      mode: "state-click"
    }]);

    readNativeMarkdownFileHistory(documentPath, entry.id)
      .then((file) => {
        if (previewRequestIdRef.current !== requestId) return;

        debug(() => ["[markra-history] preview contents resolved", {
          documentPath,
          historyId: file.id,
          contentsChars: file.contents.length
        }]);
        setSelectedId(file.id);
        setPreview({ contents: file.contents, id: file.id });
        setPreviewPendingId(null);
      })
      .catch((error: unknown) => {
        if (previewRequestIdRef.current !== requestId) return;

        debug(() => ["[markra-history] preview failed", {
          documentPath,
          historyId: entry.id,
          error: error instanceof Error ? error.message : String(error)
        }]);
        setPreviewError(true);
        setPreviewPendingId(null);
      });
  };

  const restorePreview = async () => {
    if (preview === null || restorePending) return;

    setRestorePending(true);
    setPreviewError(false);
    debug(() => ["[markra-history] restore click", {
      documentPath,
      historyId: preview.id,
      mode: "preview-confirm"
    }]);
    try {
      await onRestore(preview.contents, preview.id);
    } catch (error: unknown) {
      debug(() => ["[markra-history] restore failed", {
        documentPath,
        historyId: preview.id,
        error: error instanceof Error ? error.message : String(error)
      }]);
      setPreviewError(true);
    } finally {
      setRestorePending(false);
    }
  };

  return (
    <section
      aria-label={label("app.documentHistory")}
      className="fixed z-40 grid animate-[markra-history-panel-in_140ms_cubic-bezier(0.2,0,0,1)_both] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-(--border-default) bg-(--bg-primary) shadow-xl motion-reduce:animate-none"
      ref={panelRef}
      role="region"
      style={{
        maxHeight: `min(420px, calc(100vh - ${panelTopPx + documentHistoryPanelGapPx}px))`,
        maxWidth: "22rem",
        right: panelRightPx,
        top: panelTopPx,
        width: `calc(100vw - ${panelWidthInsetPx}px)`
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-(--border-default) px-3 py-2">
        <h4 className="m-0 truncate text-[12px] leading-5 font-bold text-(--text-heading)">
          {label("app.documentHistory")}
        </h4>
        <Tooltip content={label("app.closeDocumentHistory")}>
          <button
            aria-label={label("app.closeDocumentHistory")}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={15} strokeWidth={2} />
          </button>
        </Tooltip>
      </div>
      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-(--bg-secondary)">
        <div className="min-h-0 overflow-auto p-2">
        {entriesLoading ? (
          <p className="m-0 px-2 py-2 text-[12px] leading-5 text-(--text-secondary)">
            {label("app.historyLoading")}
          </p>
        ) : entriesError ? (
          <p className="m-0 px-2 py-2 text-[12px] leading-5 text-(--text-secondary)">
            {label("app.historyLoadFailed")}
          </p>
        ) : entries.length === 0 ? (
          <p className="m-0 px-2 py-2 text-[12px] leading-5 text-(--text-secondary)">
            {label("app.historyNoVersions")}
          </p>
        ) : (
          <div className="grid gap-1" role="listbox" aria-label={label("app.documentHistory")}>
            {entries.map((entry) => {
              const selected = entry.id === selectedId;
              const pending = entry.id === previewPendingId;

              return (
                <button
                  aria-selected={selected}
                  disabled={previewPendingId !== null || restorePending}
                  className={`grid w-full min-w-0 rounded-md px-2 py-2 text-left transition-colors duration-150 ease-out ${
                    selected || pending
                      ? "bg-(--bg-active) text-(--text-heading)"
                      : "text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading)"
                  } disabled:cursor-default disabled:opacity-70`}
                  key={entry.id}
                  role="option"
                  type="button"
                  onClick={() => previewEntry(entry)}
                >
                  <span className="truncate text-[12px] leading-5 font-[650]">
                    {formatHistoryDate(language, entry.createdAt)}
                  </span>
                  <span className="text-[11px] leading-4 text-(--text-muted)">
                    {pending ? label("app.historyPreviewLoading") : formatHistorySize(entry.sizeBytes)}
                  </span>
                </button>
              );
            })}
            {previewError ? (
              <p className="m-0 px-2 py-2 text-[12px] leading-5 text-(--text-secondary)">
                {label("app.historyLoadFailed")}
              </p>
            ) : null}
          </div>
        )}
        </div>
        {preview ? (
          <section
            aria-label={label("app.historyPreview")}
            className="grid gap-2 border-t border-(--border-default) bg-(--bg-primary) p-3"
            role="region"
          >
            <pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-(--bg-secondary) p-2 text-[11px] leading-5 text-(--text-secondary)">
              {preview.contents}
            </pre>
            <button
              className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-md border border-(--accent) bg-(--accent) px-3 text-[12px] font-semibold text-white transition-opacity disabled:cursor-default disabled:opacity-60"
              disabled={restorePending || previewPendingId !== null}
              type="button"
              onClick={() => void restorePreview()}
            >
              {label("app.restoreHistoryVersion")}
            </button>
          </section>
        ) : null}
      </div>
    </section>
  );
}
