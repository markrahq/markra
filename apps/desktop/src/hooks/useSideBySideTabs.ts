import { useCallback, useEffect, useMemo, useState } from "react";
import type { MarkdownTabsBarDocumentItem, MarkdownTabsBarItem } from "../components/MarkdownTabsBar";
import type { StoredWorkspaceSideBySideGroup, StoredWorkspaceState } from "../lib/settings/app-settings";
import type { MarkdownDocumentTab } from "./useMarkdownDocument";

export type DocumentOperationTarget = "main" | "side";
export type SideDocumentGroup = {
  primaryTabId: string;
  sideTabId: string;
};
export type SideDocumentGroupPathUpdate = {
  nextPath: string;
  previousPath?: string;
  tabId?: string;
};

type StoredSideBySideWorkspace = Pick<StoredWorkspaceState, "openFilePaths" | "sideBySideGroup">;

type OpenSideDocumentGroupOptions = {
  primaryFilePath: string | null;
  primaryTabId: string;
  sideFilePath: string | null;
  sideTabId: string;
};

type UseSideBySideTabsOptions = {
  activeImageFileOpen: boolean;
  activeTabId: string | null;
  documentTabs: MarkdownDocumentTab[];
  documentTabsEnabled: boolean;
  hasOpenDocument: boolean;
  loadStoredWorkspaceState: () => Promise<StoredSideBySideWorkspace>;
  persistSideDocumentGroup: (group: StoredWorkspaceSideBySideGroup | null) => unknown;
  restoreReady: boolean;
  restoreWorkspaceOnStartup: boolean;
  titlebarTabs: MarkdownTabsBarDocumentItem[];
};

type PendingRestoredSideDocumentGroup = {
  group: StoredWorkspaceSideBySideGroup;
  openFilePaths: string[];
};

export function useSideBySideTabs({
  activeImageFileOpen,
  activeTabId,
  documentTabs,
  documentTabsEnabled,
  hasOpenDocument,
  loadStoredWorkspaceState,
  persistSideDocumentGroup,
  restoreReady,
  restoreWorkspaceOnStartup,
  titlebarTabs
}: UseSideBySideTabsOptions) {
  const [documentOperationTarget, setDocumentOperationTarget] = useState<DocumentOperationTarget>("main");
  const [sideDocumentGroup, setSideDocumentGroup] = useState<SideDocumentGroup | null>(null);
  const [pendingRestoredSideDocumentGroup, setPendingRestoredSideDocumentGroup] =
    useState<PendingRestoredSideDocumentGroup | null>(null);

  const clearSideDocumentGroup = useCallback(() => {
    setSideDocumentGroup(null);
    persistSideDocumentGroup(null);
    setDocumentOperationTarget("main");
  }, [persistSideDocumentGroup]);

  const openSideDocumentGroup = useCallback((group: OpenSideDocumentGroupOptions) => {
    if (
      !documentTabsEnabled ||
      group.primaryTabId === group.sideTabId ||
      !group.primaryFilePath ||
      !group.sideFilePath ||
      group.primaryFilePath === group.sideFilePath
    ) {
      return;
    }

    setSideDocumentGroup({
      primaryTabId: group.primaryTabId,
      sideTabId: group.sideTabId
    });
    persistSideDocumentGroup({
      primaryFilePath: group.primaryFilePath,
      sideFilePath: group.sideFilePath
    });
  }, [documentTabsEnabled, persistSideDocumentGroup]);

  const persistSideDocumentGroupPathUpdate = useCallback((update: SideDocumentGroupPathUpdate) => {
    if (!sideDocumentGroup) return;

    const primaryTab = documentTabs.find((tab) => tab.id === sideDocumentGroup.primaryTabId);
    const sideTab = documentTabs.find((tab) => tab.id === sideDocumentGroup.sideTabId);
    const resolveUpdatedPath = (tab: MarkdownTabsBarDocumentItem | undefined) => {
      if (!tab?.path) return null;
      if (update.tabId && tab.id === update.tabId) return update.nextPath;
      if (update.previousPath && tab.path === update.previousPath) return update.nextPath;
      return tab.path;
    };
    const primaryFilePath = resolveUpdatedPath(primaryTab);
    const sideFilePath = resolveUpdatedPath(sideTab);

    persistSideDocumentGroup(
      primaryFilePath && sideFilePath && primaryFilePath !== sideFilePath
        ? {
          primaryFilePath,
          sideFilePath
        }
        : null
    );
  }, [documentTabs, persistSideDocumentGroup, sideDocumentGroup]);

  const persistSideDocumentGroupSavedTabPath = useCallback((tabId: string, nextPath: string) => {
    const tab = documentTabs.find((candidate) => candidate.id === tabId);
    if (tab?.path === nextPath) return;

    persistSideDocumentGroupPathUpdate({ nextPath, tabId });
  }, [documentTabs, persistSideDocumentGroupPathUpdate]);

  const sideDocumentTab = sideDocumentGroup
    ? documentTabs.find((tab) => tab.id === sideDocumentGroup.sideTabId) ?? null
    : null;
  const sideDocumentOpen =
    Boolean(sideDocumentTab) &&
    hasOpenDocument &&
    !activeImageFileOpen &&
    activeTabId === sideDocumentGroup?.primaryTabId;
  const focusedSideDocumentTabId =
    documentOperationTarget === "side" && sideDocumentOpen && sideDocumentGroup
      ? sideDocumentGroup.sideTabId
      : null;

  const titlebarItems = useMemo<MarkdownTabsBarItem[]>(() => {
    if (!sideDocumentGroup) return titlebarTabs;

    const primaryTab = titlebarTabs.find((tab) => tab.id === sideDocumentGroup.primaryTabId);
    const secondaryTab = titlebarTabs.find((tab) => tab.id === sideDocumentGroup.sideTabId);
    if (!primaryTab || !secondaryTab) return titlebarTabs;

    const groupedIds = new Set([primaryTab.id, secondaryTab.id]);
    const groupedItems: MarkdownTabsBarItem[] = [];
    for (const tab of titlebarTabs) {
      if (tab.id === primaryTab.id) {
        groupedItems.push([primaryTab, secondaryTab]);
        continue;
      }

      if (!groupedIds.has(tab.id)) groupedItems.push(tab);
    }

    return groupedItems;
  }, [sideDocumentGroup, titlebarTabs]);

  useEffect(() => {
    if (!restoreReady || !restoreWorkspaceOnStartup || !documentTabsEnabled) return;

    let active = true;

    loadStoredWorkspaceState().then((workspace) => {
      if (!active || !workspace.sideBySideGroup) return;

      setPendingRestoredSideDocumentGroup({
        group: workspace.sideBySideGroup,
        openFilePaths: workspace.openFilePaths
      });
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [
    documentTabsEnabled,
    loadStoredWorkspaceState,
    restoreReady,
    restoreWorkspaceOnStartup
  ]);

  useEffect(() => {
    if (!documentTabsEnabled) {
      if (pendingRestoredSideDocumentGroup) setPendingRestoredSideDocumentGroup(null);
      return;
    }

    if (!pendingRestoredSideDocumentGroup || sideDocumentGroup) return;

    const primaryTab = documentTabs.find((tab) => tab.path === pendingRestoredSideDocumentGroup.group.primaryFilePath);
    const sideTab = documentTabs.find((tab) => tab.path === pendingRestoredSideDocumentGroup.group.sideFilePath);
    if (primaryTab && sideTab) {
      setSideDocumentGroup({
        primaryTabId: primaryTab.id,
        sideTabId: sideTab.id
      });
      setPendingRestoredSideDocumentGroup(null);
      return;
    }

    const openRestoredPaths = new Set(pendingRestoredSideDocumentGroup.openFilePaths);
    const restoredTabsReady = documentTabs.some((tab) => tab.path !== null && openRestoredPaths.has(tab.path));
    if (restoredTabsReady) setPendingRestoredSideDocumentGroup(null);
  }, [documentTabs, documentTabsEnabled, pendingRestoredSideDocumentGroup, sideDocumentGroup]);

  useEffect(() => {
    if (!sideDocumentGroup) return;

    const primaryExists = documentTabs.some((tab) => tab.id === sideDocumentGroup.primaryTabId);
    const sideExists = documentTabs.some((tab) => tab.id === sideDocumentGroup.sideTabId);
    if (!documentTabsEnabled || sideDocumentGroup.primaryTabId === sideDocumentGroup.sideTabId || !primaryExists || !sideExists) {
      clearSideDocumentGroup();
    }
  }, [clearSideDocumentGroup, documentTabs, documentTabsEnabled, sideDocumentGroup]);

  useEffect(() => {
    if (!sideDocumentOpen && documentOperationTarget === "side") setDocumentOperationTarget("main");
  }, [documentOperationTarget, sideDocumentOpen]);

  return {
    clearSideDocumentGroup,
    documentOperationTarget,
    focusedSideDocumentTabId,
    openSideDocumentGroup,
    persistSideDocumentGroupPathUpdate,
    persistSideDocumentGroupSavedTabPath,
    setDocumentOperationTarget,
    sideDocumentGroup,
    sideDocumentOpen,
    sideDocumentTab,
    titlebarItems
  };
}
