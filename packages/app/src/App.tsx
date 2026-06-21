import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUIEvent
} from "react";
import { flushSync } from "react-dom";
import { AppToaster } from "./components/AppToaster";
import { AiCommandBar } from "./components/AiCommandBar";
import { AiAgentPanel } from "./components/AiAgentPanel";
import { AiSelectionToolbar } from "./components/AiSelectionToolbar";
import { DocumentHistoryDialog } from "./components/DocumentHistoryDialog";
import { DocumentSearchBar } from "./components/DocumentSearchBar";
import { GlobalSearchPanel } from "./components/GlobalSearchPanel";
import { ImagePreview } from "./components/ImagePreview";
import { LargeMarkdownNotice } from "./components/LargeMarkdownNotice";
import {
  MarkdownExportDocument,
  type RenderedMarkdownExport,
  type MarkdownExportSnapshot
} from "./components/MarkdownExportDocument";
import { MarkdownPaper } from "./components/MarkdownPaper";
import { LazyMarkdownSourceEditor } from "./components/LazyMarkdownSourceEditor";
import {
  MarkdownTabsBar,
  markdownTabDragDataType,
  type MarkdownTabsBarDocumentItem
} from "./components/MarkdownTabsBar";
import { NativeTitleBar } from "./components/NativeTitleBar";
import { QuietStatus } from "./components/QuietStatus";
import { QuickOpenPanel } from "./components/QuickOpenPanel";
import { SideDocumentPane } from "./components/SideDocumentPane";
import { SettingsWindow } from "./components/SettingsWindow";
import { WorkspaceLayout } from "./components/WorkspaceLayout";
import { useAppLanguage } from "./hooks/useAppLanguage";
import { useAppTheme } from "./hooks/useAppTheme";
import { useAiCommandUi } from "./hooks/useAiCommandUi";
import {
  shouldHideAiCommandForAiAgentPanel,
  shouldHideSelectionToolbarForAiAgentPanel
} from "./hooks/ai-agent-panel-visibility";
import {
  aiAgentPanelMaxWidth,
  aiAgentPanelMinWidth,
  useAiAgentPanelState
} from "./hooks/useAiAgentPanelState";
import { useAiAgentSessionList } from "./hooks/useAiAgentSessionList";
import { useAiAgentSession } from "./hooks/useAiAgentSession";
import { useAiSettings } from "./hooks/useAiSettings";
import { useDocumentSearchState } from "./hooks/useDocumentSearchState";
import { useEditorContentWidthState } from "./hooks/useEditorContentWidthState";
import { useEditorPreferences } from "./hooks/useEditorPreferences";
import { useDeferredAiSelectionReveal } from "./hooks/ai-selection-reveal";
import { useExportSettings } from "./hooks/useExportSettings";
import { shouldFocusEditorOnReady, useEditorController } from "./hooks/useEditorController";
import { useMarkdownDocument } from "./hooks/useMarkdownDocument";
import { useMarkdownFileTree } from "./hooks/useMarkdownFileTree";
import { useSelectionToolbarAnchorRefresh } from "./hooks/useSelectionToolbarAnchorRefresh";
import { useSharedEditorHistory } from "./hooks/useSharedEditorHistory";
import { useSideBySideTabs } from "./hooks/useSideBySideTabs";
import { useAutoUpdater } from "./hooks/useAutoUpdater";
import { useBackupSettings } from "./hooks/useBackupSettings";
import { useDefaultContextMenuBlocker } from "./hooks/useDefaultContextMenuBlocker";
import { useSyncSettings } from "./hooks/useSyncSettings";
import { useWebSearchSettings } from "./hooks/useWebSearchSettings";
import { useSettingsWindowRoute } from "./hooks/useSettingsWindowRoute";
import { useStartupWindowReveal } from "./hooks/useStartupWindowReveal";
import { useWorkspaceBackupSync } from "./hooks/useWorkspaceBackupSync";
import { useWorkspaceSearch } from "./hooks/useWorkspaceSearch";
import {
  useApplicationShortcuts,
  useNativeMarkdownDrop,
  useNativeMenuHandlers,
  useNativeMenus
} from "./hooks/useNativeBindings";
import type { Editor as MilkdownEditor } from "@milkdown/kit/core";
import {
  aiTranslationLanguageName,
  clampNumber,
  debug,
  t,
  type I18nKey
} from "@markra/shared";
import { showAppToast } from "./lib/app-toast";
import { createMarkdownImageSrcResolver, getWordCount } from "@markra/markdown";
import { buildMarkdownHtmlDocument, exportDocumentFileName, localFileUrlFromPath } from "./lib/document-export";
import { resolveMarkdownDocumentLinkFile } from "./lib/document-links";
import { saveEditorImage } from "./lib/image-upload";
import { aiCommandSelection, automaticAiSelection } from "./lib/ai-selection";
import { shouldBlockLargeMarkdownVisual } from "./lib/large-markdown";
import { markAppPerformance } from "./lib/performance-marks";
import { replaceMovedPath, sameNativePath } from "./lib/path-move";
import {
  resolveDesktopOsVersion,
  resolveDesktopPlatform,
  webKitScrollWorkaroundForPlatform
} from "./lib/platform";
import { selectionAnchorFromDomSelection, type SelectionAnchor } from "./lib/selection-anchor";
import { runEditorLinkCommand } from "./app/editor-link-command";
import { isPandocSetupError, runPandocSetupAction } from "./app/pandoc-setup";
import type { WorkspaceSearchResult } from "./lib/workspace-search";
import type {
  SelectionHeadingLevel,
  SelectionFormattingAction,
  SelectionFormattingToolbarAction
} from "./lib/selection-formatting";
import {
  closeNativeWindow,
  openNativeExternalUrl,
  openSettingsWindow,
  showNativeAppAbout,
  toggleNativeWindowFullscreen,
  toggleNativeWindowMaximized
} from "./lib/tauri";
import { aiAgentWebSearchAvailable, type AiDiffResult, type AiEditIntent, type AiSelectionContext } from "@markra/ai";
import {
  AI_EDITOR_PREVIEW_APPLIED_EVENT,
  AI_EDITOR_PREVIEW_ACTION_EVENT,
  AI_EDITOR_PREVIEW_RESTORE_EVENT,
  markdownShortcutToKeyboardEventInit,
  normalizeMarkdownShortcuts,
  type AiEditorPreviewAppliedDetail,
  type AiEditorPreviewActionDetail,
  type AiEditorPreviewRestoreDetail,
  type RemoteClipboardImage
} from "@markra/editor";
import {
  createAiAgentSessionId,
  defaultSplitVisualPanePercent,
  deleteStoredAiAgentSession,
  getStoredWorkspaceState,
  initializeStoredAiAgentSession,
  splitVisualPanePercentMax,
  splitVisualPanePercentMin,
  saveStoredEditorPreferences,
  saveStoredAiAgentSessionTitle,
  saveStoredWorkspaceState,
  setStoredAiAgentSessionArchived,
  type RecentMarkdownFile,
  type RecentMarkdownFolder,
  type StoredWorkspaceSideBySideGroup,
  type TitlebarActionPreference
} from "./lib/settings/app-settings";
import {
  notifyAppEditorPreferencesChanged
} from "./lib/settings/settings-events";
import { getAppRuntime } from "./runtime";
import {
  confirmNativeMarkdownFileDelete,
  confirmNativeUnsavedMarkdownDocumentDiscard,
  downloadNativeWebImage,
  openNativeContainingFolder,
  readNativeMarkdownImageFile,
  readNativeMarkdownFile,
  readNativeMarkdownTemplateFile,
  saveNativeHtmlFile,
  saveNativePandocFile,
  saveNativePdfFile,
  showNativePandocSetup,
  writeNativeMarkdownTemplateFile,
  type NativeMarkdownFolderFile,
  type NativePandocExportFormat
} from "./lib/tauri";
import {
  createCustomMarkdownTemplateFromFile,
  loadMarkdownTemplatesFromEntries,
  markdownTemplateEntryFromTemplate,
  type MarkdownTemplate
} from "./lib/templates";
import {
  aiPreviewActionKey,
  aiResultSignature,
  createImageDocumentTab,
  defaultSaveDirectoryFromFileTree,
  documentTabAsFolderFile,
  imageDocumentTabId,
  replaceTextRange,
  replaceTextRanges,
  restoreElementScrollTop,
  selectionAnchorsEqual,
  unsavedMarkdownFileNameFromTreeInput,
  type ImageDocumentTab
} from "./app/workspace-model";

const splitPaneKeyboardStepPercent = 5;
const aiSelectionCopySuccessMs = 1600;
const sideDocumentPaneKeyboardStepPercent = 5;
const sideDocumentMainPanePercentMin = 35;
const sideDocumentMainPanePercentMax = 70;
const defaultSideDocumentMainPanePercent = 50;

function persistSideDocumentGroup(group: StoredWorkspaceSideBySideGroup | null) {
  saveStoredWorkspaceState({ sideBySideGroup: group }).catch(() => {});
}

type AiQuickActionIntent = Exclude<AiEditIntent, "custom">;
type EditorMode = "source" | "split" | "visual";
type EditorSurface = "source" | "visual";
type DocumentTabViewState = {
  sourceScrollTop?: number;
  visualScrollTop?: number;
};
type PendingEditorModeScroll = {
  progress: number;
  tabId: string;
  targetSurface: EditorSurface;
};

export { runEditorLinkCommand } from "./app/editor-link-command";
export { globalSearchDebounceMs } from "./hooks/useWorkspaceSearch";

export default function App() {
  const isSettingsRoute = useSettingsWindowRoute();

  return isSettingsRoute ? <SettingsRouteApp /> : <WorkspaceApp />;
}

function SettingsRouteApp() {
  useStartupWindowReveal({ ready: true });

  return <SettingsWindow />;
}

function WorkspaceApp() {
  const desktopPlatform = resolveDesktopPlatform();
  const desktopOsVersion = resolveDesktopOsVersion();
  const webKitScrollWorkaround = webKitScrollWorkaroundForPlatform(desktopPlatform, desktopOsVersion);
  const appFeatures = getAppRuntime().features;
  const aiFeatureEnabled = appFeatures.ai;
  const exportFeatureEnabled = appFeatures.export;
  const nativeWindowChromeEnabled = appFeatures.nativeWindowChrome && desktopPlatform !== "linux";
  const windowsSelfDrawnChromeEnabled = nativeWindowChromeEnabled && desktopPlatform === "windows";
  const pandocFeatureEnabled = appFeatures.pandoc;
  const s3ImageUploadFeatureEnabled = appFeatures.s3ImageUpload;
  const updaterFeatureEnabled = appFeatures.updater;
  const appTheme = useAppTheme();
  const appLanguage = useAppLanguage();
  const aiSettings = useAiSettings();
  const backupSettings = useBackupSettings();
  const syncSettings = useSyncSettings();
  const editorPreferences = useEditorPreferences();
  const exportSettings = useExportSettings();
  const webSearchSettings = useWebSearchSettings();
  const [markdownTemplates, setMarkdownTemplates] = useState<MarkdownTemplate[]>([]);
  const [aiAgentSessionId, setAiAgentSessionId] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<AiDiffResult[]>([]);
  const [activeImageFile, setActiveImageFile] = useState<NativeMarkdownFolderFile | null>(null);
  const [imageTabs, setImageTabs] = useState<ImageDocumentTab[]>([]);
  const [activeAiSelection, setActiveAiSelection] = useState<AiSelectionContext | null>(null);
  const [selectedWordCount, setSelectedWordCount] = useState<number | null>(null);
  const [aiCommandOverlayInset, setAiCommandOverlayInset] = useState(0);
  const [aiSelectionToolbarAnchor, setAiSelectionToolbarAnchor] = useState<SelectionAnchor | null>(null);
  const [aiSelectionToolbarActiveActions, setAiSelectionToolbarActiveActions] = useState<SelectionFormattingAction[]>([]);
  const [aiSelectionToolbarHeadingLevel, setAiSelectionToolbarHeadingLevel] = useState<SelectionHeadingLevel | null>(null);
  const [aiSelectionToolbarCopySucceeded, setAiSelectionToolbarCopySucceeded] = useState(false);
  const [aiContextMenuActionPending, setAiContextMenuActionPending] = useState(false);
  const [activeOutlineIndex, setActiveOutlineIndex] = useState<number | null>(null);
  const setAiSelectionToolbarAnchorIfChanged = useCallback((nextAnchor: SelectionAnchor | null) => {
    setAiSelectionToolbarAnchor((currentAnchor) =>
      selectionAnchorsEqual(currentAnchor, nextAnchor) ? currentAnchor : nextAnchor
    );
  }, []);
  const [editorMode, setEditorMode] = useState<EditorMode>("visual");
  const [activeEditorSurface, setActiveEditorSurface] = useState<EditorSurface>("visual");
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [documentHistoryOpen, setDocumentHistoryOpen] = useState(false);
  const [documentHistoryRefreshKey, setDocumentHistoryRefreshKey] = useState(0);
  const [splitVisualPanePercent, setSplitVisualPanePercent] = useState(defaultSplitVisualPanePercent);
  const [sideDocumentMainPanePercent, setSideDocumentMainPanePercent] = useState(defaultSideDocumentMainPanePercent);
  const [editorTabDropTargetActive, setEditorTabDropTargetActive] = useState(false);
  const [visualEditorReadySequence, setVisualEditorReadySequence] = useState(0);
  const [exportSnapshot, setExportSnapshot] = useState<MarkdownExportSnapshot | null>(null);
  const sourceMode = editorMode === "source";
  const splitMode = editorMode === "split";
  const sourceSurfaceActive = sourceMode || (splitMode && activeEditorSurface === "source");
  const aiResultsRef = useRef<AiDiffResult[]>([]);
  const appliedAiPreviewKeysRef = useRef(new Set<string>());
  const activeAiSelectionRef = useRef<AiSelectionContext | null>(null);
  const aiContextMenuActionIdRef = useRef(0);
  const aiSelectionCopySuccessTimerRef = useRef<number | null>(null);
  const exportRequestIdRef = useRef(0);
  const pendingSplitVisualPanePercentRef = useRef(defaultSplitVisualPanePercent);
  const pendingSideDocumentMainPanePercentRef = useRef(defaultSideDocumentMainPanePercent);
  const lastDocumentSearchRevealRevisionRef = useRef(0);
  const documentRevisionRef = useRef(0);
  const visualEditorReadyRevisionRef = useRef<number | null>(null);
  const visualEditorReadyDetailRef = useRef({
    chars: 0,
    path: null as string | null,
    sizeBytes: null as number | null
  });
  const largeMarkdownVisualBlockedRef = useRef(false);
  const mainDocumentPaneRef = useRef<HTMLDivElement | null>(null);
  const sourceScrollRef = useRef<HTMLElement | null>(null);
  const visualScrollRef = useRef<HTMLElement | null>(null);
  const mainVisualEditorsRef = useRef(new Map<string, MilkdownEditor>());
  const documentTabViewStatesRef = useRef(new Map<string, DocumentTabViewState>());
  const pendingEditorModeScrollRef = useRef<PendingEditorModeScroll | null>(null);
  const splitSurfaceRef = useRef<HTMLDivElement | null>(null);
  const sideDocumentSurfaceRef = useRef<HTMLDivElement | null>(null);
  const titlebarTabFocusTimerRef = useRef<number | null>(null);
  const splitScrollSyncTargetRef = useRef<EditorSurface | null>(null);
  const splitScrollSyncFrameRef = useRef<number | null>(null);
  const splitPaneResizeCleanupRef = useRef<(() => unknown) | null>(null);
  const sideDocumentPaneResizeCleanupRef = useRef<(() => unknown) | null>(null);
  const exportContextRef = useRef({
    activeImageFile: false,
    content: "",
    hasOpenDocument: false,
    name: "Untitled.md",
    path: null as string | null
  });
  const reconciledAiWorkspaceKeyRef = useRef<string | null | undefined>(undefined);
  const aiAgentInitialSessionOptionsRef = useRef({
    agentModelId: null as string | null,
    agentProviderId: null as string | null,
    thinkingEnabled: false,
    webSearchEnabled: false
  });

  useEffect(() => {
    const root = globalThis.document?.documentElement;
    if (!root) return;

    if (webKitScrollWorkaround) {
      root.dataset.webkitScrollWorkaround = webKitScrollWorkaround;
      return () => {
        if (root.dataset.webkitScrollWorkaround === webKitScrollWorkaround) {
          delete root.dataset.webkitScrollWorkaround;
        }
      };
    }

    delete root.dataset.webkitScrollWorkaround;
  }, [webKitScrollWorkaround]);

  const translate = useCallback((key: I18nKey) => t(appLanguage.language, key), [appLanguage.language]);
  const clearAiSelectionToolbarCopySuccess = useCallback(() => {
    if (aiSelectionCopySuccessTimerRef.current !== null) {
      window.clearTimeout(aiSelectionCopySuccessTimerRef.current);
      aiSelectionCopySuccessTimerRef.current = null;
    }

    setAiSelectionToolbarCopySucceeded(false);
  }, []);
  useEffect(() => {
    return () => {
      if (aiSelectionCopySuccessTimerRef.current !== null) {
        window.clearTimeout(aiSelectionCopySuccessTimerRef.current);
        aiSelectionCopySuccessTimerRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    let cancelled = false;

    loadMarkdownTemplatesFromEntries(
      editorPreferences.preferences.markdownTemplates,
      readNativeMarkdownTemplateFile
    ).then((templates) => {
      if (!cancelled) setMarkdownTemplates(templates);
    }).catch(() => {
      if (!cancelled) setMarkdownTemplates([]);
    });

    return () => {
      cancelled = true;
    };
  }, [editorPreferences.preferences.markdownTemplates]);

  const editor = useEditorController();
  const clearEditorSelectionFormatting = editor.clearSelectionFormatting;
  const findEditorSearchMatches = editor.findSearchMatches;
  const getEditorCurrentMarkdown = editor.getCurrentMarkdown;
  const handleMilkdownEditorReady = editor.handleEditorReady;
  const insertEditorMarkdownImage = editor.insertMarkdownImage;
  const insertEditorMarkdownLink = editor.insertMarkdownLink;
  const insertEditorMarkdownSnippet = editor.insertMarkdownSnippet;
  const insertEditorMarkdownTable = editor.insertMarkdownTable;
  const isEditorCurrentMarkdownEquivalent = editor.isCurrentMarkdownEquivalent;
  const replaceAllEditorSearchMatches = editor.replaceAllSearchMatches;
  const replaceEditorMarkdown = editor.replaceMarkdown;
  const replaceEditorSearchMatch = editor.replaceSearchMatch;
  const revealEditorSearchMatch = editor.revealSearchMatch;
  const runEditorShortcut = editor.runEditorShortcut;
  const getEditorSelectionAnchor = editor.getSelectionAnchor;
  const getEditorSelectionFormattingState = editor.getSelectionFormattingState;
  const setEditorSelectionHeadingLevel = editor.setSelectionHeadingLevel;
  const showEditorSearchMatches = editor.showSearchMatches;
  const toggleEditorSelectionHighlight = editor.toggleSelectionHighlight;
  const syncAiSelectionToolbarFormattingState = useCallback(() => {
    const formattingState = getEditorSelectionFormattingState();

    setAiSelectionToolbarActiveActions(formattingState.actions);
    setAiSelectionToolbarHeadingLevel(formattingState.headingLevel);
  }, [getEditorSelectionFormattingState]);
  const readCurrentMarkdownForDocument = useCallback((fallbackContent: string) => {
    if (sourceSurfaceActive || largeMarkdownVisualBlockedRef.current) return fallbackContent;

    return getEditorCurrentMarkdown(fallbackContent);
  }, [getEditorCurrentMarkdown, sourceSurfaceActive]);
  const isCurrentMarkdownEquivalentForDocument = useCallback((markdown: string) => {
    if (sourceSurfaceActive || largeMarkdownVisualBlockedRef.current) return undefined;

    return isEditorCurrentMarkdownEquivalent(markdown);
  }, [isEditorCurrentMarkdownEquivalent, sourceSurfaceActive]);
  const isDocumentEditorReady = useCallback(() => {
    if (sourceSurfaceActive || largeMarkdownVisualBlockedRef.current) return true;

    return visualEditorReadyRevisionRef.current === documentRevisionRef.current;
  }, [sourceSurfaceActive]);
  const handleVisualEditorReady = useCallback((...args: Parameters<typeof handleMilkdownEditorReady>) => {
    const [readyEditor] = args;
    handleMilkdownEditorReady(...args);
    if (readyEditor) {
      markAppPerformance("markdown-visual-ready", {
        ...visualEditorReadyDetailRef.current,
        revision: documentRevisionRef.current
      });
      visualEditorReadyRevisionRef.current = documentRevisionRef.current;
      setVisualEditorReadySequence((current) => current + 1);
    } else if (visualEditorReadyRevisionRef.current === documentRevisionRef.current) {
      visualEditorReadyRevisionRef.current = null;
    }
  }, [handleMilkdownEditorReady]);
  const handleActiveOutlineIndexChange = useCallback((index: number | null) => {
    setActiveOutlineIndex((current) => current === index ? current : index);
  }, []);
  useDefaultContextMenuBlocker();
  const fileTree = useMarkdownFileTree({
    onWorkspaceSessionChange: setAiAgentSessionId
  });
  const {
    files: fileTreeFiles,
    createFile: createMarkdownTreeFile,
    createFolder: createMarkdownTreeFolder,
    deleteFile: deleteMarkdownTreeFile,
    fileTreeSort,
    moveFile: moveMarkdownTreeFile,
    open: fileTreeOpen,
    openFolderPath,
    openMarkdownFolder,
    openRecentFolder,
    removeRecentFolder,
    renameFile: renameMarkdownTreeFile,
    recentFoldersOpen: recentMarkdownFoldersOpen,
    recentFolders: recentMarkdownFolders,
    refresh: refreshMarkdownFileTree,
    resizing: fileTreeResizing,
    resize: resizeFileTree,
    endResize: endFileTreeResize,
    sourcePath: fileTreeSourcePath,
    rootNameForDocument,
    setRootFromMarkdownFilePath,
    setFileTreeSort,
    setRecentFoldersOpen: setRecentMarkdownFoldersOpen,
    startResize: startFileTreeResize,
    toggle: toggleFileTree,
    width: fileTreeWidth,
    maxWidth: fileTreeMaxWidth,
    minWidth: fileTreeMinWidth,
    workspaceLayoutClassName,
    workspaceLayoutStyle
  } = fileTree;
  const defaultMarkdownSaveDirectory = useMemo(
    () => defaultSaveDirectoryFromFileTree(fileTreeSourcePath),
    [fileTreeSourcePath]
  );
  const confirmDiscardUnsavedChanges = useCallback((currentDocument: { name: string }) => {
    return confirmNativeUnsavedMarkdownDocumentDiscard(currentDocument.name, {
      cancelLabel: translate("app.cancelDiscardUnsavedMarkdownDocument"),
      message: translate("app.confirmDiscardUnsavedMarkdownDocument"),
      okLabel: translate("app.confirmDiscardUnsavedMarkdownDocumentAction")
    });
  }, [translate]);
  const {
    backupStatusLabel,
    beforeNativeAppExitBackup,
    runWorkspaceSync,
    setSourcePath: setWorkspaceBackupSyncSourcePath,
    syncStatusLabel
  } = useWorkspaceBackupSync({
    backupSettings,
    editorPreferences,
    syncSettings,
    translate
  });
  const markdownDocument = useMarkdownDocument({
    autoSaveEnabled: editorPreferences.preferences.autoSaveEnabled,
    autoSaveIntervalMinutes: editorPreferences.preferences.autoSaveIntervalMinutes,
    beforeNativeAppExit: beforeNativeAppExitBackup,
    confirmDiscardUnsavedChanges,
    defaultSaveDirectory: defaultMarkdownSaveDirectory,
    documentTabsEnabled: editorPreferences.preferences.showDocumentTabs,
    editorReady: isDocumentEditorReady,
    getCurrentMarkdown: readCurrentMarkdownForDocument,
    isCurrentMarkdownEquivalent: isCurrentMarkdownEquivalentForDocument,
    onMarkdownTreeChange: refreshMarkdownFileTree,
    onTreeRootFromFolderPath: openFolderPath,
    onTreeRootFromFilePath: setRootFromMarkdownFilePath,
    onWorkspaceSessionChange: setAiAgentSessionId,
    preferencesReady: !editorPreferences.loading,
    restoreWorkspaceOnStartup: editorPreferences.preferences.restoreWorkspaceOnStartup,
    workspaceSourcePath: fileTreeSourcePath
  });
  const {
    clearRecentMarkdownFiles,
    clearOpenDocument,
    createBlankDocument,
    confirmCanDiscardCurrentDocument,
    detachDeletedDocumentFile,
    document,
    tabs: documentTabs,
    activeTabId,
    closeMarkdownTab,
    handleDroppedMarkdownPath,
    handleMarkdownChange,
    handleMarkdownTabChange,
    openMarkdownFile,
    openRecentMarkdownFile,
    openTreeMarkdownFileInBackground,
    openTreeMarkdownFile,
    outlineItems,
    replaceOpenDocumentFile,
    replaceMovedOpenDocumentFile,
    recentFiles: recentMarkdownFiles,
    restoreDocumentContent,
    saveCurrentDocumentContent,
    saveCurrentDocument,
    saveDirtyMarkdownFiles,
    saveMarkdownTab,
    selectMarkdownTab,
    selectWorkspaceSession,
    workspaceSessionId,
    wordCount
  } = markdownDocument;
  documentRevisionRef.current = document.revision;
  const activeDocumentOutlineIndex =
    !sourceSurfaceActive &&
    activeOutlineIndex !== null &&
    activeOutlineIndex >= 0 &&
    activeOutlineIndex < outlineItems.length
      ? activeOutlineIndex
      : null;
  visualEditorReadyDetailRef.current = {
    chars: document.content.length,
    path: document.path,
    sizeBytes: document.sizeBytes ?? null
  };
  useEffect(() => {
    setSelectedWordCount(null);
  }, [activeImageFile?.path, activeTabId, editorMode]);
  const handleMainVisualEditorReady = useCallback((
    tabId: string,
    readyEditor: MilkdownEditor | null,
    options?: Parameters<typeof handleMilkdownEditorReady>[1]
  ) => {
    if (readyEditor) {
      mainVisualEditorsRef.current.set(tabId, readyEditor);
    } else {
      mainVisualEditorsRef.current.delete(tabId);
    }

    if (tabId === activeTabId) {
      handleVisualEditorReady(readyEditor, options);
    }
  }, [activeTabId, handleVisualEditorReady]);
  useEffect(() => {
    if (!activeTabId) {
      handleVisualEditorReady(null);
      return;
    }

    const activeEditor = mainVisualEditorsRef.current.get(activeTabId);
    if (!activeEditor) return;

    handleVisualEditorReady(activeEditor, { autoFocus: false });
  }, [activeTabId, handleVisualEditorReady]);
  useEffect(() => {
    setActiveOutlineIndex(null);
  }, [activeTabId, document.path]);
  const workspaceKey = document.path ?? fileTree.sourcePath ?? null;
  setWorkspaceBackupSyncSourcePath(fileTreeSourcePath ?? document.path);
  const workspaceSearch = useWorkspaceSearch({
    activeImageFile,
    documentContent: document.content,
    documentPath: document.path,
    fileTreeFiles,
    fileTreeSourcePath
  });
  const {
    caseSensitive: globalSearchCaseSensitive,
    closeSearch: closeGlobalSearch,
    hideSearch: hideGlobalSearch,
    loading: globalSearchLoading,
    open: globalSearchOpen,
    openSearch: openGlobalSearch,
    query: globalSearchQuery,
    recentQueries: globalSearchRecentQueries,
    response: globalSearchResponse,
    selectRecentQuery: selectGlobalSearchRecentQuery,
    setCaseSensitive: setGlobalSearchCaseSensitive,
    setQuery: setGlobalSearchQuery
  } = workspaceSearch;
  const hasOpenDocument = document.open;
  const largeMarkdownVisualBlocked =
    hasOpenDocument && !activeImageFile && shouldBlockLargeMarkdownVisual(document.content, {
      sizeBytes: document.sizeBytes
    });
  largeMarkdownVisualBlockedRef.current = largeMarkdownVisualBlocked;
  const startupSettingsReady = appLanguage.ready && !editorPreferences.loading;
  const startupWindowReady =
    startupSettingsReady &&
    (
      Boolean(activeImageFile) ||
      !hasOpenDocument ||
      sourceSurfaceActive ||
      largeMarkdownVisualBlocked ||
      visualEditorReadyRevisionRef.current === documentRevisionRef.current
    );
  useStartupWindowReveal({ ready: startupWindowReady });
  const documentHistoryAvailable = hasOpenDocument && document.path !== null && !activeImageFile && !readOnlyMode;
  const documentSearchAvailable = hasOpenDocument && !activeImageFile;
  const documentSearchSurface: EditorSurface =
    sourceSurfaceActive || largeMarkdownVisualBlocked ? "source" : "visual";
  const {
    activeIndex: normalizedDocumentSearchActiveIndex,
    activeMatch: activeDocumentSearchMatch,
    caseSensitive: documentSearchCaseSensitive,
    close: closeDocumentSearch,
    hide: hideDocumentSearch,
    matchCount: documentSearchMatchCount,
    matches: documentSearchMatches,
    navigate: navigateDocumentSearch,
    open: documentSearchOpen,
    openReplace: openDocumentReplace,
    openSearch: openDocumentSearch,
    query: documentSearchQuery,
    replacement: documentSearchReplacement,
    replaceOpen: documentSearchReplaceOpen,
    resetActiveIndex: resetDocumentSearchActiveIndex,
    revealRevision: documentSearchRevealRevision,
    selectMatch: selectDocumentSearchMatch,
    setCaseSensitive: setDocumentSearchCaseSensitive,
    setReplacement: setDocumentSearchReplacement,
    setReplaceOpen: setDocumentSearchReplaceOpen,
    setQuery: setDocumentSearchQuery,
    setVisualMatches: setVisualDocumentSearchMatches,
    visibleSourceMatches: visibleSourceDocumentSearchMatches,
    visualMatches: visualDocumentSearchMatches
  } = useDocumentSearchState({
    available: documentSearchAvailable,
    sourceContent: document.content,
    surface: documentSearchSurface
  });
  const {
    isApplyingSourceToVisualSync,
    markSourceEditForHistory,
    syncSourceEditsToVisualHistory
  } = useSharedEditorHistory({
    documentContent: document.content,
    documentRevision: document.revision,
    largeMarkdownVisualBlocked,
    replaceEditorMarkdown,
    sourceSurfaceActive,
    syncSourceToVisual: splitMode && activeEditorSurface === "source",
    visualEditorReadySequence
  });
  const activeAiAgentSessionId = workspaceSessionId ?? aiAgentSessionId;
  const aiResult = aiResults.at(-1) ?? null;
  const commitEditorContentWidth = useCallback((nextWidth: {
    contentWidth: typeof editorPreferences.preferences.contentWidth;
    contentWidthPx: number;
  }) => {
    const nextPreferences = {
      ...editorPreferences.preferences,
      contentWidth: nextWidth.contentWidth,
      contentWidthPx: nextWidth.contentWidthPx
    };

    saveStoredEditorPreferences(nextPreferences)
      .then(() => notifyAppEditorPreferencesChanged(nextPreferences))
      .catch(() => {});
  }, [editorPreferences.preferences]);
  const {
    activeWidth: activeEditorContentWidth,
    activeWidthPx: activeEditorContentWidthPx,
    onResizeEnd: handleEditorContentWidthResizeEnd,
    onWidthChange: handleEditorContentWidthChange
  } = useEditorContentWidthState({
    contentWidth: editorPreferences.preferences.contentWidth,
    contentWidthPx: editorPreferences.preferences.contentWidthPx ?? null,
    onCommit: commitEditorContentWidth
  });
  const resolvedSplitVisualPanePercent =
    clampNumber(splitVisualPanePercent, splitVisualPanePercentMin, splitVisualPanePercentMax) ?? defaultSplitVisualPanePercent;
  const resolvedSideDocumentMainPanePercent =
    clampNumber(
      sideDocumentMainPanePercent,
      sideDocumentMainPanePercentMin,
      sideDocumentMainPanePercentMax
    ) ?? defaultSideDocumentMainPanePercent;
  const splitSurfaceStyle = useMemo(() => ({
    "--split-visual-pane": `${resolvedSplitVisualPanePercent}fr`,
    "--split-source-pane": `${100 - resolvedSplitVisualPanePercent}fr`
  } as CSSProperties), [resolvedSplitVisualPanePercent]);
  const sideDocumentSurfaceStyle = useMemo(() => ({
    "--side-document-main-pane": `${resolvedSideDocumentMainPanePercent}fr`,
    "--side-document-secondary-pane": `${100 - resolvedSideDocumentMainPanePercent}fr`
  } as CSSProperties), [resolvedSideDocumentMainPanePercent]);
  const resolveExportImageSrc = useMemo(
    () => createMarkdownImageSrcResolver(document.path, { convertFileSrc: localFileUrlFromPath }),
    [document.path]
  );
  const imagePreviewSrc = useMemo(() => {
    if (!activeImageFile) return "";

    return createMarkdownImageSrcResolver(activeImageFile.path)(activeImageFile.path);
  }, [activeImageFile]);
  const titlebarTabs = useMemo<MarkdownTabsBarDocumentItem[]>(() => [
    ...documentTabs,
    ...imageTabs.map((tab) => ({
      dirty: false,
      displayKind: "image" as const,
      id: tab.id,
      name: tab.name,
      path: tab.path
    }))
  ], [documentTabs, imageTabs]);
  const activeTitlebarTabId = activeImageFile ? imageDocumentTabId(activeImageFile.path) : activeTabId;
  const {
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
  } = useSideBySideTabs({
    activeImageFileOpen: Boolean(activeImageFile),
    activeTabId,
    documentTabs,
    documentTabsEnabled: editorPreferences.preferences.showDocumentTabs,
    hasOpenDocument,
    loadStoredWorkspaceState: getStoredWorkspaceState,
    persistSideDocumentGroup,
    restoreReady: !editorPreferences.loading,
    restoreWorkspaceOnStartup: editorPreferences.preferences.restoreWorkspaceOnStartup,
    titlebarTabs
  });
  const getAiDocumentContent = useCallback(
    () => (document.open ? readCurrentMarkdownForDocument(document.content) : document.content),
    [document.content, document.open, readCurrentMarkdownForDocument]
  );
  const readAiWorkspaceFile = useCallback(async (path: string) => {
    const file = await readNativeMarkdownFile(path);

    return file.content;
  }, []);
  const readAiDocumentImage = useCallback(async (src: string) => {
    if (!document.path) return null;

    return readNativeMarkdownImageFile({
      documentPath: document.path,
      src
    });
  }, [document.path]);
  const saveDocumentTabViewState = useCallback((tabId: string | null | undefined, patch: DocumentTabViewState) => {
    if (!tabId) return;

    const current = documentTabViewStatesRef.current.get(tabId) ?? {};
    documentTabViewStatesRef.current.set(tabId, {
      ...current,
      ...patch
    });
  }, []);
  const captureActiveDocumentViewState = useCallback(() => {
    if (activeImageFile || !activeTabId) return;

    const nextState: DocumentTabViewState = {};
    if (visualScrollRef.current) nextState.visualScrollTop = visualScrollRef.current.scrollTop;
    if (sourceScrollRef.current) nextState.sourceScrollTop = sourceScrollRef.current.scrollTop;
    if (Object.keys(nextState).length > 0) saveDocumentTabViewState(activeTabId, nextState);
  }, [activeImageFile, activeTabId, saveDocumentTabViewState]);
  const queueEditorModeScroll = useCallback((targetSurface: EditorSurface) => {
    if (!activeTabId) return;

    const sourceElement = targetSurface === "source" ? visualScrollRef.current : sourceScrollRef.current;
    if (!sourceElement) return;

    const maxScrollTop = Math.max(0, sourceElement.scrollHeight - sourceElement.clientHeight);
    pendingEditorModeScrollRef.current = {
      progress: maxScrollTop <= 0 ? 0 : Math.min(1, Math.max(0, sourceElement.scrollTop / maxScrollTop)),
      tabId: activeTabId,
      targetSurface
    };
  }, [activeTabId]);
  const handleOpenEditorLink = useCallback(async (href: string) => {
    const linkedFile = resolveMarkdownDocumentLinkFile(href, document.path, fileTreeFiles);
    if (linkedFile) {
      captureActiveDocumentViewState();
      setActiveImageFile(null);
      await openTreeMarkdownFile(linkedFile);
      return;
    }

    await openNativeExternalUrl(href);
  }, [captureActiveDocumentViewState, document.path, fileTreeFiles, openTreeMarkdownFile]);
  const getActiveAiSelection = useCallback(() => activeAiSelectionRef.current, []);
  const updateSelectedWordCount = useCallback((selectedText: string | null | undefined) => {
    const count = selectedText?.trim() ? getWordCount(selectedText) : 0;
    setSelectedWordCount(count > 0 ? count : null);
  }, []);
  const updateActiveAiSelection = useCallback((selection: AiSelectionContext | null) => {
    activeAiSelectionRef.current = selection;
    setActiveAiSelection(selection);
  }, []);
  const updateAiResults = useCallback((results: AiDiffResult[]) => {
    aiResultsRef.current = results;
    setAiResults(results);
  }, []);
  const getPendingAiResult = useCallback(() => aiResultsRef.current.at(-1) ?? null, []);
  const hasAiCommandContext = aiFeatureEnabled && !sourceSurfaceActive && Boolean(activeAiSelection?.text.trim());
  const selectedInlineAiModel =
    aiSettings.availableTextModels.find(
      (model) => model.providerId === aiSettings.inlineProvider?.id && model.id === aiSettings.inlineModelId
    ) ?? aiSettings.availableTextModels[0];
  const selectedAiAgentModel =
    aiSettings.availableTextModels.find(
      (model) => model.providerId === aiSettings.agentProvider?.id && model.id === aiSettings.agentModelId
    ) ?? aiSettings.availableTextModels[0];
  const aiAgentProviderName = selectedAiAgentModel?.providerName ?? aiSettings.agentProvider?.name ?? null;
  const aiAgentModelName = selectedAiAgentModel?.name ?? aiSettings.agentModelId ?? null;
  const webSearchAvailable = aiFeatureEnabled && aiAgentWebSearchAvailable({
    model: selectedAiAgentModel,
    provider: aiSettings.agentProvider,
    settings: webSearchSettings.settings,
    settingsLoading: webSearchSettings.loading
  });
  const handleAiResult = useCallback(
    (result: AiDiffResult, previewId?: string) => {
      editor.clearAiSelection();
      appliedAiPreviewKeysRef.current.clear();
      editor.previewAiResult(result, {
        apply: translate("app.aiApply"),
        chars: translate("app.aiPreviewChars"),
        copied: translate("app.aiCopied"),
        copy: translate("app.aiCopy"),
        insertScope: translate("app.aiPreviewInsert"),
        reject: translate("app.aiReject"),
        replaceDocumentScope: translate("app.aiPreviewReplaceDocument"),
        replaceRegionScope: translate("app.aiPreviewReplaceRegion"),
        replaceSelectionScope: translate("app.aiPreviewReplaceSelection")
      }, {
        previewId
      });
      updateAiResults(editor.listAiPreviews());
    },
    [editor, translate, updateAiResults]
  );
  const handleAiPreviewReady = useCallback((result: AiDiffResult, previewId?: string) => {
    editor.scrollToAiPreview(result, { previewId });
  }, [editor]);
  const handleAiAgentSessionModelRestore = useCallback((selection: { agentModelId: string | null; agentProviderId: string | null }) => {
    if (!selection.agentProviderId || !selection.agentModelId) return;
    if (selection.agentProviderId === aiSettings.agentProviderId && selection.agentModelId === aiSettings.agentModelId) return;

    aiSettings.selectAgentModel(selection.agentProviderId, selection.agentModelId).catch(() => {});
  }, [aiSettings.agentModelId, aiSettings.agentProviderId, aiSettings.selectAgentModel]);
  const aiCommand = useAiCommandUi({
    documentPath: document.path,
    getDocumentContent: getAiDocumentContent,
    getPendingResult: getPendingAiResult,
    getSelection: getActiveAiSelection,
    model: aiSettings.inlineModelId,
    onAiResult: handleAiResult,
    provider: aiSettings.inlineProvider,
    settingsLoading: aiSettings.loading,
    translate,
    translationTargetLanguage: aiTranslationLanguageName(appLanguage.ready ? appLanguage.language : "en"),
    workspaceFiles: fileTreeFiles
  });
  const aiCommandVisible = aiCommand.open && (hasAiCommandContext || Boolean(aiResult) || aiContextMenuActionPending);
  const closeAiCommand = aiCommand.closeAiCommand;
  const restoreAiCommand = aiCommand.restoreAiCommand;
  const closeInlineAiCommandForAgentPanel = useCallback(() => {
    aiContextMenuActionIdRef.current += 1;
    setAiContextMenuActionPending(false);
    closeAiCommand();
    editor.clearAiSelection();
  }, [closeAiCommand, editor]);
  const {
    closePanel: closeAiAgentPanel,
    enabledOpen: aiAgentPanelEnabledOpen,
    endResize: endAiAgentPanelResize,
    open: aiAgentOpen,
    openPanel: openAiAgentPanel,
    resizing: aiAgentPanelResizing,
    restoreSession: restoreAiAgentPanelSession,
    setWidth: setAiAgentPanelWidth,
    startResize: startAiAgentPanelResize,
    togglePanel: toggleAiAgentPanel,
    width: aiAgentPanelWidth
  } = useAiAgentPanelState({
    closeAiCommandOnAgentPanelOpen: editorPreferences.preferences.closeAiCommandOnAgentPanelOpen,
    enabled: aiFeatureEnabled,
    onCloseInlineAiCommand: closeInlineAiCommandForAgentPanel
  });
  const handleAiAgentSessionRestore = useCallback((session: { panelOpen: boolean; panelWidth: number | null }) => {
    restoreAiAgentPanelSession(session);
  }, [restoreAiAgentPanelSession]);
  const aiAgentInset = aiFeatureEnabled && aiAgentOpen ? `${aiAgentPanelWidth}px` : "0px";
  const editorAgentLayoutClassName = `editor-agent-layout grid min-h-0 ${
    aiAgentPanelResizing
      ? "transition-none"
      : "transition-[grid-template-columns] duration-220 ease-out motion-reduce:transition-none"
  }`;
  const aiAgent = useAiAgentSession({
    documentPath: document.path,
    getDocumentContent: getAiDocumentContent,
    getDocumentEndPosition: editor.getDocumentEndPosition,
    getHeadingAnchors: editor.getHeadingAnchors,
    getSectionAnchors: editor.getSectionAnchors,
    getSelection: getActiveAiSelection,
    getTableAnchors: editor.getTableAnchors,
    model: aiSettings.agentModelId,
    onAiPreviewReady: handleAiPreviewReady,
    onAiResult: handleAiResult,
    onSessionModelRestore: handleAiAgentSessionModelRestore,
    onSessionRestore: handleAiAgentSessionRestore,
    panelOpen: aiAgentPanelEnabledOpen,
    panelWidth: aiAgentPanelWidth,
    provider: aiSettings.agentProvider,
    readDocumentImage: readAiDocumentImage,
    readWorkspaceFile: readAiWorkspaceFile,
    sessionId: activeAiAgentSessionId,
    settingsLoading: aiSettings.loading,
    translate,
    webSearchSettings: webSearchSettings.settings,
    workspaceKey,
    workspaceFiles: fileTreeFiles
  });
  aiAgentInitialSessionOptionsRef.current = {
    agentModelId: aiSettings.agentModelId,
    agentProviderId: aiSettings.agentProviderId,
    thinkingEnabled: aiAgent.thinkingEnabled,
    webSearchEnabled: aiAgent.webSearchEnabled
  };
  const createAiAgentInitialSessionOptions = useCallback(() => ({
    ...aiAgentInitialSessionOptionsRef.current
  }), []);
  const createInitializedAiAgentSession = useCallback(async () => {
    const sessionId = createAiAgentSessionId();

    await initializeStoredAiAgentSession(sessionId, workspaceKey, createAiAgentInitialSessionOptions());
    selectWorkspaceSession(sessionId);
    return sessionId;
  }, [createAiAgentInitialSessionOptions, selectWorkspaceSession, workspaceKey]);
  const aiAgentSessionRefreshKey = [
    activeAiAgentSessionId ?? "none",
    workspaceKey ?? "none",
    aiAgent.messages.length,
    aiAgent.draft.trim().slice(0, 24),
    aiAgent.titleVersion
  ].join(":");
  const aiAgentSessions = useAiAgentSessionList(workspaceKey, aiAgentSessionRefreshKey);
  useEffect(() => {
    if (!aiFeatureEnabled) return;
    if (!workspaceKey || !activeAiAgentSessionId || !aiAgentSessions.ready) return;

    const activeSessions = aiAgentSessions.sessions.filter((session) => session.archivedAt === null);
    const activeSessionBelongsToWorkspace = activeSessions.some((session) => session.id === activeAiAgentSessionId);
    if (activeSessionBelongsToWorkspace) {
      reconciledAiWorkspaceKeyRef.current = workspaceKey;
      return;
    }

    const previousWorkspaceKey = reconciledAiWorkspaceKeyRef.current;
    if (previousWorkspaceKey === workspaceKey) return;

    reconciledAiWorkspaceKeyRef.current = workspaceKey;

    const newestSession = activeSessions[0];
    if (newestSession) {
      selectWorkspaceSession(newestSession.id);
      return;
    }

    if (previousWorkspaceKey === undefined) {
      initializeStoredAiAgentSession(activeAiAgentSessionId, workspaceKey, createAiAgentInitialSessionOptions()).then(() => {
        aiAgentSessions.refresh().catch(() => {});
      }).catch(() => {});
      return;
    }

    createInitializedAiAgentSession().then(() => {
      aiAgentSessions.refresh().catch(() => {});
    }).catch(() => {});
  }, [
    activeAiAgentSessionId,
    aiAgentSessions,
    aiFeatureEnabled,
    createAiAgentInitialSessionOptions,
    createInitializedAiAgentSession,
    selectWorkspaceSession,
    workspaceKey
  ]);
  const handleAiCommandClose = useCallback(() => {
    aiContextMenuActionIdRef.current += 1;
    setAiContextMenuActionPending(false);
    setAiSelectionToolbarAnchor(null);
    closeAiCommand();
    editor.clearAiSelection();
  }, [closeAiCommand, editor]);
  const handleReadOnlyModeToggle = useCallback(() => {
    const nextReadOnlyMode = !readOnlyMode;
    setReadOnlyMode(nextReadOnlyMode);

    if (nextReadOnlyMode) handleAiCommandClose();
  }, [handleAiCommandClose, readOnlyMode]);
  useEffect(() => {
    if (!shouldHideAiCommandForAiAgentPanel({
      aiAgentOpen,
      closeAiCommandOnAgentPanelOpen: editorPreferences.preferences.closeAiCommandOnAgentPanelOpen
    })) {
      return;
    }

    aiCommand.closeAiCommand();
  }, [aiAgentOpen, aiCommand.closeAiCommand, editorPreferences.preferences.closeAiCommandOnAgentPanelOpen]);
  const handleCreateAiAgentSession = useCallback(() => {
    openAiAgentPanel();
    createInitializedAiAgentSession().then(() => {
      aiAgentSessions.refresh().catch(() => {});
    }).catch(() => {});
  }, [aiAgentSessions, createInitializedAiAgentSession, openAiAgentPanel]);
  const handleSelectAiAgentSession = useCallback((sessionId: string) => {
    selectWorkspaceSession(sessionId);
    openAiAgentPanel();
  }, [openAiAgentPanel, selectWorkspaceSession]);
  const handleRenameAiAgentSession = useCallback(async (sessionId: string, title: string) => {
    await saveStoredAiAgentSessionTitle(sessionId, title, {
      source: "manual",
      workspaceKey
    });
    await aiAgentSessions.refresh();
  }, [aiAgentSessions, workspaceKey]);
  const handleDeleteAiAgentSession = useCallback(async (sessionId: string) => {
    const remainingSessions = aiAgentSessions.sessions.filter(
      (session) => session.id !== sessionId && session.archivedAt === null
    );

    await deleteStoredAiAgentSession(sessionId);

    if (sessionId === activeAiAgentSessionId) {
      if (remainingSessions[0]) {
        selectWorkspaceSession(remainingSessions[0].id);
      } else {
        await createInitializedAiAgentSession();
      }
    }

    await aiAgentSessions.refresh();
    openAiAgentPanel();
  }, [activeAiAgentSessionId, aiAgentSessions, createInitializedAiAgentSession, openAiAgentPanel, selectWorkspaceSession]);
  const handleArchiveAiAgentSession = useCallback(async (sessionId: string, archived: boolean) => {
    const remainingSessions = aiAgentSessions.sessions.filter(
      (session) => session.id !== sessionId && session.archivedAt === null
    );

    await setStoredAiAgentSessionArchived(sessionId, archived);

    if (archived && sessionId === activeAiAgentSessionId) {
      if (remainingSessions[0]) {
        selectWorkspaceSession(remainingSessions[0].id);
      } else {
        await createInitializedAiAgentSession();
      }
    }

    await aiAgentSessions.refresh();
    openAiAgentPanel();
  }, [activeAiAgentSessionId, aiAgentSessions, createInitializedAiAgentSession, openAiAgentPanel, selectWorkspaceSession]);
  const handleTextSelectionChange = useCallback((selection: AiSelectionContext | null) => {
    const automaticSelection = automaticAiSelection(selection);

    updateSelectedWordCount(selection?.source === "selection" ? selection.text : null);
    updateActiveAiSelection(automaticSelection);
    clearAiSelectionToolbarCopySuccess();
    setAiSelectionToolbarActiveActions([]);
    setAiSelectionToolbarHeadingLevel(null);

    if (!aiFeatureEnabled) {
      setAiSelectionToolbarAnchor(null);
      editor.clearAiSelection();
      return;
    }

    if (readOnlyMode) {
      setAiSelectionToolbarAnchor(null);
      editor.clearAiSelection();
      return;
    }

    if (!selection?.text.trim()) {
      setAiSelectionToolbarAnchor(null);
      editor.clearAiSelection();
      if (aiResultsRef.current.length === 0) aiCommand.closeAiCommand();
      return;
    }

    if (!automaticSelection) {
      setAiSelectionToolbarAnchor(null);
      editor.clearAiSelection();
      if (aiResultsRef.current.length === 0) aiCommand.closeAiCommand();
      return;
    }

    editor.clearAiSelection();

    const hideInlineAiCommandForAgentPanel = shouldHideAiCommandForAiAgentPanel({
      aiAgentOpen,
      closeAiCommandOnAgentPanelOpen: editorPreferences.preferences.closeAiCommandOnAgentPanelOpen
    });
    const hideSelectionToolbarForAgentPanel = shouldHideSelectionToolbarForAiAgentPanel({
      aiAgentOpen,
      closeAiCommandOnAgentPanelOpen: editorPreferences.preferences.closeAiCommandOnAgentPanelOpen
    });

    if (hideInlineAiCommandForAgentPanel) {
      aiCommand.closeAiCommand();
      if (hideSelectionToolbarForAgentPanel) {
        setAiSelectionToolbarAnchor(null);
        return;
      }
    }

    const showQuickInput = editorPreferences.preferences.showAiQuickInputOnSelection;
    const showSelectionToolbar = editorPreferences.preferences.showAiSelectionToolbarOnSelection;

    if (
      (!showQuickInput && !showSelectionToolbar)
      || (aiCommand.open && !hideInlineAiCommandForAgentPanel)
      || aiCommand.submitting
    ) {
      setAiSelectionToolbarAnchor(null);
      return;
    }

    if (showSelectionToolbar) {
      syncAiSelectionToolbarFormattingState();
      setAiSelectionToolbarAnchorIfChanged(
        getEditorSelectionAnchor() ?? selectionAnchorFromDomSelection(window.getSelection())
      );
    } else if (!hideInlineAiCommandForAgentPanel) {
      aiCommand.openAiCommand(automaticSelection);
      return;
    } else {
      setAiSelectionToolbarAnchor(null);
      return;
    }

    if (showQuickInput && !hideInlineAiCommandForAgentPanel) {
      aiCommand.openAiCommand(automaticSelection);
    }
  }, [
    aiAgentOpen,
    aiCommand,
    aiFeatureEnabled,
    editor,
    editorPreferences.preferences.closeAiCommandOnAgentPanelOpen,
    editorPreferences.preferences.showAiQuickInputOnSelection,
    editorPreferences.preferences.showAiSelectionToolbarOnSelection,
    getEditorSelectionAnchor,
    syncAiSelectionToolbarFormattingState,
    clearAiSelectionToolbarCopySuccess,
    readOnlyMode,
    setAiSelectionToolbarAnchorIfChanged,
    updateSelectedWordCount,
    updateActiveAiSelection
  ]);
  const getEditorSelection = editor.getSelection;
  const holdAiSelection = editor.holdAiSelection;
  const scrollAiSelectionAboveCommand = editor.scrollAiSelectionAboveCommand;
  const interruptAiCommandPrompt = aiCommand.interruptPrompt;
  const openAiCommand = aiCommand.openAiCommand;
  const submitAiCommandPrompt = aiCommand.submitPrompt;
  const updateAiCommandPrompt = aiCommand.updatePrompt;
  const aiContextMenuActionRef = useRef<((intent: AiQuickActionIntent, prompt: string) => unknown) | null>(null);
  useEffect(() => {
    aiContextMenuActionRef.current = (intent: AiQuickActionIntent, prompt: string) => {
      if (!aiFeatureEnabled || sourceSurfaceActive || readOnlyMode) return;

      const selection = automaticAiSelection(getActiveAiSelection()) ?? automaticAiSelection(getEditorSelection());
      if (!selection) return;

      holdAiSelection(selection);
      const actionId = aiContextMenuActionIdRef.current + 1;
      let opened = false;
      aiContextMenuActionIdRef.current = actionId;
      setAiSelectionToolbarAnchor(null);

      flushSync(() => {
        updateActiveAiSelection(selection);
        setAiContextMenuActionPending(true);
        opened = openAiCommand(selection);
        updateAiCommandPrompt(prompt);
      });

      if (!opened) {
        setAiContextMenuActionPending(false);
        return;
      }

      window.setTimeout(() => {
        if (aiContextMenuActionIdRef.current !== actionId) return;

        Promise.resolve(submitAiCommandPrompt(prompt, intent)).finally(() => {
          if (aiContextMenuActionIdRef.current !== actionId) return;

          setAiContextMenuActionPending(false);
        });
      }, 0);
    };
  }, [
    getEditorSelection,
    getActiveAiSelection,
    aiFeatureEnabled,
    holdAiSelection,
    openAiCommand,
    readOnlyMode,
    sourceSurfaceActive,
    submitAiCommandPrompt,
    updateActiveAiSelection,
    updateAiCommandPrompt
  ]);
  const handleAiContextMenuAction = useCallback((intent: AiQuickActionIntent, prompt: string) => {
    return aiContextMenuActionRef.current?.(intent, prompt);
  }, []);
  const getAiContextMenuAvailable = useCallback(() => {
    if (!aiFeatureEnabled) return false;
    if (sourceSurfaceActive || readOnlyMode) return false;

    const selection = automaticAiSelection(getActiveAiSelection()) ?? automaticAiSelection(getEditorSelection());

    return Boolean(selection);
  }, [aiFeatureEnabled, getActiveAiSelection, getEditorSelection, readOnlyMode, sourceSurfaceActive]);
  const handleAiCommandToggle = useCallback(() => {
    if (!aiFeatureEnabled) return;

    setAiSelectionToolbarAnchor(null);

    if (aiCommand.open) {
      handleAiCommandClose();
      return;
    }

    if (sourceSurfaceActive || readOnlyMode) return;

    const selection = aiCommandSelection(getActiveAiSelection()) ?? aiCommandSelection(getEditorSelection());
    if (!selection) return;

    updateActiveAiSelection(selection);
    openAiCommand(selection);
  }, [
    aiCommand.open,
    aiFeatureEnabled,
    getActiveAiSelection,
    getEditorSelection,
    handleAiCommandClose,
    holdAiSelection,
    openAiCommand,
    readOnlyMode,
    sourceSurfaceActive,
    updateActiveAiSelection
  ]);
  const handleAiCommandSelectionContextFocus = useCallback(() => {
    const selection = aiCommandSelection(getActiveAiSelection()) ?? aiCommandSelection(getEditorSelection());
    if (!selection) return;

    holdAiSelection(selection);
    updateActiveAiSelection(selection);
  }, [getActiveAiSelection, getEditorSelection, holdAiSelection, updateActiveAiSelection]);
  const handleAiCommandInterrupt = useCallback(() => {
    aiContextMenuActionIdRef.current += 1;
    setAiContextMenuActionPending(false);
    setAiSelectionToolbarAnchor(null);
    interruptAiCommandPrompt();
  }, [interruptAiCommandPrompt]);
  const aiSelectionToolbarVisible =
    aiFeatureEnabled &&
    !sourceSurfaceActive &&
    !readOnlyMode &&
    Boolean(aiSelectionToolbarAnchor) &&
    activeAiSelection?.source === "selection" &&
    Boolean(activeAiSelection.text.trim()) &&
    !aiCommand.submitting &&
    !aiContextMenuActionPending &&
    !aiResult;
  const aiSelectionToolbarLayoutSignature = useMemo(() => [
    fileTreeOpen ? fileTreeWidth : "file-tree-closed",
    fileTreeResizing ? "file-tree-resizing" : "file-tree-idle",
    aiFeatureEnabled && aiAgentOpen ? aiAgentPanelWidth : "agent-closed",
    aiAgentPanelResizing ? "agent-resizing" : "agent-idle",
    sideDocumentOpen ? resolvedSideDocumentMainPanePercent : "side-document-closed",
    splitMode ? resolvedSplitVisualPanePercent : "split-closed",
    activeEditorSurface,
    activeEditorContentWidth,
    activeEditorContentWidthPx ?? "auto",
    documentSearchOpen && documentSearchAvailable ? "search-open" : "search-closed",
    documentSearchReplaceOpen ? "replace-open" : "replace-closed",
    editorPreferences.preferences.showDocumentTabs ? "tabs-open" : "tabs-closed"
  ].join(":"), [
    activeEditorContentWidth,
    activeEditorContentWidthPx,
    activeEditorSurface,
    aiAgentOpen,
    aiAgentPanelResizing,
    aiAgentPanelWidth,
    aiFeatureEnabled,
    documentSearchAvailable,
    documentSearchOpen,
    documentSearchReplaceOpen,
    editorPreferences.preferences.showDocumentTabs,
    fileTreeOpen,
    fileTreeResizing,
    fileTreeWidth,
    resolvedSideDocumentMainPanePercent,
    resolvedSplitVisualPanePercent,
    sideDocumentOpen,
    splitMode
  ]);
  const refreshAiSelectionToolbarAnchor = useCallback(() => {
    if (!aiFeatureEnabled || sourceSurfaceActive || readOnlyMode) return;
    if (activeAiSelection?.source !== "selection" || !activeAiSelection.text.trim()) return;
    if (aiCommand.submitting || aiContextMenuActionPending || aiResult) return;

    const nextAnchor = getEditorSelectionAnchor() ?? selectionAnchorFromDomSelection(window.getSelection());
    if (!nextAnchor) return;

    syncAiSelectionToolbarFormattingState();
    setAiSelectionToolbarAnchorIfChanged(nextAnchor);
  }, [
    activeAiSelection,
    aiCommand.submitting,
    aiContextMenuActionPending,
    aiFeatureEnabled,
    aiResult,
    getEditorSelectionAnchor,
    readOnlyMode,
    setAiSelectionToolbarAnchorIfChanged,
    sourceSurfaceActive,
    syncAiSelectionToolbarFormattingState
  ]);
  useSelectionToolbarAnchorRefresh({
    active: aiSelectionToolbarVisible,
    layoutSignature: aiSelectionToolbarLayoutSignature,
    refresh: refreshAiSelectionToolbarAnchor
  });
  const handleAiSelectionToolbarOpenCommand = useCallback(() => {
    setAiSelectionToolbarAnchor(null);
    if (aiCommandVisible) return;
    handleAiCommandToggle();
  }, [aiCommandVisible, handleAiCommandToggle]);
  const handleAiSelectionToolbarAction = useCallback((intent: AiQuickActionIntent, prompt: string) => {
    if (readOnlyMode) return;

    setAiSelectionToolbarAnchor(null);
    handleAiContextMenuAction(intent, prompt);
  }, [handleAiContextMenuAction, readOnlyMode]);
  useDeferredAiSelectionReveal({
    active: aiCommandVisible,
    bottomInset: aiCommandOverlayInset,
    reveal: scrollAiSelectionAboveCommand,
    selection: activeAiSelection
  });
  const handleApplyAiResult = useCallback((restoredResult?: AiDiffResult | null, previewId?: string) => {
    if (readOnlyMode) return;

    const result = restoredResult ?? aiResults.at(-1) ?? null;
    if (!result) {
      console.warn("[markra-ai-preview] apply ignored: no pending result", {
        aiResults,
        previewId,
        restoredResult
      });
      return;
    }

    debug(() => ["[markra-ai-preview] app handle apply", {
      from: result.type === "error" ? null : result.from,
      replacementLength: result.type === "error" ? null : result.replacement.length,
      to: result.type === "error" ? null : result.to,
      type: result.type
    }]);

    const actionKey = aiPreviewActionKey(result, previewId);
    if (appliedAiPreviewKeysRef.current.has(actionKey)) {
      debug(() => ["[markra-ai-preview] apply ignored: duplicate result", {
        previewId,
        type: result.type
      }]);
      editor.confirmAiResultApplied(result, { previewId });
      return;
    }

    appliedAiPreviewKeysRef.current.add(actionKey);
    const applied = editor.applyAiResult(result, { previewId });
    debug(() => ["[markra-ai-preview] app apply result", { applied }]);

    if (!applied) {
      appliedAiPreviewKeysRef.current.delete(actionKey);
      return;
    }

    const remainingPreviews = editor.listAiPreviews();
    updateAiResults(remainingPreviews);
    if (remainingPreviews.length === 0) {
      editor.clearAiSelection();
      handleAiCommandClose();
    }
  }, [aiResults, editor, handleAiCommandClose, readOnlyMode, updateAiResults]);
  const handleRejectAiResult = useCallback((result?: AiDiffResult | null, previewId?: string) => {
    editor.clearAiSelection();
    editor.clearAiPreview(result ?? undefined, { previewId });
    const remainingPreviews = editor.listAiPreviews();
    updateAiResults(remainingPreviews);
    if (remainingPreviews.length === 0) handleAiCommandClose();
  }, [editor, handleAiCommandClose, updateAiResults]);
  const handleCopyAiResult = useCallback((restoredResult?: AiDiffResult | null) => {
    const result = restoredResult ?? aiResults.at(-1) ?? null;
    if (!result || result.type === "error") return;
    navigator.clipboard?.writeText(result.replacement);
  }, [aiResults]);
  const handleSaveClipboardImage = useCallback(async (image: File) => {
    if (readOnlyMode) return null;

    const result = await saveEditorImage({
      documentPath: document.path,
      image,
      preferences: editorPreferences.preferences,
      s3ImageUploadEnabled: s3ImageUploadFeatureEnabled
    }).catch(() => null);

    if (!result) {
      showAppToast({
        message: translate("app.clipboardImageSaveFailed"),
        status: "error"
      });
      return null;
    }

    if (result.status === "skipped") {
      const messageKey = result.reason === "s3-not-configured"
        ? "app.clipboardImageS3UploadNotConfigured"
        : result.reason === "picgo-not-configured"
          ? "app.clipboardImagePicGoUploadNotConfigured"
        : result.reason === "webdav-not-configured"
          ? "app.clipboardImageUploadNotConfigured"
          : "app.clipboardImageRequiresSavedDocument";

      showAppToast({
        message: translate(messageKey),
        status: "error"
      });
      return null;
    }

    try {
      if (result.refreshTree && document.path) {
        await refreshMarkdownFileTree(document.path);
      }
    } catch {
      showAppToast({
        message: translate("app.clipboardImageSaveFailed"),
        status: "error"
      });
      return null;
    }

    return result.image;
  }, [
    document.path,
    editorPreferences.preferences,
    readOnlyMode,
    refreshMarkdownFileTree,
    s3ImageUploadFeatureEnabled,
    translate
  ]);

  const handleSaveRemoteClipboardImage = useCallback(async (image: RemoteClipboardImage) => {
    if (readOnlyMode) return null;

    const downloadedImage = await downloadNativeWebImage({ src: image.src }).catch(() => null);
    if (!downloadedImage) {
      showAppToast({
        message: translate("app.clipboardImageSaveFailed"),
        status: "error"
      });
      return null;
    }

    return handleSaveClipboardImage(downloadedImage);
  }, [handleSaveClipboardImage, readOnlyMode, translate]);

  useEffect(() => {
    setSplitVisualPanePercent(editorPreferences.preferences.splitVisualPanePercent);
    pendingSplitVisualPanePercentRef.current = editorPreferences.preferences.splitVisualPanePercent;
  }, [editorPreferences.preferences.splitVisualPanePercent]);

  useEffect(() => {
    return () => {
      splitPaneResizeCleanupRef.current?.();
      splitPaneResizeCleanupRef.current = null;
      sideDocumentPaneResizeCleanupRef.current?.();
      sideDocumentPaneResizeCleanupRef.current = null;
      if (splitScrollSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(splitScrollSyncFrameRef.current);
        splitScrollSyncFrameRef.current = null;
      }
    };
  }, []);

  const resizeSplitVisualPane = useCallback((nextPercent: number | null) => {
    if (nextPercent === null) return;

    const roundedPercent = Math.round(nextPercent);
    pendingSplitVisualPanePercentRef.current = roundedPercent;
    setSplitVisualPanePercent(roundedPercent);
  }, []);
  const handleSplitPaneResizeEnd = useCallback(() => {
    const nextPercent = pendingSplitVisualPanePercentRef.current;
    if (nextPercent === editorPreferences.preferences.splitVisualPanePercent) return;

    const nextPreferences = {
      ...editorPreferences.preferences,
      splitVisualPanePercent: nextPercent
    };

    saveStoredEditorPreferences(nextPreferences)
      .then(() => notifyAppEditorPreferencesChanged(nextPreferences))
      .catch(() => {});
  }, [editorPreferences.preferences]);
  const handleSplitPaneResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const splitSurface = splitSurfaceRef.current;
    if (!splitSurface) return;

    const surfaceRect = splitSurface.getBoundingClientRect();
    if (surfaceRect.width <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startX = event.clientX;
    const startPercent = pendingSplitVisualPanePercentRef.current;
    const previousCursor = window.document.body.style.cursor;
    const previousUserSelect = window.document.body.style.userSelect;

    window.document.body.style.cursor = "col-resize";
    window.document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      resizeSplitVisualPane(clampNumber(
        startPercent + ((moveEvent.clientX - startX) / surfaceRect.width) * 100,
        splitVisualPanePercentMin,
        splitVisualPanePercentMax
      ));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.document.body.style.cursor = previousCursor;
      window.document.body.style.userSelect = previousUserSelect;
      splitPaneResizeCleanupRef.current = null;
      handleSplitPaneResizeEnd();
    };

    const handlePointerUp = () => {
      cleanup();
    };

    splitPaneResizeCleanupRef.current?.();
    splitPaneResizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }, [handleSplitPaneResizeEnd, resizeSplitVisualPane]);
  const handleSplitPaneResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeSplitVisualPane(clampNumber(
        splitVisualPanePercent - splitPaneKeyboardStepPercent,
        splitVisualPanePercentMin,
        splitVisualPanePercentMax
      ));
      handleSplitPaneResizeEnd();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeSplitVisualPane(clampNumber(
        splitVisualPanePercent + splitPaneKeyboardStepPercent,
        splitVisualPanePercentMin,
        splitVisualPanePercentMax
      ));
      handleSplitPaneResizeEnd();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      resizeSplitVisualPane(splitVisualPanePercentMin);
      handleSplitPaneResizeEnd();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      resizeSplitVisualPane(splitVisualPanePercentMax);
      handleSplitPaneResizeEnd();
    }
  }, [handleSplitPaneResizeEnd, resizeSplitVisualPane, splitVisualPanePercent]);
  const resizeSideDocumentMainPane = useCallback((nextPercent: number | null) => {
    if (nextPercent === null) return;

    const roundedPercent = Math.round(nextPercent);
    pendingSideDocumentMainPanePercentRef.current = roundedPercent;
    setSideDocumentMainPanePercent(roundedPercent);
  }, []);
  const handleSideDocumentPaneResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const sideDocumentSurface = sideDocumentSurfaceRef.current;
    if (!sideDocumentSurface) return;

    const surfaceRect = sideDocumentSurface.getBoundingClientRect();
    if (surfaceRect.width <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startX = event.clientX;
    const startPercent = pendingSideDocumentMainPanePercentRef.current;
    const previousCursor = window.document.body.style.cursor;
    const previousUserSelect = window.document.body.style.userSelect;

    window.document.body.style.cursor = "col-resize";
    window.document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      resizeSideDocumentMainPane(clampNumber(
        startPercent + ((moveEvent.clientX - startX) / surfaceRect.width) * 100,
        sideDocumentMainPanePercentMin,
        sideDocumentMainPanePercentMax
      ));
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.document.body.style.cursor = previousCursor;
      window.document.body.style.userSelect = previousUserSelect;
      sideDocumentPaneResizeCleanupRef.current = null;
    };

    const handlePointerUp = () => {
      cleanup();
    };

    sideDocumentPaneResizeCleanupRef.current?.();
    sideDocumentPaneResizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }, [resizeSideDocumentMainPane]);
  const handleSideDocumentPaneResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeSideDocumentMainPane(clampNumber(
        sideDocumentMainPanePercent - sideDocumentPaneKeyboardStepPercent,
        sideDocumentMainPanePercentMin,
        sideDocumentMainPanePercentMax
      ));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeSideDocumentMainPane(clampNumber(
        sideDocumentMainPanePercent + sideDocumentPaneKeyboardStepPercent,
        sideDocumentMainPanePercentMin,
        sideDocumentMainPanePercentMax
      ));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      resizeSideDocumentMainPane(sideDocumentMainPanePercentMin);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      resizeSideDocumentMainPane(sideDocumentMainPanePercentMax);
    }
  }, [resizeSideDocumentMainPane, sideDocumentMainPanePercent]);
  const handleTitlebarActionsChange = useCallback((titlebarActions: TitlebarActionPreference[]) => {
    const nextPreferences = {
      ...editorPreferences.preferences,
      titlebarActions
    };

    saveStoredEditorPreferences(nextPreferences)
      .then(() => notifyAppEditorPreferencesChanged(nextPreferences))
      .catch(() => {});
  }, [editorPreferences.preferences]);
  const handleCreateMarkdownTreeFile = useCallback(async (
    fileName: string,
    parentPath: string | null = null,
    contents?: string
  ) => {
    try {
      if (!fileTree.sourcePath) {
        captureActiveDocumentViewState();
        setActiveImageFile(null);
        await createBlankDocument({
          content: contents ?? "",
          name: unsavedMarkdownFileNameFromTreeInput(fileName)
        });
        return;
      }

      const file = await createMarkdownTreeFile(fileName, parentPath, contents);
      if (file) {
        captureActiveDocumentViewState();
        setActiveImageFile(null);
        await openTreeMarkdownFile(file);
      }
    } catch {
      // Native file errors are surfaced by the platform operation when possible.
    }
  }, [captureActiveDocumentViewState, createBlankDocument, createMarkdownTreeFile, fileTree.sourcePath, openTreeMarkdownFile]);
  const handleQuickCreateMarkdownTreeFile = useCallback(() => {
    captureActiveDocumentViewState();
    setActiveImageFile(null);
    createBlankDocument().catch(() => {});
  }, [captureActiveDocumentViewState, createBlankDocument]);
  const openImageTab = useCallback((file: NativeMarkdownFolderFile) => {
    const tab = createImageDocumentTab(file);
    setImageTabs((currentTabs) =>
      currentTabs.some((currentTab) => currentTab.id === tab.id)
        ? currentTabs.map((currentTab) => currentTab.id === tab.id ? tab : currentTab)
        : [...currentTabs, tab]
    );
    setActiveImageFile(file);
  }, []);
  const applyRenamedTreeFile = useCallback((previousPath: string, renamedFile: NativeMarkdownFolderFile) => {
    replaceOpenDocumentFile(previousPath, renamedFile);
    persistSideDocumentGroupPathUpdate({
      nextPath: renamedFile.path,
      previousPath
    });
    setImageTabs((currentTabs) => currentTabs.map((tab) =>
      tab.path === previousPath ? createImageDocumentTab(renamedFile) : tab
    ));
    setActiveImageFile((currentFile) => currentFile?.path === previousPath ? renamedFile : currentFile);
  }, [persistSideDocumentGroupPathUpdate, replaceOpenDocumentFile]);
  const applyMovedTreeFile = useCallback((
    previousFile: NativeMarkdownFolderFile,
    movedFile: NativeMarkdownFolderFile
  ) => {
    const moveFolderFile = (file: NativeMarkdownFolderFile): NativeMarkdownFolderFile => {
      const nextPath = replaceMovedPath(file.path, previousFile.path, movedFile.path);
      if (nextPath === file.path) return file;

      return {
        ...file,
        name: file.path === previousFile.path ? movedFile.name : file.name,
        path: nextPath,
        relativePath: replaceMovedPath(file.relativePath, previousFile.relativePath, movedFile.relativePath)
      };
    };

    replaceMovedOpenDocumentFile(previousFile.path, movedFile);
    persistSideDocumentGroupPathUpdate({
      nextPath: movedFile.path,
      previousPath: previousFile.path
    });
    setImageTabs((currentTabs) => currentTabs.map((tab) => {
      const movedTab = moveFolderFile(tab);
      return movedTab === tab ? tab : createImageDocumentTab(movedTab);
    }));
    setActiveImageFile((currentFile) => currentFile ? moveFolderFile(currentFile) : currentFile);
  }, [persistSideDocumentGroupPathUpdate, replaceMovedOpenDocumentFile]);
  const handleCreateMarkdownTreeFolder = useCallback(async (folderName: string, parentPath: string | null = null) => {
    try {
      await createMarkdownTreeFolder(folderName, parentPath);
    } catch {
      // Native folder errors are surfaced by the platform operation when possible.
    }
  }, [createMarkdownTreeFolder]);
  const handleRenameMarkdownTreeFile = useCallback(async (file: NativeMarkdownFolderFile, fileName: string) => {
    try {
      const renamedFile = await renameMarkdownTreeFile(file, fileName);
      if (renamedFile) applyRenamedTreeFile(file.path, renamedFile);
    } catch {
      // Keep the existing tree state if the native rename fails.
    }
  }, [applyRenamedTreeFile, renameMarkdownTreeFile]);
  const handleMoveMarkdownTreeFile = useCallback(async (
    file: NativeMarkdownFolderFile,
    targetParentPath: string | null
  ) => {
    try {
      const movedFile = await moveMarkdownTreeFile(file, targetParentPath);
      if (movedFile) applyMovedTreeFile(file, movedFile);
    } catch {
      // Keep the existing tree state if the native move fails.
    }
  }, [applyMovedTreeFile, moveMarkdownTreeFile]);
  const handleDeleteMarkdownTreeFile = useCallback(async (
    file: NativeMarkdownFolderFile,
    context?: { files: readonly NativeMarkdownFolderFile[] }
  ) => {
    const deleteTargets = context?.files?.length ? context.files : [file];
    const uniqueDeleteTargets = deleteTargets.filter((target, index, targets) =>
      targets.findIndex((candidate) => sameNativePath(candidate.path, target.path)) === index
    );
    const deletingMultipleFiles = uniqueDeleteTargets.length > 1;
    const fileIsFolder = file.kind === "folder";
    const deleteCount = String(uniqueDeleteTargets.length);
    const deleteCountLabel = translate("app.workspaceSearch.fileCountPlural").replace("{count}", deleteCount);
    const confirmed = await confirmNativeMarkdownFileDelete(deletingMultipleFiles ? deleteCountLabel : file.name, {
      cancelLabel: translate(fileIsFolder ? "app.cancelDeleteMarkdownFolder" : "app.cancelDeleteMarkdownFile"),
      message: deletingMultipleFiles
        ? translate("app.confirmDeleteSelectedMarkdownFiles").replace("{count}", deleteCount)
        : translate(fileIsFolder ? "app.confirmDeleteMarkdownFolder" : "app.confirmDeleteMarkdownFile"),
      okLabel: translate(fileIsFolder ? "app.confirmDeleteMarkdownFolderAction" : "app.confirmDeleteMarkdownFileAction")
    });
    if (!confirmed) return;

    for (const targetFile of uniqueDeleteTargets) {
      try {
        const deleted = await deleteMarkdownTreeFile(targetFile);
        if (deleted) detachDeletedDocumentFile(targetFile.path);
      } catch {
        // Leave the file visible when native deletion fails.
      }
    }
  }, [deleteMarkdownTreeFile, detachDeletedDocumentFile, translate]);
  const handleSaveMarkdownFileAsTemplate = useCallback(async (file: NativeMarkdownFolderFile) => {
    if (file.kind === "asset" || file.kind === "folder") return;

    try {
      const markdownFile = await readNativeMarkdownFile(file.path);
      if (!markdownFile.content.trim()) {
        showAppToast({
          message: translate("app.markdownTemplateSaveFailed"),
          status: "error"
        });
        return;
      }

      const template = createCustomMarkdownTemplateFromFile(markdownFile, [
        ...editorPreferences.preferences.markdownTemplates,
        ...markdownTemplates
      ]);
      const templateEntry = markdownTemplateEntryFromTemplate(template);
      const storedMarkdownTemplates = [
        ...editorPreferences.preferences.markdownTemplates,
        templateEntry
      ];
      const nextPreferences = {
        ...editorPreferences.preferences,
        markdownTemplates: storedMarkdownTemplates
      };

      await writeNativeMarkdownTemplateFile(templateEntry.fileName, template.content);
      await saveStoredEditorPreferences(nextPreferences);
      notifyAppEditorPreferencesChanged(nextPreferences).catch(() => {});
      setMarkdownTemplates((currentTemplates) => [
        ...currentTemplates,
        {
          ...template,
          fileName: templateEntry.fileName
        }
      ]);
      showAppToast({
        message: translate("app.markdownTemplateSaved"),
        status: "success"
      });
    } catch {
      showAppToast({
        message: translate("app.markdownTemplateSaveFailed"),
        status: "error"
      });
    }
  }, [editorPreferences.preferences, markdownTemplates, translate]);
  const handleOpenTreeFile = useCallback(async (file: NativeMarkdownFolderFile) => {
    captureActiveDocumentViewState();

    if (file.kind === "asset") {
      openImageTab(file);
      return;
    }

    setActiveImageFile(null);
    await openTreeMarkdownFile(file);
  }, [captureActiveDocumentViewState, openImageTab, openTreeMarkdownFile]);
  const handleQuickOpenOpen = useCallback(() => {
    hideGlobalSearch();
    hideDocumentSearch();
    setQuickOpenOpen(true);
  }, [hideDocumentSearch, hideGlobalSearch]);
  const handleQuickOpenClose = useCallback(() => {
    setQuickOpenOpen(false);
  }, []);
  const handleGlobalSearchOpen = useCallback(() => {
    setQuickOpenOpen(false);
    openGlobalSearch();
  }, [openGlobalSearch]);
  const handleGlobalSearchClose = closeGlobalSearch;
  const handleGlobalSearchQueryChange = useCallback((query: string) => {
    setGlobalSearchQuery(query);
  }, [setGlobalSearchQuery]);
  const handleGlobalSearchCaseSensitiveChange = useCallback((caseSensitive: boolean) => {
    setGlobalSearchCaseSensitive(caseSensitive);
  }, [setGlobalSearchCaseSensitive]);
  const handleGlobalSearchRecentQuerySelect = useCallback((query: string) => {
    selectGlobalSearchRecentQuery(query);
  }, [selectGlobalSearchRecentQuery]);
  const handleGlobalSearchResultOpen = useCallback(async (result: WorkspaceSearchResult) => {
    hideGlobalSearch();
    await handleOpenTreeFile(result.file);
    if (!documentSearchOpen) return;

    setDocumentSearchQuery(globalSearchQuery.trim());
    setDocumentSearchCaseSensitive(globalSearchCaseSensitive);
    setDocumentSearchReplaceOpen(false);
    selectDocumentSearchMatch(result.matchIndex);
  }, [
    documentSearchOpen,
    globalSearchCaseSensitive,
    globalSearchQuery,
    handleOpenTreeFile,
    hideGlobalSearch,
    selectDocumentSearchMatch,
    setDocumentSearchCaseSensitive,
    setDocumentSearchQuery,
    setDocumentSearchReplaceOpen
  ]);
  const handleOpenTreeFileToSide = useCallback(async (file: NativeMarkdownFolderFile) => {
    captureActiveDocumentViewState();

    if (file.kind === "asset") {
      openImageTab(file);
      return;
    }

    if (!editorPreferences.preferences.showDocumentTabs || activeImageFile || !hasOpenDocument) {
      setActiveImageFile(null);
      await openTreeMarkdownFile(file);
      return;
    }

    const tabId = await openTreeMarkdownFileInBackground(file);
    if (!activeTabId || !tabId || tabId === activeTabId) return;

    updateActiveAiSelection(null);
    handleAiCommandClose();
    if (splitMode) {
      setEditorMode("visual");
      setActiveEditorSurface("visual");
    }
    const primaryFilePath = documentTabs.find((tab) => tab.id === activeTabId)?.path ?? document.path;
    openSideDocumentGroup({
      primaryFilePath,
      primaryTabId: activeTabId,
      sideFilePath: file.path,
      sideTabId: tabId
    });
  }, [
    activeImageFile,
    activeTabId,
    captureActiveDocumentViewState,
    handleAiCommandClose,
    hasOpenDocument,
    document.path,
    documentTabs,
    editorPreferences.preferences.showDocumentTabs,
    openSideDocumentGroup,
    openImageTab,
    openTreeMarkdownFile,
    openTreeMarkdownFileInBackground,
    splitMode,
    updateActiveAiSelection
  ]);
  const handleQuickOpenFileOpen = useCallback(async (
    file: NativeMarkdownFolderFile,
    options: { toSide: boolean }
  ) => {
    setQuickOpenOpen(false);

    if (options.toSide) {
      await handleOpenTreeFileToSide(file);
      return;
    }

    await handleOpenTreeFile(file);
  }, [handleOpenTreeFile, handleOpenTreeFileToSide]);
  const handleOpenMarkdownFile = useCallback(async () => {
    captureActiveDocumentViewState();
    setActiveImageFile(null);
    await openMarkdownFile({
      pickerTitle: translate("app.openMarkdownOrFolder")
    });
  }, [captureActiveDocumentViewState, openMarkdownFile, translate]);
  const handleOpenRecentMarkdownFile = useCallback(async (file: RecentMarkdownFile) => {
    captureActiveDocumentViewState();
    setActiveImageFile(null);
    await openRecentMarkdownFile(file);
  }, [captureActiveDocumentViewState, openRecentMarkdownFile]);
  const handleCloseCurrentFile = useCallback(async () => {
    captureActiveDocumentViewState();

    const focusedSideCloseTabId =
      documentOperationTarget === "side" &&
      !activeImageFile &&
      sideDocumentGroup?.primaryTabId === activeTabId
        ? sideDocumentGroup.sideTabId
        : null;

    if (focusedSideCloseTabId) {
      const closed = await closeMarkdownTab(focusedSideCloseTabId);
      if (!closed) return;

      clearSideDocumentGroup();
      updateActiveAiSelection(null);
      handleAiCommandClose();
      return;
    }

    if (activeImageFile) {
      const closingTabId = imageDocumentTabId(activeImageFile.path);
      setImageTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== closingTabId));
      setActiveImageFile(null);
      return;
    }

    if (activeTabId) {
      const closed = await closeMarkdownTab(activeTabId);
      if (!closed) return;

      if (sideDocumentGroup?.primaryTabId === activeTabId || sideDocumentGroup?.sideTabId === activeTabId) {
        clearSideDocumentGroup();
      }
      updateActiveAiSelection(null);
      handleAiCommandClose();
      return;
    }

    const canDiscard = await confirmCanDiscardCurrentDocument();
    if (!canDiscard) return;

    updateActiveAiSelection(null);
    handleAiCommandClose();
    clearOpenDocument();
  }, [
    activeImageFile,
    activeTabId,
    captureActiveDocumentViewState,
    clearSideDocumentGroup,
    clearOpenDocument,
    closeMarkdownTab,
    confirmCanDiscardCurrentDocument,
    documentOperationTarget,
    handleAiCommandClose,
    sideDocumentGroup,
    updateActiveAiSelection
  ]);
  const handleFileTreeToggle = useCallback(() => toggleFileTree(document.path), [document.path, toggleFileTree]);
  const [fileTreeRevealPathRequest, setFileTreeRevealPathRequest] = useState<{ id: number; path: string } | null>(null);
  const fileTreeRevealPathRequestIdRef = useRef(0);
  const handleRevealPathInFileTree = useCallback((path: string | null | undefined) => {
    const targetPath = path?.trim();
    if (!targetPath) return;

    if (!fileTreeOpen) toggleFileTree(targetPath);

    fileTreeRevealPathRequestIdRef.current += 1;
    setFileTreeRevealPathRequest({
      id: fileTreeRevealPathRequestIdRef.current,
      path: targetPath
    });
  }, [fileTreeOpen, toggleFileTree]);
  const handleDocumentHistoryOpen = useCallback(() => {
    if (!documentHistoryAvailable) return;

    setDocumentHistoryOpen((current) => !current);
  }, [documentHistoryAvailable]);
  const handleDocumentHistoryRestore = useCallback((contents: string, historyId: string) => {
    debug(() => ["[markra-history] app restore requested", {
      contentsChars: contents.length,
      currentDirty: document.dirty,
      currentPath: document.path,
      currentRevision: document.revision,
      historyId
    }]);

    const restored = restoreDocumentContent(contents);
    debug(() => ["[markra-history] app restore state result", {
      restored
    }]);
    if (!restored) return;

    const editorReplaced = replaceEditorMarkdown(contents);
    debug(() => ["[markra-history] editor replace requested", {
      editorReplaced
    }]);
    saveCurrentDocumentContent(contents, {
      historyCursorId: historyId,
      skipHistorySnapshot: true
    })
      .then((savedFile) => {
        debug(() => ["[markra-history] save restored document success", {
          savedPath: savedFile?.path ?? null
        }]);
      })
      .catch((error: unknown) => {
        debug(() => ["[markra-history] save restored document failed", {
          error: error instanceof Error ? error.message : String(error)
        }]);
      });
  }, [
    document.dirty,
    document.path,
    document.revision,
    replaceEditorMarkdown,
    restoreDocumentContent,
    saveCurrentDocumentContent
  ]);
  useEffect(() => {
    if (documentHistoryAvailable) return;

    setDocumentHistoryOpen(false);
  }, [documentHistoryAvailable]);
  const refreshOpenDocumentHistory = useCallback((savedPath: string | null) => {
    if (!documentHistoryOpen || savedPath === null || savedPath !== document.path) return;

    setDocumentHistoryRefreshKey((current) => current + 1);
  }, [document.path, documentHistoryOpen]);
  const handleAiAgentToggle = useCallback(() => {
    toggleAiAgentPanel();
  }, [toggleAiAgentPanel]);
  const handleAiCommandTransferToAgentPanel = useCallback((promptValue: string) => {
    const draft = promptValue.trim();
    if (draft) aiAgent.setDraft(draft);
    openAiAgentPanel();
    aiCommand.closeAiCommand();
  }, [aiAgent.setDraft, aiCommand.closeAiCommand, openAiAgentPanel]);
  const handleOpenSettings = useCallback(() => {
    openSettingsWindow().catch(() => {});
  }, []);
  const handleShowAbout = useCallback(() => {
    showNativeAppAbout().catch(() => {});
  }, []);
  const handleExitApp = useCallback(() => {
    closeNativeWindow().catch(() => {});
  }, []);
  const rawFileTreeRootName = rootNameForDocument(document.path);
  const fileTreeRootName =
    rawFileTreeRootName === "No folder"
      ? translate("app.noFolder")
      : rawFileTreeRootName === "Files"
        ? translate("app.files")
        : rawFileTreeRootName;
  const saveDocument = useCallback(async (saveAs = false) => {
    if (focusedSideDocumentTabId) {
      const savedFile = await saveMarkdownTab(focusedSideDocumentTabId, saveAs);
      if (savedFile) persistSideDocumentGroupSavedTabPath(focusedSideDocumentTabId, savedFile.path);
      if (savedFile && syncSettings.settings.autoSyncOnSave) {
        runWorkspaceSync({ silent: true, sourcePath: savedFile.path }).catch(() => {});
      }
      return savedFile;
    }

    const savedFile = await saveCurrentDocument(saveAs);
    if (savedFile && activeTabId) persistSideDocumentGroupSavedTabPath(activeTabId, savedFile.path);
    if (savedFile) refreshOpenDocumentHistory(savedFile.path);
    if (savedFile && syncSettings.settings.autoSyncOnSave) {
      runWorkspaceSync({ silent: true, sourcePath: savedFile.path }).catch(() => {});
    }
    return savedFile;
  }, [
    activeTabId,
    focusedSideDocumentTabId,
    persistSideDocumentGroupSavedTabPath,
    refreshOpenDocumentHistory,
    runWorkspaceSync,
    saveCurrentDocument,
    saveMarkdownTab,
    syncSettings.settings.autoSyncOnSave
  ]);
  const handleSaveDocument = useCallback(() => saveDocument(false), [saveDocument]);
  const saveDocumentAs = useCallback(() => saveDocument(true), [saveDocument]);
  const resolveSideDocumentImageSrc = useMemo(
    () => createMarkdownImageSrcResolver(sideDocumentTab?.path ?? null),
    [sideDocumentTab?.path]
  );
  const documentTabsVisible =
    editorPreferences.preferences.showDocumentTabs &&
    (hasOpenDocument || Boolean(activeImageFile)) &&
    titlebarTabs.some((tab) => titlebarTabs.length > 1 || tab.path !== null || tab.dirty);
  const currentFileTreePath = activeImageFile?.path ?? (
    focusedSideDocumentTabId && sideDocumentTab?.path
      ? sideDocumentTab.path
      : hasOpenDocument ? document.path : null
  );
  const titleDocumentName = activeImageFile ? activeImageFile.name : hasOpenDocument ? document.name : fileTreeRootName;
  const titleDocumentKind = activeImageFile ? "image" : hasOpenDocument ? "file" : "folder";
  const sourceModeAvailable = hasOpenDocument && !activeImageFile;
  const supportsAiThinking = selectedInlineAiModel?.capabilities.includes("reasoning") ?? false;
  const handleMainDocumentPaneFocus = useCallback(() => {
    setDocumentOperationTarget("main");
  }, []);
  const handleVisualPaneFocus = useCallback(() => {
    setDocumentOperationTarget("main");
    setActiveEditorSurface("visual");
  }, []);
  const handleSourcePaneFocus = useCallback(() => {
    setDocumentOperationTarget("main");
    setActiveEditorSurface("source");
    updateActiveAiSelection(null);
  }, [updateActiveAiSelection]);
  const handleSideDocumentPaneFocus = useCallback(() => {
    setDocumentOperationTarget("side");
  }, []);
  const handleVisualMarkdownChange = useCallback((content: string, options?: { documentRevision?: number }) => {
    if (isApplyingSourceToVisualSync()) return;
    if (sourceSurfaceActive) return;
    if (readOnlyMode) return;

    if (splitMode) setActiveEditorSurface("visual");
    handleMarkdownChange(content, { ...options, surface: "visual" });
  }, [handleMarkdownChange, isApplyingSourceToVisualSync, readOnlyMode, sourceSurfaceActive, splitMode]);
  const handleSourceMarkdownChange = useCallback((content: string, options?: { documentRevision?: number }) => {
    if (readOnlyMode) return;

    markSourceEditForHistory(content, options);
    if (splitMode) setActiveEditorSurface("source");
    handleMarkdownChange(content, { ...options, surface: "source" });
  }, [handleMarkdownChange, markSourceEditForHistory, readOnlyMode, splitMode]);
  const syncSplitPaneScrollPosition = useCallback((sourceSurface: EditorSurface, sourceElement: HTMLElement) => {
    if (!splitMode) return false;

    if (splitScrollSyncTargetRef.current === sourceSurface) {
      splitScrollSyncTargetRef.current = null;
      return false;
    }

    const targetSurface: EditorSurface = sourceSurface === "source" ? "visual" : "source";
    const targetElement = targetSurface === "visual" ? visualScrollRef.current : sourceScrollRef.current;
    if (!targetElement) return false;

    const sourceMaxScrollTop = Math.max(0, sourceElement.scrollHeight - sourceElement.clientHeight);
    const targetMaxScrollTop = Math.max(0, targetElement.scrollHeight - targetElement.clientHeight);
    if (targetMaxScrollTop <= 0) return true;

    const nextScrollTop =
      sourceMaxScrollTop <= 0
        ? 0
        : Math.round((sourceElement.scrollTop / sourceMaxScrollTop) * targetMaxScrollTop);
    if (Math.abs(targetElement.scrollTop - nextScrollTop) >= 1) {
      splitScrollSyncTargetRef.current = targetSurface;
      targetElement.scrollTop = nextScrollTop;
      window.setTimeout(() => {
        if (splitScrollSyncTargetRef.current === targetSurface) {
          splitScrollSyncTargetRef.current = null;
        }
      }, 0);
    }

    return true;
  }, [splitMode]);
  const scheduleSplitPaneScrollResync = useCallback((sourceSurface: EditorSurface, sourceElement: HTMLElement) => {
    if (!splitMode) return;

    if (splitScrollSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(splitScrollSyncFrameRef.current);
    }

    splitScrollSyncFrameRef.current = window.requestAnimationFrame(() => {
      splitScrollSyncFrameRef.current = null;
      if (!sourceElement.isConnected) return;

      syncSplitPaneScrollPosition(sourceSurface, sourceElement);
    });
  }, [splitMode, syncSplitPaneScrollPosition]);
  const syncSplitPaneScroll = useCallback((sourceSurface: EditorSurface, event: ReactUIEvent<HTMLElement>) => {
    const sourceElement = event.currentTarget;
    if (!syncSplitPaneScrollPosition(sourceSurface, sourceElement)) return;

    scheduleSplitPaneScrollResync(sourceSurface, sourceElement);
  }, [scheduleSplitPaneScrollResync, syncSplitPaneScrollPosition]);
  const handleSourcePaneScroll = useCallback((event: ReactUIEvent<HTMLElement>) => {
    saveDocumentTabViewState(activeTabId, { sourceScrollTop: event.currentTarget.scrollTop });
    syncSplitPaneScroll("source", event);
  }, [activeTabId, saveDocumentTabViewState, syncSplitPaneScroll]);
  const handleVisualPaneScroll = useCallback((event: ReactUIEvent<HTMLElement>) => {
    saveDocumentTabViewState(activeTabId, { visualScrollTop: event.currentTarget.scrollTop });
    syncSplitPaneScroll("visual", event);
  }, [activeTabId, saveDocumentTabViewState, syncSplitPaneScroll]);
  const syncVisualMarkdownAfterEditorCommand = useCallback(() => {
    if (readOnlyMode || !splitMode) return;

    handleVisualMarkdownChange(getEditorCurrentMarkdown(document.content), {
      documentRevision: document.revision
    });
  }, [document.content, document.revision, getEditorCurrentMarkdown, handleVisualMarkdownChange, readOnlyMode, splitMode]);
  const handleInsertMarkdownSnippet = useCallback((...args: Parameters<typeof insertEditorMarkdownSnippet>) => {
    if (readOnlyMode) return;

    insertEditorMarkdownSnippet(...args);
    syncVisualMarkdownAfterEditorCommand();
  }, [insertEditorMarkdownSnippet, readOnlyMode, syncVisualMarkdownAfterEditorCommand]);
  const handleInsertMarkdownImage = useCallback(() => {
    if (readOnlyMode) return;

    insertEditorMarkdownImage();
    syncVisualMarkdownAfterEditorCommand();
  }, [insertEditorMarkdownImage, readOnlyMode, syncVisualMarkdownAfterEditorCommand]);
  const handleInsertMarkdownLink = useCallback(() => {
    runEditorLinkCommand({
      insertMarkdownLink: insertEditorMarkdownLink,
      readOnlyMode,
      syncAiSelectionToolbarFormattingState,
      syncVisualMarkdownAfterEditorCommand
    });
  }, [
    insertEditorMarkdownLink,
    readOnlyMode,
    syncAiSelectionToolbarFormattingState,
    syncVisualMarkdownAfterEditorCommand
  ]);
  const handleInsertMarkdownTable = useCallback(() => {
    if (readOnlyMode) return;

    insertEditorMarkdownTable();
    syncVisualMarkdownAfterEditorCommand();
  }, [insertEditorMarkdownTable, readOnlyMode, syncVisualMarkdownAfterEditorCommand]);
  const handleRunEditorShortcut = useCallback((...args: Parameters<typeof runEditorShortcut>) => {
    if (readOnlyMode) return false;

    const handled = runEditorShortcut(...args);
    syncVisualMarkdownAfterEditorCommand();
    return handled;
  }, [readOnlyMode, runEditorShortcut, syncVisualMarkdownAfterEditorCommand]);
  const handleAiSelectionToolbarFormattingAction = useCallback((action: SelectionFormattingToolbarAction) => {
    if (readOnlyMode) return;

    if (action === "highlight") {
      if (!toggleEditorSelectionHighlight()) return;

      syncVisualMarkdownAfterEditorCommand();
      syncAiSelectionToolbarFormattingState();
      return;
    }

    if (action === "clearFormatting") {
      if (!clearEditorSelectionFormatting()) return;

      syncVisualMarkdownAfterEditorCommand();
      syncAiSelectionToolbarFormattingState();
      return;
    }

    const normalizedShortcuts = normalizeMarkdownShortcuts(editorPreferences.preferences.markdownShortcuts);
    const shortcut = markdownShortcutToKeyboardEventInit(normalizedShortcuts[action]);
    if (!shortcut) return;

    handleRunEditorShortcut(shortcut.key, {
      altKey: Boolean(shortcut.altKey),
      shiftKey: Boolean(shortcut.shiftKey)
    });
    syncAiSelectionToolbarFormattingState();
  }, [
    clearEditorSelectionFormatting,
    editorPreferences.preferences.markdownShortcuts,
    handleRunEditorShortcut,
    readOnlyMode,
    syncAiSelectionToolbarFormattingState,
    syncVisualMarkdownAfterEditorCommand,
    toggleEditorSelectionHighlight
  ]);
  const handleAiSelectionToolbarHeadingLevelAction = useCallback((level: SelectionHeadingLevel) => {
    if (readOnlyMode) return;
    if (!setEditorSelectionHeadingLevel(level)) return;

    syncVisualMarkdownAfterEditorCommand();
    syncAiSelectionToolbarFormattingState();
  }, [
    readOnlyMode,
    setEditorSelectionHeadingLevel,
    syncAiSelectionToolbarFormattingState,
    syncVisualMarkdownAfterEditorCommand
  ]);
  const handleAiSelectionToolbarInsertLink = useCallback(() => {
    if (readOnlyMode) return;

    setAiSelectionToolbarAnchor(null);
    handleInsertMarkdownLink();
  }, [handleInsertMarkdownLink, readOnlyMode]);
  const handleAiSelectionToolbarCopySelection = useCallback(() => {
    const selectedText = activeAiSelection?.source === "selection" ? activeAiSelection.text : "";
    if (!selectedText.trim() || !navigator.clipboard) return;

    navigator.clipboard.writeText(selectedText)
      .then(() => {
        if (aiSelectionCopySuccessTimerRef.current !== null) {
          window.clearTimeout(aiSelectionCopySuccessTimerRef.current);
        }

        setAiSelectionToolbarCopySucceeded(true);
        aiSelectionCopySuccessTimerRef.current = window.setTimeout(() => {
          aiSelectionCopySuccessTimerRef.current = null;
          setAiSelectionToolbarCopySucceeded(false);
        }, aiSelectionCopySuccessMs);
      })
      .catch(() => {});
  }, [activeAiSelection]);
  const handleDocumentSearchOpen = useCallback(() => {
    openDocumentSearch();
  }, [openDocumentSearch]);
  const handleDocumentReplaceOpen = useCallback(() => {
    openDocumentReplace();
  }, [openDocumentReplace]);
  const handleDocumentSearchClose = useCallback(() => {
    closeDocumentSearch();
  }, [closeDocumentSearch]);
  const handleDocumentSearchQueryChange = useCallback((query: string) => {
    setDocumentSearchQuery(query);
  }, [setDocumentSearchQuery]);
  const handleDocumentSearchCaseSensitiveChange = useCallback((caseSensitive: boolean) => {
    setDocumentSearchCaseSensitive(caseSensitive);
  }, [setDocumentSearchCaseSensitive]);
  const handleDocumentSearchNext = useCallback(() => {
    navigateDocumentSearch(1);
  }, [navigateDocumentSearch]);
  const handleDocumentSearchPrevious = useCallback(() => {
    navigateDocumentSearch(-1);
  }, [navigateDocumentSearch]);
  const handleDocumentReplace = useCallback(() => {
    if (readOnlyMode || !activeDocumentSearchMatch) return;

    if (documentSearchSurface === "source") {
      handleSourceMarkdownChange(replaceTextRange(document.content, activeDocumentSearchMatch, documentSearchReplacement));
      return;
    }

    replaceEditorSearchMatch(activeDocumentSearchMatch, documentSearchReplacement);
  }, [
    activeDocumentSearchMatch,
    document.content,
    documentSearchReplacement,
    documentSearchSurface,
    handleSourceMarkdownChange,
    replaceEditorSearchMatch,
    readOnlyMode
  ]);
  const handleDocumentReplaceAll = useCallback(() => {
    if (readOnlyMode || documentSearchMatches.length === 0) return;

    if (documentSearchSurface === "source") {
      handleSourceMarkdownChange(replaceTextRanges(document.content, documentSearchMatches, documentSearchReplacement));
      resetDocumentSearchActiveIndex();
      return;
    }

    replaceAllEditorSearchMatches(documentSearchMatches, documentSearchReplacement);
    resetDocumentSearchActiveIndex();
  }, [
    document.content,
    documentSearchMatches,
    documentSearchReplacement,
    documentSearchSurface,
    handleSourceMarkdownChange,
    replaceAllEditorSearchMatches,
    readOnlyMode,
    resetDocumentSearchActiveIndex
  ]);
  useEffect(() => {
    if (!documentSearchOpen || !documentSearchAvailable || documentSearchSurface !== "visual") {
      setVisualDocumentSearchMatches([]);
      return;
    }

    setVisualDocumentSearchMatches(
      findEditorSearchMatches(documentSearchQuery, {
        caseSensitive: documentSearchCaseSensitive
      })
    );
  }, [
    document.revision,
    documentSearchAvailable,
    documentSearchCaseSensitive,
    documentSearchOpen,
    documentSearchQuery,
    documentSearchSurface,
    findEditorSearchMatches,
    visualEditorReadySequence
  ]);
  useEffect(() => {
    if (!documentSearchOpen || documentSearchSurface !== "visual") {
      showEditorSearchMatches([], -1, { suppressEditorChrome: false });
      return;
    }

    showEditorSearchMatches(visualDocumentSearchMatches, normalizedDocumentSearchActiveIndex, {
      suppressEditorChrome: true
    });
  }, [
    documentSearchOpen,
    documentSearchSurface,
    normalizedDocumentSearchActiveIndex,
    showEditorSearchMatches,
    visualDocumentSearchMatches
  ]);
  useEffect(() => {
    if (!documentSearchOpen || documentSearchSurface !== "visual") return;
    if (documentSearchRevealRevision === lastDocumentSearchRevealRevisionRef.current) return;

    lastDocumentSearchRevealRevisionRef.current = documentSearchRevealRevision;
    revealEditorSearchMatch(activeDocumentSearchMatch);
  }, [
    activeDocumentSearchMatch,
    documentSearchOpen,
    documentSearchRevealRevision,
    documentSearchSurface,
    revealEditorSearchMatch
  ]);
  useEffect(() => {
    exportContextRef.current = {
      activeImageFile: Boolean(activeImageFile),
      content: document.content,
      hasOpenDocument,
      name: document.name || "Untitled.md",
      path: document.path
    };
  }, [activeImageFile, document.content, document.name, document.path, hasOpenDocument]);
  const handleEditorModeToggle = useCallback(() => {
    if (!sourceModeAvailable) return;

    captureActiveDocumentViewState();

    if (sourceMode) {
      syncSourceEditsToVisualHistory();
      queueEditorModeScroll("visual");
      setEditorMode("visual");
      setActiveEditorSurface("visual");
      return;
    }

    updateActiveAiSelection(null);
    handleAiCommandClose();
    queueEditorModeScroll("source");
    setEditorMode("source");
    setActiveEditorSurface("source");
  }, [
    captureActiveDocumentViewState,
    handleAiCommandClose,
    queueEditorModeScroll,
    sourceMode,
    sourceModeAvailable,
    syncSourceEditsToVisualHistory,
    updateActiveAiSelection
  ]);
  const handleEditorSplitToggle = useCallback(() => {
    if (!sourceModeAvailable) return;

    captureActiveDocumentViewState();

    if (splitMode) {
      setEditorMode("visual");
      setActiveEditorSurface("visual");
      return;
    }

    updateActiveAiSelection(null);
    handleAiCommandClose();
    if (sideDocumentGroup) clearSideDocumentGroup();
    setEditorMode("split");
    setActiveEditorSurface(sourceMode ? "source" : "visual");
  }, [
    captureActiveDocumentViewState,
    clearSideDocumentGroup,
    handleAiCommandClose,
    sideDocumentGroup,
    sourceMode,
    sourceModeAvailable,
    splitMode,
    updateActiveAiSelection
  ]);
  const handleOpenMarkdownFolder = useCallback(async () => {
    captureActiveDocumentViewState();
    await openMarkdownFolder({
      beforeOpenFolder: () => {
        const canDiscard = confirmCanDiscardCurrentDocument();
        if (typeof canDiscard !== "boolean") {
          return canDiscard.then((confirmed) => {
            if (!confirmed) return false;

            setActiveImageFile(null);
            clearOpenDocument({ persistWorkspace: false });

            return true;
          });
        }
        if (!canDiscard) return false;

        setActiveImageFile(null);
        clearOpenDocument({ persistWorkspace: false });

        return true;
      },
      pickerTitle: translate("app.openFolder")
    });
  }, [captureActiveDocumentViewState, clearOpenDocument, confirmCanDiscardCurrentDocument, openMarkdownFolder, translate]);
  const handleOpenRecentMarkdownFolder = useCallback(async (folder: RecentMarkdownFolder) => {
    captureActiveDocumentViewState();
    const canDiscard = await confirmCanDiscardCurrentDocument();
    if (!canDiscard) return;

    const openedFolder = await openRecentFolder(folder);
    if (!openedFolder) return;

    setActiveImageFile(null);
    clearOpenDocument({ persistWorkspace: false });
  }, [captureActiveDocumentViewState, clearOpenDocument, confirmCanDiscardCurrentDocument, openRecentFolder]);
  const handleOpenContainingFolder = useCallback((path: string) => {
    openNativeContainingFolder(path).catch(() => {});
  }, []);
  const clearExportSnapshot = useCallback((id: number) => {
    setExportSnapshot((current) => current?.id === id ? null : current);
  }, []);
  const beginDocumentExport = useCallback((kind: MarkdownExportSnapshot["kind"]) => {
    if (!exportFeatureEnabled) return;

    const context = exportContextRef.current;
    if (!context.hasOpenDocument || context.activeImageFile) return;

    exportRequestIdRef.current += 1;
    setExportSnapshot({
      id: exportRequestIdRef.current,
      kind,
      markdown: readCurrentMarkdownForDocument(context.content),
      title: context.name
    });
  }, [exportFeatureEnabled, readCurrentMarkdownForDocument]);
  const handleRenderedExport = useCallback((exported: RenderedMarkdownExport) => {
    if (!exportFeatureEnabled || exportSnapshot?.id !== exported.id) return;

    const pdfSettings = exported.kind === "pdf" ? exportSettings.settings : null;
    const contents = buildMarkdownHtmlDocument({
      bodyHtml: exported.bodyHtml,
      language: appLanguage.language,
      pdfAuthor: pdfSettings?.pdfAuthor,
      pdfFooter: pdfSettings?.pdfFooter,
      pdfHeader: pdfSettings?.pdfHeader,
      pdfHeightMm: pdfSettings?.pdfHeightMm,
      pdfMarginMm: pdfSettings?.pdfMarginMm,
      pdfPageBreakOnH1: pdfSettings?.pdfPageBreakOnH1,
      pdfWidthMm: pdfSettings?.pdfWidthMm,
      title: exported.title
    });
    const suggestedName = exportDocumentFileName(exported.title, exported.kind);

    if (exported.kind === "html") {
      saveNativeHtmlFile({
        contents,
        suggestedName
      }).catch(() => {}).finally(() => {
        clearExportSnapshot(exported.id);
      });
      return;
    }

    saveNativePdfFile({
      contents,
      suggestedName
    }).catch(() => {}).finally(() => {
      clearExportSnapshot(exported.id);
    });
  }, [appLanguage.language, clearExportSnapshot, exportFeatureEnabled, exportSettings.settings, exportSnapshot?.id]);
  const exportHtmlDocument = useCallback(() => beginDocumentExport("html"), [beginDocumentExport]);
  const exportPdfDocument = useCallback(() => beginDocumentExport("pdf"), [beginDocumentExport]);
  const exportPandocDocument = useCallback((format: NativePandocExportFormat) => {
    if (!exportFeatureEnabled || !pandocFeatureEnabled) return;

    const context = exportContextRef.current;
    if (!context.hasOpenDocument || context.activeImageFile) return;

    saveNativePandocFile({
      documentPath: context.path,
      format,
      markdown: readCurrentMarkdownForDocument(context.content),
      pandocArgs: exportSettings.settings.pandocArgs,
      pandocPath: exportSettings.settings.pandocPath,
      suggestedName: exportDocumentFileName(context.name, format)
    }).catch((error: unknown) => {
      if (!isPandocSetupError(error)) {
        showAppToast({
          message: translate("app.pandocExportFailed"),
          status: "error"
        });
        return;
      }

      showNativePandocSetup({
        cancelLabel: translate("app.cancelPandocSetup"),
        installLabel: translate("app.installPandoc"),
        message: translate("app.pandocRequiredMessage"),
        setPathLabel: translate("app.setPandocPath"),
        title: translate("app.pandocRequiredTitle")
      })
        .then(runPandocSetupAction)
        .catch(() => {});
    });
  }, [
    exportFeatureEnabled,
    exportSettings.settings.pandocArgs,
    exportSettings.settings.pandocPath,
    pandocFeatureEnabled,
    readCurrentMarkdownForDocument,
    translate
  ]);
  const exportDocxDocument = useCallback(() => exportPandocDocument("docx"), [exportPandocDocument]);
  const exportEpubDocument = useCallback(() => exportPandocDocument("epub"), [exportPandocDocument]);
  const exportLatexDocument = useCallback(() => exportPandocDocument("latex"), [exportPandocDocument]);
  useEffect(() => {
    if (sourceModeAvailable) return;

    setEditorMode("visual");
    setActiveEditorSurface("visual");
  }, [sourceModeAvailable]);
  useEffect(() => {
    if (activeImageFile || !activeTabId || !hasOpenDocument) return;

    const viewState = documentTabViewStatesRef.current.get(activeTabId);
    const restoreFrame = window.requestAnimationFrame(() => {
      if ((editorMode === "visual" || editorMode === "split") && visualScrollRef.current) {
        const pendingScroll = pendingEditorModeScrollRef.current;
        const visualScrollTop = pendingScroll?.tabId === activeTabId && pendingScroll.targetSurface === "visual"
          ? pendingScroll.progress * Math.max(0, visualScrollRef.current.scrollHeight - visualScrollRef.current.clientHeight)
          : viewState?.visualScrollTop ?? 0;
        restoreElementScrollTop(visualScrollRef.current, visualScrollTop);
        saveDocumentTabViewState(activeTabId, { visualScrollTop });
      }

      if ((editorMode === "source" || editorMode === "split") && sourceScrollRef.current) {
        const pendingScroll = pendingEditorModeScrollRef.current;
        const sourceScrollTop = pendingScroll?.tabId === activeTabId && pendingScroll.targetSurface === "source"
          ? pendingScroll.progress * Math.max(0, sourceScrollRef.current.scrollHeight - sourceScrollRef.current.clientHeight)
          : viewState?.sourceScrollTop ?? 0;
        restoreElementScrollTop(sourceScrollRef.current, sourceScrollTop);
        saveDocumentTabViewState(activeTabId, { sourceScrollTop });
      }

      const pendingScroll = pendingEditorModeScrollRef.current;
      if (pendingScroll?.tabId === activeTabId && (
        pendingScroll.targetSurface === editorMode
        || editorMode === "split"
      )) {
        pendingEditorModeScrollRef.current = null;
      }
    });

    return () => {
      window.cancelAnimationFrame(restoreFrame);
    };
  }, [
    activeImageFile,
    activeTabId,
    document.revision,
    editorMode,
    hasOpenDocument,
    saveDocumentTabViewState,
    visualEditorReadySequence
  ]);
  const aiAgentContext = useMemo(() => ({
    documentName: titleDocumentName,
    headingCount: outlineItems.length,
    messageCount: aiAgent.messages.length,
    sectionCount: outlineItems.length,
    selectionChars: activeAiSelection?.text.trim().length ?? 0,
    sessionId: activeAiAgentSessionId,
    tableCount: editor.getTableAnchors().length
  }), [
    activeAiAgentSessionId,
    activeAiSelection,
    aiAgent.messages.length,
    document.content,
    titleDocumentName,
    document.revision,
    editor,
    outlineItems.length
  ]);
  const appUpdater = useAutoUpdater(appLanguage.language, updaterFeatureEnabled && appLanguage.ready && !editorPreferences.loading, {
    autoCheck: updaterFeatureEnabled && editorPreferences.preferences.autoUpdateEnabled,
    beforeRestart: saveDirtyMarkdownFiles,
    confirmRestart: confirmCanDiscardCurrentDocument
  });
  const nativeMenuHandlers = useNativeMenuHandlers({
    checkForUpdates: updaterFeatureEnabled ? appUpdater.checkForUpdates : undefined,
    closeDocument: handleCloseCurrentFile,
    exportDocx: exportFeatureEnabled && pandocFeatureEnabled ? exportDocxDocument : undefined,
    exportEpub: exportFeatureEnabled && pandocFeatureEnabled ? exportEpubDocument : undefined,
    exportHtml: exportFeatureEnabled ? exportHtmlDocument : undefined,
    exportLatex: exportFeatureEnabled && pandocFeatureEnabled ? exportLatexDocument : undefined,
    exportPdf: exportFeatureEnabled ? exportPdfDocument : undefined,
    insertMarkdownImage: handleInsertMarkdownImage,
    insertMarkdownLink: handleInsertMarkdownLink,
    insertMarkdownSnippet: handleInsertMarkdownSnippet,
    insertMarkdownTable: handleInsertMarkdownTable,
    language: appLanguage.language,
    markdownShortcuts: editorPreferences.preferences.markdownShortcuts,
    openDocument: handleOpenMarkdownFile,
    openRecentFile: handleOpenRecentMarkdownFile,
    clearRecentFiles: clearRecentMarkdownFiles,
    openFolder: handleOpenMarkdownFolder,
    openQuickOpen: handleQuickOpenOpen,
    runAiQuickAction: aiFeatureEnabled ? handleAiContextMenuAction : undefined,
    runEditorShortcut: handleRunEditorShortcut,
    saveDocument: handleSaveDocument,
    saveDocumentAs,
    toggleAiAgent: aiFeatureEnabled ? handleAiAgentToggle : undefined,
    toggleAiCommand: aiFeatureEnabled ? handleAiCommandToggle : undefined,
    toggleDocumentHistory: handleDocumentHistoryOpen,
    toggleFullscreen: toggleNativeWindowFullscreen,
    toggleMarkdownFiles: handleFileTreeToggle,
    toggleReadOnlyMode: handleReadOnlyModeToggle,
    toggleSourceMode: handleEditorModeToggle
  });

  useNativeMarkdownDrop(handleDroppedMarkdownPath);
  useNativeMenus(nativeMenuHandlers, appLanguage.ready ? appLanguage.language : null, {
    getAiCommandsAvailable: aiFeatureEnabled ? getAiContextMenuAvailable : () => false,
    markdownShortcuts: editorPreferences.preferences.markdownShortcuts,
    recentFiles: recentMarkdownFiles
  });
  useApplicationShortcuts({
    closeDocument: handleCloseCurrentFile,
    exportHtml: exportFeatureEnabled ? exportHtmlDocument : undefined,
    exportPdf: exportFeatureEnabled ? exportPdfDocument : undefined,
    markdownShortcuts: editorPreferences.preferences.markdownShortcuts,
    openDocument: handleOpenMarkdownFile,
    openDocumentReplace: handleDocumentReplaceOpen,
    openDocumentSearch: handleDocumentSearchOpen,
    openWorkspaceSearch: handleGlobalSearchOpen,
    openFolder: handleOpenMarkdownFolder,
    openQuickOpen: handleQuickOpenOpen,
    platform: desktopPlatform,
    saveDocument: handleSaveDocument,
    saveDocumentAs,
    toggleAiAgent: aiFeatureEnabled ? handleAiAgentToggle : undefined,
    toggleAiCommand: aiFeatureEnabled ? handleAiCommandToggle : undefined,
    toggleDocumentHistory: handleDocumentHistoryOpen,
    toggleMarkdownFiles: handleFileTreeToggle,
    toggleReadOnlyMode: handleReadOnlyModeToggle,
    toggleSourceMode: handleEditorModeToggle
  });

  const quickOpenFilePaths = useMemo(
    () => [
      ...documentTabs.flatMap((tab) => tab.path ? [tab.path] : []),
      ...imageTabs.map((tab) => tab.path)
    ],
    [documentTabs, imageTabs]
  );

  useEffect(() => {
    const handlePreviewAction = (event: Event) => {
      const detail = (event as CustomEvent<Partial<AiEditorPreviewActionDetail>>).detail;
      const action = detail?.action;
      debug(() => ["[markra-ai-preview] app received action event", detail]);

      if (action === "apply") {
        handleApplyAiResult(detail.result, detail.previewId);
        return;
      }

      if (action === "copy") {
        handleCopyAiResult(detail.result);
        return;
      }

      if (action === "reject") {
        handleRejectAiResult(detail.result, detail.previewId);
      }
    };

    window.addEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, handlePreviewAction);
    return () => {
      window.removeEventListener(AI_EDITOR_PREVIEW_ACTION_EVENT, handlePreviewAction);
    };
  }, [handleApplyAiResult, handleCopyAiResult, handleRejectAiResult]);

  useEffect(() => {
    const handlePreviewApplied = (event: Event) => {
      const detail = (event as CustomEvent<Partial<AiEditorPreviewAppliedDetail>>).detail;
      const result = detail?.result;
      if (!result || (result.type !== "insert" && result.type !== "replace")) return;

      const actionKey = aiPreviewActionKey(result, detail?.previewId);
      if (!appliedAiPreviewKeysRef.current.has(actionKey)) return;

      debug(() => ["[markra-ai-preview] app observed preview applied", {
        actionKey,
        pendingPreviewCount: detail?.previews?.length ?? 0,
        previewId: detail?.previewId,
        resultSignature: aiResultSignature(result)
      }]);
      editor.confirmAiResultApplied(result, { previewId: detail?.previewId });
      const remainingPreviews = editor.listAiPreviews();
      updateAiResults(remainingPreviews);
      if (remainingPreviews.length === 0) {
        editor.clearAiSelection();
        handleAiCommandClose();
      }
    };

    window.addEventListener(AI_EDITOR_PREVIEW_APPLIED_EVENT, handlePreviewApplied);
    return () => {
      window.removeEventListener(AI_EDITOR_PREVIEW_APPLIED_EVENT, handlePreviewApplied);
    };
  }, [editor, handleAiCommandClose, updateAiResults]);

  useEffect(() => {
    const handlePreviewRestore = (event: Event) => {
      const detail = (event as CustomEvent<Partial<AiEditorPreviewRestoreDetail>>).detail;
      const result = detail?.result;
      if (!result || (result.type !== "insert" && result.type !== "replace")) return;

      debug(() => ["[markra-ai-preview] app observed preview restore", {
        pendingPreviewCount: detail?.previews?.length ?? 0,
        previewId: detail?.previewId,
        resultSignature: aiResultSignature(result)
      }]);
      appliedAiPreviewKeysRef.current.delete(aiPreviewActionKey(result, detail?.previewId));
      updateAiResults(editor.listAiPreviews());
      restoreAiCommand({ reopen: false });
    };

    window.addEventListener(AI_EDITOR_PREVIEW_RESTORE_EVENT, handlePreviewRestore);
    return () => {
      window.removeEventListener(AI_EDITOR_PREVIEW_RESTORE_EVENT, handlePreviewRestore);
    };
  }, [editor, restoreAiCommand, updateAiResults]);

  const handleOpenTitlebarTabToSide = useCallback((tabId: string, primaryTabId = activeTabId ?? undefined) => {
    if (!primaryTabId || tabId === primaryTabId) return;
    const tab = documentTabs.find((candidate) => candidate.id === tabId);
    const primaryTab = documentTabs.find((candidate) => candidate.id === primaryTabId);
    if (!tab?.path || !primaryTab?.path) return;

    captureActiveDocumentViewState();
    setActiveImageFile(null);
    updateActiveAiSelection(null);
    handleAiCommandClose();
    if (splitMode) {
      setEditorMode("visual");
      setActiveEditorSurface("visual");
    }
    if (primaryTabId !== activeTabId) selectMarkdownTab(primaryTabId);
    openSideDocumentGroup({
      primaryFilePath: primaryTab.path,
      primaryTabId,
      sideFilePath: tab.path,
      sideTabId: tabId
    });
  }, [
    activeTabId,
    captureActiveDocumentViewState,
    documentTabs,
    handleAiCommandClose,
    openSideDocumentGroup,
    selectMarkdownTab,
    splitMode,
    updateActiveAiSelection
  ]);
  const handleCancelTitlebarSideBySide = useCallback((tabId: string) => {
    if (!sideDocumentGroup) return;
    if (sideDocumentGroup.primaryTabId !== tabId && sideDocumentGroup.sideTabId !== tabId) return;

    clearSideDocumentGroup();
  }, [clearSideDocumentGroup, sideDocumentGroup]);
  const draggedMarkdownTabIdFromEvent = useCallback((event: ReactDragEvent<HTMLElement>) => {
    return event.dataTransfer.getData(markdownTabDragDataType);
  }, []);
  const canDropMarkdownTabOnEditor = useCallback((tabId: string) => {
    if (!editorPreferences.preferences.showDocumentTabs || activeImageFile || !hasOpenDocument || !activeTabId) return false;
    if (!tabId || tabId === activeTabId || tabId === sideDocumentGroup?.sideTabId) return false;

    const draggedTab = documentTabs.find((tab) => tab.id === tabId);
    const activeTab = documentTabs.find((tab) => tab.id === activeTabId);
    return Boolean(draggedTab?.path && activeTab?.path);
  }, [
    activeImageFile,
    activeTabId,
    documentTabs,
    editorPreferences.preferences.showDocumentTabs,
    hasOpenDocument,
    sideDocumentGroup?.sideTabId
  ]);
  const handleEditorContentDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const draggedTabId = draggedMarkdownTabIdFromEvent(event);
    if (!canDropMarkdownTabOnEditor(draggedTabId)) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setEditorTabDropTargetActive(true);
  }, [canDropMarkdownTabOnEditor, draggedMarkdownTabIdFromEvent]);
  const handleEditorContentDragLeave = useCallback(() => {
    setEditorTabDropTargetActive(false);
  }, []);
  const handleEditorContentDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    const draggedTabId = draggedMarkdownTabIdFromEvent(event);
    if (!canDropMarkdownTabOnEditor(draggedTabId)) {
      setEditorTabDropTargetActive(false);
      return;
    }

    event.preventDefault();
    setEditorTabDropTargetActive(false);
    handleOpenTitlebarTabToSide(draggedTabId);
  }, [
    canDropMarkdownTabOnEditor,
    draggedMarkdownTabIdFromEvent,
    handleOpenTitlebarTabToSide
  ]);
  const handleSideDocumentChange = useCallback((content: string) => {
    if (!sideDocumentGroup || readOnlyMode) return;

    handleMarkdownTabChange(sideDocumentGroup.sideTabId, content);
  }, [handleMarkdownTabChange, readOnlyMode, sideDocumentGroup]);

  const handleCloseTitlebarTab = useCallback(async (tabId: string) => {
    captureActiveDocumentViewState();

    const imageTab = imageTabs.find((tab) => tab.id === tabId);
    if (imageTab) {
      const closingActiveImage = activeImageFile ? imageDocumentTabId(activeImageFile.path) === tabId : false;
      setImageTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== tabId));
      if (closingActiveImage) setActiveImageFile(null);
      updateActiveAiSelection(null);
      handleAiCommandClose();
      return true;
    }

    const closed = await closeMarkdownTab(tabId);
    if (!closed) return false;

    if (sideDocumentGroup?.primaryTabId === tabId || sideDocumentGroup?.sideTabId === tabId) {
      clearSideDocumentGroup();
    }
    updateActiveAiSelection(null);
    handleAiCommandClose();
    return true;
  }, [
    activeImageFile,
    captureActiveDocumentViewState,
    clearSideDocumentGroup,
    closeMarkdownTab,
    handleAiCommandClose,
    imageTabs,
    sideDocumentGroup,
    updateActiveAiSelection
  ]);

  const focusEditorInDocumentPane = useCallback((target: "main" | "side") => {
    if (titlebarTabFocusTimerRef.current !== null) {
      window.clearTimeout(titlebarTabFocusTimerRef.current);
      titlebarTabFocusTimerRef.current = null;
    }

    titlebarTabFocusTimerRef.current = window.setTimeout(() => {
      titlebarTabFocusTimerRef.current = null;

      const pane =
        target === "side"
          ? sideDocumentSurfaceRef.current?.querySelector<HTMLElement>(".side-document-pane") ?? null
          : mainDocumentPaneRef.current;
      if (!pane) return;

      const sourceEditorSelector = ".markdown-source-editor [role='textbox']";
      const visualEditorSelector = ".markdown-paper [role='textbox']";
      const preferredSelector =
        target === "side"
          ? sourceMode ? sourceEditorSelector : visualEditorSelector
          : sourceMode || (splitMode && activeEditorSurface === "source") ? sourceEditorSelector : visualEditorSelector;
      const editor =
        pane.querySelector<HTMLElement>(preferredSelector) ??
        pane.querySelector<HTMLElement>("[role='textbox']");

      editor?.focus({ preventScroll: true });
    }, 0);
  }, [activeEditorSurface, sourceMode, splitMode]);

  useEffect(() => () => {
    if (titlebarTabFocusTimerRef.current !== null) {
      window.clearTimeout(titlebarTabFocusTimerRef.current);
      titlebarTabFocusTimerRef.current = null;
    }
  }, []);

  const handleSelectTitlebarTab = useCallback((tabId: string) => {
    captureActiveDocumentViewState();
    setDocumentOperationTarget("main");

    const imageTab = imageTabs.find((tab) => tab.id === tabId);
    if (imageTab) {
      setActiveImageFile(imageTab);
      updateActiveAiSelection(null);
      handleAiCommandClose();
      return;
    }

    setActiveImageFile(null);
    updateActiveAiSelection(null);
    handleAiCommandClose();
    selectMarkdownTab(tabId);
  }, [
    captureActiveDocumentViewState,
    handleAiCommandClose,
    imageTabs,
    selectMarkdownTab,
    updateActiveAiSelection
  ]);
  const handleFocusTitlebarTab = useCallback((tabId: string) => {
    const target = sideDocumentGroup?.sideTabId === tabId ? "side" : "main";
    setDocumentOperationTarget(target);
    focusEditorInDocumentPane(target);
  }, [focusEditorInDocumentPane, sideDocumentGroup?.sideTabId]);
  const handleRenameTitlebarTab = useCallback(async (tab: MarkdownTabsBarDocumentItem, fileName: string) => {
    const file = documentTabAsFolderFile(tab);
    if (!file) return;

    try {
      const renamedFile = await renameMarkdownTreeFile(file, fileName);
      if (renamedFile) applyRenamedTreeFile(file.path, renamedFile);
    } catch {
      // Keep the existing tab state if the native rename fails.
    }
  }, [applyRenamedTreeFile, renameMarkdownTreeFile]);

  const titlebarDocumentTabs = documentTabsVisible ? (
    <MarkdownTabsBar
      activeTabId={activeTitlebarTabId}
      focusedTabId={focusedSideDocumentTabId ?? activeTitlebarTabId}
      items={titlebarItems}
      language={appLanguage.language}
      nativeDragRegionEnabled={nativeWindowChromeEnabled}
      placement="titlebar"
      onCancelSideBySide={handleCancelTitlebarSideBySide}
      onCloseTab={handleCloseTitlebarTab}
      onFocusTab={handleFocusTitlebarTab}
      onNewTab={() => {
        captureActiveDocumentViewState();
        setActiveImageFile(null);
        createBlankDocument().catch(() => {});
      }}
      onOpenTabToSide={handleOpenTitlebarTabToSide}
      onRevealTabInFileTree={handleRevealPathInFileTree}
      onRenameTab={handleRenameTitlebarTab}
      onSelectTab={handleSelectTitlebarTab}
    />
  ) : null;
  const appTitlebarActions = useMemo(
    () => aiFeatureEnabled
      ? editorPreferences.preferences.titlebarActions
      : editorPreferences.preferences.titlebarActions.filter((action) => action.id !== "aiAgent"),
    [aiFeatureEnabled, editorPreferences.preferences.titlebarActions]
  );
  const mainVisualEditorTabs = documentTabs.filter((tab) => tab.open);
  const mainVisualEditors = (
    <>
      {mainVisualEditorTabs.map((tab) => {
        const tabActive = tab.id === activeTabId;
        const tabVisualBlocked = shouldBlockLargeMarkdownVisual(tab.content, {
          sizeBytes: tab.sizeBytes
        });
        if (tabVisualBlocked) {
          if (!tabActive || sourceMode) return null;

          return (
            <LargeMarkdownNotice
              key={`${tab.id}:large-visual-notice`}
              language={appLanguage.language}
              onOpenSourceMode={handleEditorModeToggle}
            />
          );
        }

        const visualHidden = !tabActive || sourceMode;

        return (
          <div
            key={tab.id}
            aria-hidden={visualHidden ? "true" : undefined}
            className="h-full min-h-0"
            hidden={visualHidden}
          >
            <MarkdownPaper
              autoFocus={
                tabActive &&
                !sourceMode &&
                (splitMode ? activeEditorSurface === "visual" : shouldFocusEditorOnReady(tab.content))
              }
              bottomOverlayInset={
                tabActive &&
                !sourceMode &&
                aiCommandVisible &&
                (!splitMode || activeEditorSurface === "visual")
                  ? aiCommandOverlayInset
                  : 0
              }
              bodyFontSize={editorPreferences.preferences.bodyFontSize}
              contentWidth={activeEditorContentWidth}
              contentWidthPx={activeEditorContentWidthPx}
              documentKey={tab.id}
              documentPath={tab.path}
              editorFontFamily={editorPreferences.preferences.editorFontFamily}
              editorTheme={appTheme.editorTheme}
              extendedSyntax={editorPreferences.preferences.extendedSyntax}
              initialContent={tab.content}
              language={appLanguage.language}
              lineHeight={editorPreferences.preferences.lineHeight}
              markdownShortcuts={editorPreferences.preferences.markdownShortcuts}
              onActiveOutlineIndexChange={tabActive ? handleActiveOutlineIndexChange : undefined}
              onEditorReady={(readyEditor, options) => handleMainVisualEditorReady(tab.id, readyEditor, options)}
              onMarkdownChange={(content) => {
                const options = { documentRevision: tab.revision };
                if (tabActive) {
                  handleVisualMarkdownChange(content, options);
                  return;
                }

                handleMarkdownTabChange(tab.id, content, { ...options, surface: "visual" });
              }}
              onContentWidthChange={handleEditorContentWidthChange}
              onContentWidthResizeEnd={handleEditorContentWidthResizeEnd}
              onSaveClipboardImage={handleSaveClipboardImage}
              onSaveRemoteClipboardImage={handleSaveRemoteClipboardImage}
              openExternalUrl={handleOpenEditorLink}
              readOnly={readOnlyMode}
              onTextSelectionChange={tabActive ? handleTextSelectionChange : undefined}
              resolveImageSrc={createMarkdownImageSrcResolver(tab.path)}
              revision={tab.revision}
              onScroll={tabActive ? handleVisualPaneScroll : undefined}
              scrollRef={tabActive ? visualScrollRef : undefined}
              topInset="titlebar"
              workspaceFiles={fileTreeFiles}
              wrapCodeBlocks={editorPreferences.preferences.wrapCodeBlocks}
            />
          </div>
        );
      })}
    </>
  );
  const aiAgentPanel = aiFeatureEnabled ? (
    <AiAgentPanel
      activeSessionId={activeAiAgentSessionId}
      availableModels={aiSettings.availableTextModels}
      context={aiAgentContext}
      documentAvailable={hasOpenDocument && !activeImageFile}
      draft={aiAgent.draft}
      language={appLanguage.language}
      messages={aiAgent.messages}
      modelName={aiAgentModelName}
      open={aiAgentOpen}
      providerName={aiAgentProviderName}
      sessions={aiAgentSessions.sessions}
      selectedModelId={aiSettings.agentModelId}
      selectedProviderId={aiSettings.agentProviderId}
      status={aiAgent.status}
      thinkingEnabled={aiAgent.thinkingEnabled}
      webSearchAvailable={webSearchAvailable}
      webSearchEnabled={aiAgent.webSearchEnabled}
      maxWidth={aiAgentPanelMaxWidth}
      minWidth={aiAgentPanelMinWidth}
      width={aiAgentPanelWidth}
      onArchiveSession={(sessionId, archived) => {
        handleArchiveAiAgentSession(sessionId, archived).catch(() => {});
      }}
      onClose={closeAiAgentPanel}
      onCreateSession={handleCreateAiAgentSession}
      onDeleteSession={(sessionId) => {
        handleDeleteAiAgentSession(sessionId).catch(() => {});
      }}
      onDisableThinking={() => aiAgent.setSessionThinkingEnabled(false)}
      onDraftChange={aiAgent.setDraft}
      onInterrupt={aiAgent.interrupt}
      onRenameSession={(sessionId, title) => {
        handleRenameAiAgentSession(sessionId, title).catch(() => {});
      }}
      onResize={setAiAgentPanelWidth}
      onResizeEnd={endAiAgentPanelResize}
      onResizeStart={startAiAgentPanelResize}
      onRetryMessage={aiAgent.retryMessage}
      onSelectSession={handleSelectAiAgentSession}
      onSelectModel={aiSettings.selectAgentModel}
      onSubmit={aiAgent.submit}
      onSubmitEditedMessage={aiAgent.submitEditedMessage}
      onToggleThinking={() => aiAgent.setThinkingEnabled((enabled) => !enabled)}
      onToggleWebSearch={() => aiAgent.setWebSearchEnabled((enabled) => !enabled)}
    />
  ) : null;

  return (
    <>
      <AppToaster language={appLanguage.language} />
      <main className="app-shell group/app relative grid h-full w-full grid-rows-[minmax(0,1fr)] overflow-hidden overscroll-none bg-(--bg-primary) text-(--text-primary)">
        <NativeTitleBar
          aiAgentOpen={aiAgentOpen}
          aiAgentResizing={aiAgentPanelResizing}
          aiAgentWidth={aiAgentPanelWidth}
          dirty={!activeImageFile && hasOpenDocument && document.dirty}
          documentKind={titleDocumentKind}
          documentName={titleDocumentName}
          language={appLanguage.language}
          markdownFilesOpen={fileTreeOpen}
          markdownFilesResizing={fileTreeResizing}
          markdownFilesWidth={fileTreeWidth}
          menuHandlers={nativeMenuHandlers}
          nativeWindowChrome={nativeWindowChromeEnabled}
          quickCreateMarkdownFileVisible={!fileTreeOpen}
          historyDisabled={!documentHistoryAvailable}
          saveDisabled={!hasOpenDocument || Boolean(activeImageFile)}
          splitMode={splitMode}
          sourceMode={sourceMode}
          sourceModeDisabled={!sourceModeAvailable}
          theme={appTheme.resolvedTheme}
          titlebarActions={appTitlebarActions}
          titleContent={titlebarDocumentTabs}
          onCreateMarkdownFile={handleQuickCreateMarkdownTreeFile}
          onExitApp={handleExitApp}
          onOpenMarkdown={handleOpenMarkdownFile}
          onOpenMarkdownFolder={handleOpenMarkdownFolder}
          onOpenSettings={handleOpenSettings}
          onSaveMarkdown={handleSaveDocument}
          onShowDocumentHistory={handleDocumentHistoryOpen}
          onShowAbout={handleShowAbout}
          onTitlebarActionsChange={handleTitlebarActionsChange}
          onToggleAiAgent={handleAiAgentToggle}
          onToggleMarkdownFiles={handleFileTreeToggle}
          onToggleSplitMode={handleEditorSplitToggle}
          onToggleSourceMode={handleEditorModeToggle}
          onToggleTheme={appTheme.toggleTheme}
          onToggleWindowMaximized={toggleNativeWindowMaximized}
          workspaceName={fileTree.sourcePath ? fileTreeRootName : undefined}
        />

        {documentHistoryOpen && document.path ? (
          <DocumentHistoryDialog
            documentPath={document.path}
            language={appLanguage.language}
            onClose={() => setDocumentHistoryOpen(false)}
            onRestore={handleDocumentHistoryRestore}
            refreshKey={documentHistoryRefreshKey}
          />
        ) : null}

        <span className="screen-reader-title sr-only">{titleDocumentName}</span>

        <WorkspaceLayout
          aiAgentPanel={aiAgentPanel}
          documentSearchAvailable={documentSearchAvailable}
          documentSearchOpen={documentSearchOpen}
          editorAgentLayoutClassName={editorAgentLayoutClassName}
          editorAgentLayoutStyle={{ gridTemplateColumns: `minmax(0,1fr) ${aiAgentInset}` }}
          editorDropTargetActive={editorTabDropTargetActive}
          fileTree={{
            activeOutlineIndex: activeDocumentOutlineIndex,
            autoRevealActiveFile: editorPreferences.preferences.autoRevealActiveFile,
            currentPath: currentFileTreePath,
            customTemplates: markdownTemplates,
            fileTreeSort,
            files: fileTreeFiles,
            folderOpen: Boolean(fileTree.sourcePath),
            language: appLanguage.language,
            maxWidth: fileTreeMaxWidth,
            minWidth: fileTreeMinWidth,
            open: fileTreeOpen,
            outlineItems,
            recentFolders: recentMarkdownFolders,
            recentFoldersOpen: recentMarkdownFoldersOpen,
            revealPathRequest: fileTreeRevealPathRequest,
            rootPath: fileTree.sourcePath,
            rootName: fileTreeRootName,
            sidebarLayoutMode: editorPreferences.preferences.sidebarLayoutMode,
            width: fileTreeWidth,
            onCreateFile: handleCreateMarkdownTreeFile,
            onCreateFolder: handleCreateMarkdownTreeFolder,
            onDeleteFile: handleDeleteMarkdownTreeFile,
            onFileTreeSortChange: setFileTreeSort,
            onMoveFile: handleMoveMarkdownTreeFile,
            onOpenContainingFolder: handleOpenContainingFolder,
            onOpenFile: handleOpenTreeFile,
            onOpenFileToSide: editorPreferences.preferences.showDocumentTabs
              ? handleOpenTreeFileToSide
              : undefined,
            onOpenFolder: handleOpenMarkdownFolder,
            onOpenRecentFolder: handleOpenRecentMarkdownFolder,
            onOpenSettings: handleOpenSettings,
            onRecentFoldersOpenChange: setRecentMarkdownFoldersOpen,
            onRemoveRecentFolder: removeRecentFolder,
            onRenameFile: handleRenameMarkdownTreeFile,
            onResize: resizeFileTree,
            onResizeEnd: endFileTreeResize,
            onResizeStart: startFileTreeResize,
            onSaveFileAsTemplate: handleSaveMarkdownFileAsTemplate,
            onSelectOutlineItem: editor.selectOutlineItem,
            onToggleMarkdownFiles: handleFileTreeToggle
          }}
          windowsSelfDrawnChrome={windowsSelfDrawnChromeEnabled}
          workspaceLayoutClassName={workspaceLayoutClassName}
          workspaceLayoutStyle={workspaceLayoutStyle}
          onEditorContentDragLeave={handleEditorContentDragLeave}
          onEditorContentDragOver={handleEditorContentDragOver}
          onEditorContentDrop={handleEditorContentDrop}
        >
              {globalSearchOpen ? (
                <GlobalSearchPanel
                  caseSensitive={globalSearchCaseSensitive}
                  language={appLanguage.language}
                  loading={globalSearchLoading}
                  query={globalSearchQuery}
                  recentQueries={globalSearchRecentQueries}
                  results={globalSearchResponse.results}
                  searchedFileCount={globalSearchResponse.searchedFileCount}
                  truncated={globalSearchResponse.truncated}
                  unreadableFileCount={globalSearchResponse.unreadableFileCount}
                  onCaseSensitiveChange={handleGlobalSearchCaseSensitiveChange}
                  onClose={handleGlobalSearchClose}
                  onOpenResult={handleGlobalSearchResultOpen}
                  onQueryChange={handleGlobalSearchQueryChange}
                  onRecentQuerySelect={handleGlobalSearchRecentQuerySelect}
                />
              ) : null}
              {quickOpenOpen ? (
                <QuickOpenPanel
                  currentPath={currentFileTreePath}
                  files={fileTreeFiles}
                  language={appLanguage.language}
                  openFilePaths={quickOpenFilePaths}
                  onClose={handleQuickOpenClose}
                  onOpenFile={handleQuickOpenFileOpen}
                />
              ) : null}
              {documentSearchOpen && documentSearchAvailable ? (
                <DocumentSearchBar
                  activeIndex={normalizedDocumentSearchActiveIndex}
                  caseSensitive={documentSearchCaseSensitive}
                  language={appLanguage.language}
                  matchCount={documentSearchMatchCount}
                  query={documentSearchQuery}
                  readOnly={readOnlyMode}
                  replaceOpen={documentSearchReplaceOpen}
                  replacement={documentSearchReplacement}
                  onCaseSensitiveChange={handleDocumentSearchCaseSensitiveChange}
                  onClose={handleDocumentSearchClose}
                  onNext={handleDocumentSearchNext}
                  onPrevious={handleDocumentSearchPrevious}
                  onQueryChange={handleDocumentSearchQueryChange}
                  onReplace={handleDocumentReplace}
                  onReplaceAll={handleDocumentReplaceAll}
                  onReplaceOpenChange={setDocumentSearchReplaceOpen}
                  onReplacementChange={setDocumentSearchReplacement}
                />
              ) : null}
              {activeImageFile ? (
                <ImagePreview
                  alt={activeImageFile.name}
                  language={appLanguage.language}
                  src={imagePreviewSrc}
                />
              ) : hasOpenDocument ? (
                <div
                  className={
                    sideDocumentOpen
                      ? "editor-side-by-side-surface grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] divide-y divide-(--border-default) min-[960px]:grid-cols-[minmax(0,var(--side-document-main-pane))_8px_minmax(0,var(--side-document-secondary-pane))] min-[960px]:grid-rows-[minmax(0,1fr)] min-[960px]:divide-y-0"
                      : "relative h-full min-h-0"
                  }
                  ref={sideDocumentOpen ? sideDocumentSurfaceRef : undefined}
                  style={sideDocumentOpen ? sideDocumentSurfaceStyle : undefined}
                >
                  <div
                    className="relative h-full min-h-0 overflow-hidden"
                    ref={mainDocumentPaneRef}
                    onFocusCapture={handleMainDocumentPaneFocus}
                  >
                    {splitMode ? (
                    <div
                      className="editor-split-surface grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] divide-y divide-(--border-default) min-[900px]:grid-cols-[minmax(0,var(--split-visual-pane))_8px_minmax(0,var(--split-source-pane))] min-[900px]:grid-rows-[minmax(0,1fr)] min-[900px]:divide-y-0"
                      ref={splitSurfaceRef}
                      style={splitSurfaceStyle}
                    >
                      <div className="min-h-0 overflow-hidden" onFocusCapture={handleVisualPaneFocus}>
                        {mainVisualEditors}
                      </div>
                      <div
                        className="group/split-resizer relative z-20 hidden cursor-col-resize touch-none outline-none min-[900px]:block"
                        role="separator"
                        tabIndex={0}
                        aria-label={translate("app.resizeSplitPanes")}
                        aria-orientation="vertical"
                        aria-valuemin={splitVisualPanePercentMin}
                        aria-valuemax={splitVisualPanePercentMax}
                        aria-valuenow={resolvedSplitVisualPanePercent}
                        onKeyDown={handleSplitPaneResizeKeyDown}
                        onPointerDown={handleSplitPaneResizePointerDown}
                      >
                        <span className="pointer-events-none absolute inset-y-5 left-1/2 w-px -translate-x-1/2 bg-(--border-default) transition-colors duration-150 ease-out group-hover/split-resizer:bg-(--accent) group-focus/split-resizer:bg-(--accent)" />
                      </div>
                      <div className="min-h-0 overflow-hidden" onFocusCapture={handleSourcePaneFocus}>
                        <LazyMarkdownSourceEditor
                          autoFocus={activeEditorSurface === "source"}
                          bodyFontSize={editorPreferences.preferences.bodyFontSize}
                          content={document.content}
                          contentWidth={activeEditorContentWidth}
                          contentWidthPx={activeEditorContentWidthPx}
                          editorFontFamily={editorPreferences.preferences.editorFontFamily}
                          extendedSyntax={editorPreferences.preferences.extendedSyntax}
                          language={appLanguage.language}
                          lineHeight={editorPreferences.preferences.lineHeight}
                          onChange={(content) => handleSourceMarkdownChange(content, {
                            documentRevision: document.revision
                          })}
                          onContentWidthChange={handleEditorContentWidthChange}
                          onContentWidthResizeEnd={handleEditorContentWidthResizeEnd}
                          onScroll={handleSourcePaneScroll}
                          onSelectionTextChange={updateSelectedWordCount}
                          readOnly={readOnlyMode}
                          searchActiveIndex={normalizedDocumentSearchActiveIndex}
                          searchMatches={visibleSourceDocumentSearchMatches}
                          scrollRef={sourceScrollRef}
                          topInset="titlebar"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-full min-h-0">
                      {mainVisualEditors}
                      {sourceMode ? (
                        <LazyMarkdownSourceEditor
                          autoFocus
                          bodyFontSize={editorPreferences.preferences.bodyFontSize}
                          content={document.content}
                          contentWidth={activeEditorContentWidth}
                          contentWidthPx={activeEditorContentWidthPx}
                          editorFontFamily={editorPreferences.preferences.editorFontFamily}
                          extendedSyntax={editorPreferences.preferences.extendedSyntax}
                          language={appLanguage.language}
                          lineHeight={editorPreferences.preferences.lineHeight}
                          onChange={(content) => handleSourceMarkdownChange(content, {
                            documentRevision: document.revision
                          })}
                          onContentWidthChange={handleEditorContentWidthChange}
                          onContentWidthResizeEnd={handleEditorContentWidthResizeEnd}
                          onScroll={handleSourcePaneScroll}
                          onSelectionTextChange={updateSelectedWordCount}
                          readOnly={readOnlyMode}
                          searchActiveIndex={normalizedDocumentSearchActiveIndex}
                          searchMatches={visibleSourceDocumentSearchMatches}
                          scrollRef={sourceScrollRef}
                          topInset="titlebar"
                        />
                      ) : null}
                    </div>
                  )}
                  <QuietStatus
                    backupLabel={backupStatusLabel}
                    dirty={document.dirty}
                    language={appLanguage.language}
                    readOnly={readOnlyMode}
                    selectedWordCount={selectedWordCount}
                    showWordCount={editorPreferences.preferences.showWordCount}
                    syncLabel={syncStatusLabel}
                    wordCount={wordCount}
                  />
                  </div>
                  {sideDocumentOpen && sideDocumentTab ? (
                    <>
                      <div
                        className="group/side-resizer relative z-20 hidden cursor-col-resize touch-none outline-none min-[960px]:block"
                        role="separator"
                        tabIndex={0}
                        aria-label={translate("app.resizeSideBySideDocuments")}
                        aria-orientation="vertical"
                        aria-valuemin={sideDocumentMainPanePercentMin}
                        aria-valuemax={sideDocumentMainPanePercentMax}
                        aria-valuenow={resolvedSideDocumentMainPanePercent}
                        onKeyDown={handleSideDocumentPaneResizeKeyDown}
                        onPointerDown={handleSideDocumentPaneResizePointerDown}
                      >
                        <span className="pointer-events-none absolute inset-y-5 left-1/2 w-px -translate-x-1/2 bg-(--border-default) transition-colors duration-150 ease-out group-hover/side-resizer:bg-(--accent) group-focus/side-resizer:bg-(--accent)" />
                      </div>
                      <SideDocumentPane
                        bodyFontSize={editorPreferences.preferences.bodyFontSize}
                        content={sideDocumentTab.content}
                        contentWidth={activeEditorContentWidth}
                        contentWidthPx={activeEditorContentWidthPx}
                        documentKey={sideDocumentTab.id}
                        documentPath={sideDocumentTab.path}
                        editorFontFamily={editorPreferences.preferences.editorFontFamily}
                        editorTheme={appTheme.editorTheme}
                        extendedSyntax={editorPreferences.preferences.extendedSyntax}
                        language={appLanguage.language}
                        lineHeight={editorPreferences.preferences.lineHeight}
                        markdownShortcuts={editorPreferences.preferences.markdownShortcuts}
                        mode={sourceMode ? "source" : "visual"}
                        openExternalUrl={handleOpenEditorLink}
                        readOnly={readOnlyMode}
                        resolveImageSrc={resolveSideDocumentImageSrc}
                        revision={sideDocumentTab.revision}
                        sizeBytes={sideDocumentTab.sizeBytes}
                        workspaceFiles={fileTreeFiles}
                        onChange={handleSideDocumentChange}
                        onContentWidthChange={handleEditorContentWidthChange}
                        onContentWidthResizeEnd={handleEditorContentWidthResizeEnd}
                        onFocus={handleSideDocumentPaneFocus}
                        wrapCodeBlocks={editorPreferences.preferences.wrapCodeBlocks}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
        </WorkspaceLayout>

        {aiFeatureEnabled ? (
          <AiSelectionToolbar
            activeFormattingActions={aiSelectionToolbarActiveActions}
            activeHeadingLevel={aiSelectionToolbarHeadingLevel}
            anchor={aiSelectionToolbarAnchor}
            busy={aiCommand.submitting || aiContextMenuActionPending}
            copySucceeded={aiSelectionToolbarCopySucceeded}
            language={appLanguage.language}
            open={aiSelectionToolbarVisible}
            quickActionPrompts={editorPreferences.preferences.aiQuickActionPrompts}
            onCopySelection={handleAiSelectionToolbarCopySelection}
            onInsertLink={handleAiSelectionToolbarInsertLink}
            onOpenCommand={handleAiSelectionToolbarOpenCommand}
            onRunFormattingAction={handleAiSelectionToolbarFormattingAction}
            onRunAction={handleAiSelectionToolbarAction}
            onSetHeadingLevel={handleAiSelectionToolbarHeadingLevelAction}
          />
        ) : null}

        {aiFeatureEnabled ? (
          <AiCommandBar
          aiResult={aiResult}
          availableModels={aiSettings.availableTextModels}
          editorLeftInset={fileTreeOpen ? `${fileTreeWidth}px` : "0px"}
          editorRightInset={aiAgentInset}
          externalActionPending={aiContextMenuActionPending}
          language={appLanguage.language}
          open={aiCommandVisible}
          prompt={aiCommand.prompt}
          quickActionPrompts={editorPreferences.preferences.aiQuickActionPrompts}
          selectedModelId={aiSettings.inlineModelId}
          selectedProviderId={aiSettings.inlineProviderId}
          selectedText={activeAiSelection?.text ?? ""}
          submitting={aiCommand.submitting}
          supportsThinking={supportsAiThinking}
          onClose={handleAiCommandClose}
          onInterrupt={handleAiCommandInterrupt}
          onOverlayInsetChange={setAiCommandOverlayInset}
          onPromptChange={aiCommand.updatePrompt}
          onSelectionContextFocus={handleAiCommandSelectionContextFocus}
          onSelectModel={aiSettings.selectInlineModel}
          onSubmit={aiCommand.submitPrompt}
          onTransferToAiPanel={
            editorPreferences.preferences.suggestAiPanelForComplexInlinePrompts
              ? handleAiCommandTransferToAgentPanel
              : undefined
          }
        />
        ) : null}
      </main>
      {exportFeatureEnabled ? (
        <MarkdownExportDocument
          snapshot={exportSnapshot}
          extendedSyntax={editorPreferences.preferences.extendedSyntax}
          resolveImageSrc={resolveExportImageSrc}
          onRendered={handleRenderedExport}
        />
      ) : null}
    </>
  );
}
