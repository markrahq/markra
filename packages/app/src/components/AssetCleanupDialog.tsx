import { useEffect, useMemo, useState } from "react";
import { Clock3, RefreshCw, Trash2, X } from "lucide-react";
import { createMarkdownImageSrcResolver } from "@markra/markdown";
import { t, type AppLanguage, type I18nKey } from "@markra/shared";
import { Button, IconButton } from "@markra/ui";
import type { WorkspaceAssetFile, WorkspaceAssetIndex } from "../lib/workspace-assets";
import type { WorkspaceAssetCleanupError } from "../hooks/useWorkspaceAssetCleanup";

const recentAssetAgeMs = 7 * 24 * 60 * 60 * 1000;

export type AssetCleanupDialogProps = {
  error?: WorkspaceAssetCleanupError | null;
  index: WorkspaceAssetIndex | null;
  language?: AppLanguage;
  loading?: boolean;
  onClose: () => unknown;
  onRefresh: () => unknown | Promise<unknown>;
  onTrash: (assets: readonly WorkspaceAssetFile[]) => unknown | Promise<unknown>;
  trashing?: boolean;
};

function formatMessage(message: string, count: number) {
  return message.replaceAll("{count}", String(count));
}

function formatAssetSize(bytes: number | undefined) {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isRecentAsset(asset: WorkspaceAssetFile) {
  return asset.modifiedAt !== undefined && Date.now() - asset.modifiedAt < recentAssetAgeMs;
}

function isAutomaticallySelectableAsset(asset: WorkspaceAssetFile) {
  return asset.modifiedAt !== undefined && !isRecentAsset(asset);
}

function assetPreviewSource(path: string) {
  return createMarkdownImageSrcResolver(path)(path);
}

export function AssetCleanupDialog({
  error = null,
  index,
  language = "en",
  loading = false,
  onClose,
  onRefresh,
  onTrash,
  trashing = false
}: AssetCleanupDialogProps) {
  const label = (key: I18nKey) => t(language, key);
  const unusedAssets = index?.unusedAssets ?? [];
  const initialSelection = useMemo(
    () => unusedAssets.filter(isAutomaticallySelectableAsset).map((asset) => asset.path),
    [unusedAssets]
  );
  const [selectedPaths, setSelectedPaths] = useState(() => new Set(initialSelection));
  const selectedAssets = unusedAssets.filter((asset) => selectedPaths.has(asset.path));
  const unreadableCount = index?.unreadableDocuments.length ?? 0;
  const cleanupDisabled = loading || trashing || selectedAssets.length === 0 || unreadableCount > 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !trashing) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, trashing]);

  const toggleAsset = (assetPath: string) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(assetPath)) next.delete(assetPath);
      else next.add(assetPath);
      return next;
    });
  };

  const unusedLabel = formatMessage(
    label(unusedAssets.length === 1 ? "app.assetCleanup.unusedSingular" : "app.assetCleanup.unusedPlural"),
    unusedAssets.length
  );
  const trashLabel = formatMessage(
    label(selectedAssets.length === 1 ? "app.assetCleanup.trashSingular" : "app.assetCleanup.trashPlural"),
    selectedAssets.length
  );

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/20 p-3">
      <section
        aria-label={label("app.assetCleanup.title")}
        aria-modal="true"
        className="flex max-h-[min(72vh,560px)] w-[min(560px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg bg-(--bg-primary) text-(--text-primary) shadow-[0_18px_50px_color-mix(in_srgb,var(--text-heading)_22%,transparent)]"
        role="dialog"
      >
        <header className="flex h-10 items-center gap-0.5 border-b border-(--border-default) px-3">
          <h2 className="m-0 min-w-0 flex-1 truncate text-[13px] leading-5 font-[650] text-(--text-heading)">
            {label("app.assetCleanup.title")}
          </h2>
          <IconButton
            disabled={loading || trashing}
            label={label("app.assetCleanup.refresh")}
            size="icon-sm"
            onClick={() => void onRefresh()}
          >
            <RefreshCw aria-hidden="true" className={loading ? "animate-spin" : undefined} size={14} />
          </IconButton>
          <IconButton
            disabled={trashing}
            label={label("app.assetCleanup.close")}
            size="icon-sm"
            onClick={onClose}
          >
            <X aria-hidden="true" size={15} />
          </IconButton>
        </header>

        <div className="min-h-0 overflow-y-auto bg-(--bg-secondary)">
          {loading ? (
            <div className="flex min-h-20 items-center justify-center gap-2 px-4 text-[12px] leading-5 text-(--text-secondary)" role="status">
              <RefreshCw aria-hidden="true" className="animate-spin motion-reduce:animate-none" size={14} />
              {label("app.assetCleanup.scanning")}
            </div>
          ) : (
            <>
              {unusedAssets.length > 0 ? (
                <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-(--border-default) px-3 py-1.5">
                  <strong className="text-[12px] leading-5 font-[650] text-(--text-heading)">
                    {unusedLabel}
                  </strong>
                  <span className="text-[11px] leading-4 text-(--text-secondary)">
                    {formatMessage(label("app.assetCleanup.scanned"), index?.scannedDocumentCount ?? 0)}
                  </span>
                </div>
              ) : null}

              {error ? (
                <p
                  className="mx-3 mt-3 mb-0 rounded-md bg-(--danger)/10 px-3 py-2 text-[12px] leading-5 text-(--danger)"
                  role="alert"
                >
                  {label(`app.assetCleanup.error.${error}` as I18nKey)}
                </p>
              ) : null}

              {unreadableCount > 0 ? (
                <p className="mx-3 mt-3 mb-0 rounded-md bg-(--bg-active) px-3 py-2 text-[12px] leading-5 text-(--text-primary)">
                  {formatMessage(
                    label(
                      unreadableCount === 1
                        ? "app.assetCleanup.unreadableSingular"
                        : "app.assetCleanup.unreadablePlural"
                    ),
                    unreadableCount
                  )}
                </p>
              ) : null}

              {unusedAssets.length > 0 ? (
                <ul className="m-0 list-none p-2">
                  {unusedAssets.map((asset) => {
                    const recent = isRecentAsset(asset);
                    const selected = selectedPaths.has(asset.path);

                    return (
                      <li
                        className="border-b border-(--border-default) last:border-b-0"
                        key={asset.path}
                      >
                        <label
                          className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors duration-150 ease-out ${
                            selected ? "bg-(--bg-active)" : "hover:bg-(--bg-hover)"
                          }`}
                        >
                          <input
                            aria-label={asset.name}
                            checked={selected}
                            className="size-4 shrink-0 accent-(--accent)"
                            type="checkbox"
                            onChange={() => toggleAsset(asset.path)}
                          />
                          <div className="size-12 shrink-0 overflow-hidden rounded-sm bg-(--bg-primary) ring-1 ring-(--border-default)">
                            <img
                              alt={asset.name}
                              className="h-full w-full object-contain"
                              loading="lazy"
                              src={assetPreviewSource(asset.path)}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] leading-5 font-[650] text-(--text-heading)">
                              {asset.name}
                            </span>
                            <span className="block truncate font-mono text-[10px] leading-4 text-(--text-secondary)">
                              {asset.relativePath}
                              {asset.sizeBytes === undefined ? "" : ` · ${formatAssetSize(asset.sizeBytes)}`}
                            </span>
                            {recent ? (
                              <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] leading-4 text-(--text-secondary)">
                                <Clock3 aria-hidden="true" size={11} />
                                {label("app.assetCleanup.recent")}
                              </span>
                            ) : null}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : index ? (
                <div className="flex min-h-24 flex-col items-center justify-center px-5 py-5 text-center">
                  <p className="m-0 text-[12px] leading-5 font-[560] text-(--text-primary)">
                    {label("app.assetCleanup.empty")}
                  </p>
                  <span className="text-[11px] leading-4 text-(--text-secondary)">
                    {formatMessage(label("app.assetCleanup.scanned"), index.scannedDocumentCount)}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {unusedAssets.length > 0 ? (
          <footer className="flex min-h-12 items-center justify-end border-t border-(--border-default) px-3 py-2">
            <Button
              aria-label={trashLabel}
              disabled={cleanupDisabled}
              size="sm"
              variant="primary"
              onClick={() => void onTrash(selectedAssets)}
            >
              <Trash2 aria-hidden="true" size={14} />
              {trashing ? label("app.assetCleanup.trashing") : trashLabel}
            </Button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
