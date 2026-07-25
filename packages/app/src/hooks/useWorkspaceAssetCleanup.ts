import { useCallback, useEffect, useRef, useState } from "react";
import {
  listNativeMarkdownFilesForPath,
  listNativeMarkdownReferenceFilesForPath,
  readNativeMarkdownFile,
  trashNativeMarkdownAssets
} from "../lib/tauri";
import { normalizeComparablePath } from "../lib/path-move";
import {
  buildWorkspaceAssetIndex,
  type WorkspaceAssetDocumentContent,
  type WorkspaceAssetFile,
  type WorkspaceAssetIndex
} from "../lib/workspace-assets";

export type WorkspaceAssetCleanupError = "changed" | "scan" | "trash";

type UseWorkspaceAssetCleanupOptions = {
  getDirtyDocuments?: () => readonly WorkspaceAssetDocumentContent[];
  globalIgnoreRules?: string | null;
  managedFolder: string;
  onTreeRefresh: (rootPath: string) => unknown | Promise<unknown>;
  rootPath: string | null;
};

function assetPathSet(assets: readonly WorkspaceAssetFile[]) {
  return new Set(
    assets.flatMap((asset) => {
      const path = normalizeComparablePath(asset.path);
      return path ? [path.toLocaleLowerCase()] : [];
    })
  );
}

function assetSnapshotMatches(left: WorkspaceAssetFile, right: WorkspaceAssetFile) {
  return left.sizeBytes === right.sizeBytes && left.modifiedAt === right.modifiedAt;
}

function cleanupSnapshot(file: WorkspaceAssetFile) {
  return {
    modifiedAt: file.modifiedAt,
    path: file.path,
    sizeBytes: file.sizeBytes
  };
}

function dirtyDocumentsMatch(
  left: readonly WorkspaceAssetDocumentContent[],
  right: readonly WorkspaceAssetDocumentContent[]
) {
  if (left.length !== right.length) return false;

  const rightByPath = new Map(right.map((document) => [
    normalizeComparablePath(document.path)?.normalize("NFC").toLocaleLowerCase(),
    document.content
  ]));
  return left.every((document) => {
    const path = normalizeComparablePath(document.path)?.normalize("NFC").toLocaleLowerCase();
    return path !== undefined && rightByPath.get(path) === document.content;
  });
}

export function useWorkspaceAssetCleanup({
  getDirtyDocuments,
  globalIgnoreRules,
  managedFolder,
  onTreeRefresh,
  rootPath
}: UseWorkspaceAssetCleanupOptions) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<WorkspaceAssetCleanupError | null>(null);
  const [index, setIndex] = useState<WorkspaceAssetIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [trashing, setTrashing] = useState(false);
  const requestIdRef = useRef(0);

  const scanWorkspace = useCallback(async () => {
    if (!rootPath) throw new Error("A workspace is required for image cleanup.");

    const [assets, documents] = await Promise.all([
      listNativeMarkdownFilesForPath(rootPath, {
        globalIgnoreRules,
        managedAttachmentFolder: managedFolder
      }),
      listNativeMarkdownReferenceFilesForPath(rootPath)
    ]);
    const dirtyDocuments = getDirtyDocuments?.() ?? [];

    const nextIndex = await buildWorkspaceAssetIndex({
      assets,
      dirtyDocuments,
      documents,
      managedFolder,
      readFile: async (path) => {
        const file = await readNativeMarkdownFile(path);
        return { content: file.content, path: file.path };
      }
    });

    return { dirtyDocuments, index: nextIndex };
  }, [getDirtyDocuments, globalIgnoreRules, managedFolder, rootPath]);

  const applyIndex = useCallback((nextIndex: WorkspaceAssetIndex) => {
    setIndex(nextIndex);
    setRevision((current) => current + 1);
  }, []);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const { index: nextIndex } = await scanWorkspace();
      if (requestId !== requestIdRef.current) return;

      applyIndex(nextIndex);
    } catch {
      if (requestId === requestIdRef.current) setError("scan");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [applyIndex, scanWorkspace]);

  const openDialog = useCallback(async () => {
    setDialogOpen(true);
    await refresh();
  }, [refresh]);

  const closeDialog = useCallback(() => {
    if (!trashing) setDialogOpen(false);
  }, [trashing]);

  const trashAssets = useCallback(async (selectedAssets: readonly WorkspaceAssetFile[]) => {
    if (!rootPath || selectedAssets.length === 0) return;

    setTrashing(true);
    setError(null);

    try {
      // Re-scan immediately before mutation so a newly added Markdown reference cannot
      // turn a stale cleanup preview into accidental data loss.
      const freshScan = await scanWorkspace();
      const freshIndex = freshScan.index;
      applyIndex(freshIndex);

      const selectedPaths = assetPathSet(selectedAssets);
      const freshUnusedPaths = assetPathSet(freshIndex.unusedAssets);
      const selectionIsStillUnused = Array.from(selectedPaths).every((path) => freshUnusedPaths.has(path));
      const freshAssetsByPath = new Map(
        freshIndex.unusedAssets.flatMap((asset) => {
          const path = normalizeComparablePath(asset.path);
          return path ? [[path.toLocaleLowerCase(), asset] as const] : [];
        })
      );
      const selectionIsUnchanged = selectedAssets.every((asset) => {
        const path = normalizeComparablePath(asset.path)?.toLocaleLowerCase();
        const freshAsset = path ? freshAssetsByPath.get(path) : null;
        return freshAsset ? assetSnapshotMatches(asset, freshAsset) : false;
      });
      if (
        !selectionIsStillUnused ||
        !selectionIsUnchanged ||
        freshIndex.unreadableDocuments.length > 0 ||
        !dirtyDocumentsMatch(freshScan.dirtyDocuments, getDirtyDocuments?.() ?? [])
      ) {
        setError("changed");
        return;
      }

      const summary = await trashNativeMarkdownAssets({
        documents: freshIndex.scannedDocuments.map(cleanupSnapshot),
        managedFolder,
        rootPath,
        targets: selectedAssets.map(cleanupSnapshot)
      });
      if (summary.failures.length > 0) setError("trash");

      await onTreeRefresh(rootPath);
      applyIndex((await scanWorkspace()).index);
    } catch {
      setError("trash");
    } finally {
      setTrashing(false);
    }
  }, [applyIndex, managedFolder, onTreeRefresh, rootPath, scanWorkspace]);

  useEffect(() => {
    requestIdRef.current += 1;
    setDialogOpen(false);
    setError(null);
    setIndex(null);
    setLoading(false);
    setTrashing(false);
  }, [rootPath]);

  return {
    closeDialog,
    dialogOpen,
    error,
    index,
    loading,
    openDialog,
    refresh,
    revision,
    trashAssets,
    trashing
  };
}
