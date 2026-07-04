export const viewModeOptions = ["full", "daily", "focus", "immersive", "custom"] as const;
export type ViewMode = typeof viewModeOptions[number];

export const viewModeVisibilityOptions = ["visible", "hidden"] as const;
export type ViewModeVisibility = typeof viewModeVisibilityOptions[number];

export type ViewModeCustomizations = {
  aiPanel: ViewModeVisibility;
  documentLinks: ViewModeVisibility;
  documentTabs: ViewModeVisibility;
  fileList: ViewModeVisibility;
  fileTree: ViewModeVisibility;
  fileTreeButton: ViewModeVisibility;
  openButton: ViewModeVisibility;
  outline: ViewModeVisibility;
  quickCreateButton: ViewModeVisibility;
  recentFolders: ViewModeVisibility;
  sidebarLayout: ViewModeVisibility;
  statusBar: ViewModeVisibility;
  titlebarActions: ViewModeVisibility;
  viewModeToggle: ViewModeVisibility;
  wordCount: ViewModeVisibility;
};

export type ViewModeChrome = {
  aiPanel: boolean;
  documentLinks: boolean;
  documentTabs: boolean;
  fileList: boolean;
  fileTree: boolean;
  fileTreeButton: boolean;
  openButton: boolean;
  outline: boolean;
  quickCreateButton: boolean;
  recentFolders: boolean;
  sidebarLayout: boolean;
  statusBar: boolean;
  titlebarActions: boolean;
  viewModeToggle: boolean;
  wordCount: boolean;
};

export const defaultViewModeCustomizations: ViewModeCustomizations = {
  aiPanel: "visible",
  documentLinks: "visible",
  documentTabs: "visible",
  fileList: "visible",
  fileTree: "visible",
  fileTreeButton: "visible",
  openButton: "visible",
  outline: "visible",
  quickCreateButton: "visible",
  recentFolders: "visible",
  sidebarLayout: "visible",
  statusBar: "visible",
  titlebarActions: "visible",
  viewModeToggle: "visible",
  wordCount: "visible"
};

const viewModeChromePresets: Record<Exclude<ViewMode, "custom">, ViewModeChrome> = {
  daily: {
    aiPanel: true,
    documentLinks: true,
    documentTabs: true,
    fileList: true,
    fileTree: true,
    fileTreeButton: true,
    openButton: true,
    outline: true,
    quickCreateButton: true,
    recentFolders: true,
    sidebarLayout: true,
    statusBar: true,
    titlebarActions: true,
    viewModeToggle: true,
    wordCount: true
  },
  focus: {
    aiPanel: false,
    documentLinks: false,
    documentTabs: false,
    fileList: false,
    fileTree: false,
    fileTreeButton: true,
    openButton: true,
    outline: false,
    quickCreateButton: true,
    recentFolders: false,
    sidebarLayout: false,
    statusBar: false,
    titlebarActions: true,
    viewModeToggle: true,
    wordCount: false
  },
  full: {
    aiPanel: true,
    documentLinks: true,
    documentTabs: true,
    fileList: true,
    fileTree: true,
    fileTreeButton: true,
    openButton: true,
    outline: true,
    quickCreateButton: true,
    recentFolders: true,
    sidebarLayout: true,
    statusBar: true,
    titlebarActions: true,
    viewModeToggle: true,
    wordCount: true
  },
  immersive: {
    aiPanel: false,
    documentLinks: false,
    documentTabs: false,
    fileList: false,
    fileTree: false,
    fileTreeButton: false,
    openButton: false,
    outline: false,
    quickCreateButton: false,
    recentFolders: false,
    sidebarLayout: false,
    statusBar: false,
    titlebarActions: false,
    viewModeToggle: true,
    wordCount: false
  }
};

const quickViewModeCycle: readonly ViewMode[] = ["daily", "focus", "immersive", "full"];

function visibilityToBoolean(visibility: ViewModeVisibility) {
  return visibility === "visible";
}

export function isViewMode(value: unknown): value is ViewMode {
  return viewModeOptions.includes(value as ViewMode);
}

export function normalizeViewMode(value: unknown): ViewMode {
  return isViewMode(value) ? value : "daily";
}

function normalizeViewModeVisibility(value: unknown): ViewModeVisibility {
  return viewModeVisibilityOptions.includes(value as ViewModeVisibility)
    ? (value as ViewModeVisibility)
    : "visible";
}

export function normalizeViewModeCustomizations(value: unknown): ViewModeCustomizations {
  const customizations = typeof value === "object" && value !== null
    ? value as Partial<Record<keyof ViewModeCustomizations, unknown>>
    : {};

  return {
    aiPanel: normalizeViewModeVisibility(customizations.aiPanel),
    documentLinks: normalizeViewModeVisibility(customizations.documentLinks),
    documentTabs: normalizeViewModeVisibility(customizations.documentTabs),
    fileList: normalizeViewModeVisibility(customizations.fileList),
    fileTree: normalizeViewModeVisibility(customizations.fileTree),
    fileTreeButton: normalizeViewModeVisibility(customizations.fileTreeButton),
    openButton: normalizeViewModeVisibility(customizations.openButton),
    outline: normalizeViewModeVisibility(customizations.outline),
    quickCreateButton: normalizeViewModeVisibility(customizations.quickCreateButton),
    recentFolders: normalizeViewModeVisibility(customizations.recentFolders),
    sidebarLayout: normalizeViewModeVisibility(customizations.sidebarLayout),
    statusBar: normalizeViewModeVisibility(customizations.statusBar),
    titlebarActions: normalizeViewModeVisibility(customizations.titlebarActions),
    viewModeToggle: normalizeViewModeVisibility(customizations.viewModeToggle),
    wordCount: normalizeViewModeVisibility(customizations.wordCount)
  };
}

export function resolveViewModeChrome(mode: unknown, customizations: unknown): ViewModeChrome {
  const normalizedMode = normalizeViewMode(mode);
  if (normalizedMode !== "custom") return viewModeChromePresets[normalizedMode];

  const normalizedCustomizations = normalizeViewModeCustomizations(customizations);

  return {
    aiPanel: visibilityToBoolean(normalizedCustomizations.aiPanel),
    documentLinks: visibilityToBoolean(normalizedCustomizations.documentLinks),
    documentTabs: visibilityToBoolean(normalizedCustomizations.documentTabs),
    fileList: visibilityToBoolean(normalizedCustomizations.fileList),
    // These fields existed before the custom controls were grouped. Keep stored
    // values readable, but do not let hidden legacy values trap users in an
    // invisible state they can no longer change from the UI.
    fileTree: true,
    fileTreeButton: visibilityToBoolean(normalizedCustomizations.fileTreeButton),
    openButton: visibilityToBoolean(normalizedCustomizations.openButton),
    outline: visibilityToBoolean(normalizedCustomizations.outline),
    quickCreateButton: visibilityToBoolean(normalizedCustomizations.quickCreateButton),
    recentFolders: visibilityToBoolean(normalizedCustomizations.recentFolders),
    sidebarLayout: true,
    statusBar: visibilityToBoolean(normalizedCustomizations.statusBar),
    titlebarActions: visibilityToBoolean(normalizedCustomizations.titlebarActions),
    viewModeToggle: true,
    wordCount: visibilityToBoolean(normalizedCustomizations.wordCount)
  };
}

export function nextViewMode(mode: unknown): ViewMode {
  if (!isViewMode(mode)) return "daily";

  const normalizedMode = mode;
  const currentIndex = quickViewModeCycle.indexOf(normalizedMode);
  if (currentIndex < 0) return "daily";

  return quickViewModeCycle[(currentIndex + 1) % quickViewModeCycle.length] ?? "daily";
}
