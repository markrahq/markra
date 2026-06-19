import { normalizeNullableString, pathNameFromPath } from "@markra/shared";

export type StoredWorkspaceState = {
  activeDraftId?: string | null;
  aiAgentSessionId: string | null;
  draftTabs?: StoredWorkspaceDraftTab[];
  filePath: string | null;
  fileTreeOpen: boolean;
  folderName: string | null;
  folderPath: string | null;
  openFilePaths: string[];
  openWindows?: StoredWorkspaceWindow[];
  recentFoldersOpen?: boolean;
  sideBySideGroup?: StoredWorkspaceSideBySideGroup | null;
};

export type StoredWorkspaceWindowState = Omit<StoredWorkspaceState, "openWindows">;
export type StoredFileTreeSortKey = "createdAt" | "modifiedAt" | "name";
export type StoredFileTreeSortDirection = "ascending" | "descending";
export type StoredFileTreeSort = {
  direction: StoredFileTreeSortDirection;
  key: StoredFileTreeSortKey;
};
export type StoredFileTreeSortByWorkspace = Record<string, StoredFileTreeSort>;

export type StoredWorkspaceDraftTab = {
  content: string;
  id: string;
  name: string;
  path: string | null;
};

export type StoredWorkspaceWindow = {
  filePath: string | null;
  label: string;
  openFilePaths: string[];
};

export type StoredWorkspaceSideBySideGroup = {
  primaryFilePath: string;
  sideFilePath: string;
};

export const defaultWorkspaceState: StoredWorkspaceState = {
  aiAgentSessionId: null,
  filePath: null,
  fileTreeOpen: false,
  folderName: null,
  folderPath: null,
  openFilePaths: [],
  openWindows: []
};
export const defaultStoredFileTreeSort = {
  direction: "ascending",
  key: "name"
} satisfies StoredFileTreeSort;

const storedFileTreeSortKeys: readonly StoredFileTreeSortKey[] = ["createdAt", "modifiedAt", "name"];
const storedFileTreeSortDirections: readonly StoredFileTreeSortDirection[] = ["ascending", "descending"];

export function normalizeWorkspaceState(value: unknown): StoredWorkspaceState {
  if (typeof value !== "object" || value === null) return defaultWorkspaceState;

  const workspace = value as Partial<StoredWorkspaceState>;
  const openFilePaths = normalizeWorkspaceOpenFilePaths(workspace.openFilePaths);
  const openFilePathSet = new Set(openFilePaths);
  const draftTabs = normalizeWorkspaceDraftTabs(workspace.draftTabs);
  const activeDraftId = normalizeNullableString(workspace.activeDraftId);
  const persistedActiveDraftId = activeDraftId && draftTabs.some((draft) => draft.id === activeDraftId)
    ? activeDraftId
    : null;
  const sideBySideGroup = normalizeWorkspaceSideBySideGroup(workspace.sideBySideGroup);
  const persistedSideBySideGroup =
    sideBySideGroup &&
    openFilePathSet.has(sideBySideGroup.primaryFilePath) &&
    openFilePathSet.has(sideBySideGroup.sideFilePath)
      ? sideBySideGroup
      : null;

  return {
    ...(draftTabs.length > 0 ? { activeDraftId: persistedActiveDraftId, draftTabs } : {}),
    aiAgentSessionId: normalizeNullableString(workspace.aiAgentSessionId),
    filePath: normalizeNullableString(workspace.filePath),
    fileTreeOpen: typeof workspace.fileTreeOpen === "boolean" ? workspace.fileTreeOpen : false,
    folderName: normalizeNullableString(workspace.folderName),
    folderPath: normalizeNullableString(workspace.folderPath),
    openFilePaths,
    openWindows: normalizeWorkspaceWindows(workspace.openWindows),
    ...(typeof workspace.recentFoldersOpen === "boolean" ? { recentFoldersOpen: workspace.recentFoldersOpen } : {}),
    ...(persistedSideBySideGroup ? { sideBySideGroup: persistedSideBySideGroup } : {})
  };
}

function normalizedStoredFileTreeSort(value: unknown): StoredFileTreeSort | null {
  if (typeof value !== "object" || value === null) return null;

  const sort = value as Partial<StoredFileTreeSort>;
  if (!storedFileTreeSortKeys.includes(sort.key as StoredFileTreeSortKey)) return null;
  if (!storedFileTreeSortDirections.includes(sort.direction as StoredFileTreeSortDirection)) return null;

  return {
    direction: sort.direction as StoredFileTreeSortDirection,
    key: sort.key as StoredFileTreeSortKey
  };
}

export function normalizeStoredFileTreeSort(value: unknown): StoredFileTreeSort {
  return normalizedStoredFileTreeSort(value) ?? defaultStoredFileTreeSort;
}

export function normalizeFileTreeSortByWorkspace(value: unknown): StoredFileTreeSortByWorkspace {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const sorts: StoredFileTreeSortByWorkspace = {};

  Object.entries(value as Record<string, unknown>).forEach(([path, sort]) => {
    const normalizedPath = normalizeNullableString(path);
    const normalizedSort = normalizedStoredFileTreeSort(sort);
    if (!normalizedPath || !normalizedSort) return;

    sorts[normalizedPath] = normalizedSort;
  });

  return sorts;
}

function normalizeWorkspaceDraftTabs(value: unknown): StoredWorkspaceDraftTab[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const draftTabs: StoredWorkspaceDraftTab[] = [];
  const normalizeDraftString = (item: unknown) => {
    if (typeof item !== "string") return null;

    const trimmed = item.trim();
    return trimmed ? trimmed : null;
  };

  value.forEach((item) => {
    if (typeof item !== "object" || item === null) return;

    const candidate = item as Partial<StoredWorkspaceDraftTab>;
    const id = normalizeDraftString(candidate.id);
    if (!id || seenIds.has(id) || typeof candidate.content !== "string") return;

    const path = normalizeDraftString(candidate.path);
    if (!path && candidate.content.trim().length === 0) return;

    const name = normalizeDraftString(candidate.name) ?? (path ? pathNameFromPath(path) : "Untitled.md");
    seenIds.add(id);
    draftTabs.push({
      content: candidate.content,
      id,
      name,
      path
    });
  });

  return draftTabs;
}

function normalizeWorkspaceOpenFilePaths(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seenPaths = new Set<string>();
  const paths: string[] = [];

  value.forEach((item) => {
    const path = normalizeNullableString(item);
    if (!path || seenPaths.has(path)) return;

    seenPaths.add(path);
    paths.push(path);
  });

  return paths;
}

function normalizeWorkspaceWindows(value: unknown): StoredWorkspaceWindow[] {
  if (!Array.isArray(value)) return [];

  const seenLabels = new Set<string>();
  const windows: StoredWorkspaceWindow[] = [];

  value.forEach((item) => {
    if (typeof item !== "object" || item === null) return;

    const candidate = item as Partial<StoredWorkspaceWindow>;
    const label = normalizeNullableString(candidate.label);
    if (!label || seenLabels.has(label)) return;

    const filePath = normalizeNullableString(candidate.filePath);
    const openFilePaths = normalizeWorkspaceOpenFilePaths(candidate.openFilePaths);
    if (filePath && !openFilePaths.includes(filePath)) openFilePaths.push(filePath);
    if (!filePath && openFilePaths.length === 0) return;

    seenLabels.add(label);
    windows.push({
      filePath,
      label,
      openFilePaths
    });
  });

  return windows;
}

function normalizeWorkspaceSideBySideGroup(value: unknown): StoredWorkspaceSideBySideGroup | null {
  if (typeof value !== "object" || value === null) return null;

  const group = value as Partial<StoredWorkspaceSideBySideGroup>;
  const primaryFilePath = normalizeNullableString(group.primaryFilePath);
  const sideFilePath = normalizeNullableString(group.sideFilePath);
  if (!primaryFilePath || !sideFilePath || primaryFilePath === sideFilePath) return null;

  return {
    primaryFilePath,
    sideFilePath
  };
}
