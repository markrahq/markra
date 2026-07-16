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
  onRestore: (contents: string, historyId: string) => unknown;
  refreshKey?: number;
  windowsSelfDrawnChrome?: boolean;
};

const documentHistoryPanelGapPx = 8;
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
  windowsSelfDrawnChrome = false
}: DocumentHistoryDialogProps) {
  const label = (key: string) => t(language, key);
  const [entries, setEntries] = useState<NativeMarkdownFileHistoryEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restorePendingId, setRestorePendingId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const loadedDocumentPathRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const panelTopPx = titlebarRowHeightPx * (windowsSelfDrawnChrome ? 2 : 1) + documentHistoryPanelGapPx;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

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
      setRestoreError(false);
      setRestorePendingId(null);
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

  const restoreEntry = (entry: NativeMarkdownFileHistoryEntry) => {
    if (restorePendingId !== null) {
      debug(() => ["[markra-history] restore ignored", {
        documentPath,
        historyId: entry.id,
        restorePendingId
      }]);
      return;
    }

    setRestoreError(false);
    setRestorePendingId(entry.id);
    debug(() => ["[markra-history] restore click", {
      documentPath,
      historyId: entry.id,
      mode: "state-click"
    }]);

    readNativeMarkdownFileHistory(documentPath, entry.id)
      .then((file) => {
        if (!mountedRef.current) return;

        debug(() => ["[markra-history] restore contents resolved", {
          documentPath,
          historyId: file.id,
          contentsChars: file.contents.length
        }]);
        setSelectedId(file.id);
        setRestorePendingId(null);
        onRestore(file.contents, file.id);
      })
      .catch((error: unknown) => {
        if (!mountedRef.current) return;

        debug(() => ["[markra-history] restore failed", {
          documentPath,
          historyId: entry.id,
          error: error instanceof Error ? error.message : String(error)
        }]);
        setRestoreError(true);
        setRestorePendingId(null);
      });
  };

  return (
    <section
      aria-label={label("app.documentHistory")}
      className="fixed right-3 z-40 grid w-[min(22rem,calc(100vw-1rem))] animate-[markra-history-panel-in_140ms_cubic-bezier(0.2,0,0,1)_both] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-(--border-default) bg-(--bg-primary) shadow-xl motion-reduce:animate-none"
      ref={panelRef}
      role="region"
      style={{
        maxHeight: `min(420px, calc(100vh - ${panelTopPx + documentHistoryPanelGapPx}px))`,
        top: panelTopPx
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
      <div className="min-h-0 overflow-auto bg-(--bg-secondary) p-2">
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
              const pending = entry.id === restorePendingId;

              return (
                <button
                  aria-selected={selected}
                  disabled={restorePendingId !== null}
                  className={`grid w-full min-w-0 rounded-md px-2 py-2 text-left transition-colors duration-150 ease-out ${
                    selected || pending
                      ? "bg-(--bg-active) text-(--text-heading)"
                      : "text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading)"
                  } disabled:cursor-default disabled:opacity-70`}
                  key={entry.id}
                  role="option"
                  type="button"
                  onClick={() => restoreEntry(entry)}
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
            {restoreError ? (
              <p className="m-0 px-2 py-2 text-[12px] leading-5 text-(--text-secondary)">
                {label("app.historyLoadFailed")}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
