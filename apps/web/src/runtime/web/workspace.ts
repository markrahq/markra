import {
  openWebRuntimeDatabase,
  requestToPromise,
  transactionToPromise,
  webRuntimeWorkspaceEntryStoreName,
  webRuntimeWorkspaceStoreName
} from "./database";
import type { IndexedDbSettingsRuntimeOptions } from "./types";

export const defaultWorkspaceId = "default";

export type WorkspaceEntry = {
  body?: Blob;
  createdAt: number;
  kind: "directory" | "file";
  mediaType?: string;
  modifiedAt: number;
  path: string;
  workspaceId: string;
};

export type WorkspaceRepository = {
  ensureDefaultWorkspace: () => Promise<{ id: string; name: string }>;
  list: (workspaceId: string, rootPath?: string) => Promise<WorkspaceEntry[]>;
  read: (workspaceId: string, path: string) => Promise<WorkspaceEntry>;
  createDirectory: (
    workspaceId: string,
    path: string,
    options?: { exclusive?: boolean }
  ) => Promise<WorkspaceEntry>;
  writeFile: (
    workspaceId: string,
    path: string,
    body: Blob,
    options?: { mode?: "create" | "update" | "upsert" }
  ) => Promise<WorkspaceEntry>;
  move: (workspaceId: string, sourcePath: string, targetPath: string) => Promise<WorkspaceEntry[]>;
  remove: (workspaceId: string, path: string, recursive?: boolean) => Promise<unknown>;
  importDirectory: (workspaceId: string, rootName: string, files: readonly File[]) => Promise<string>;
  exportEntries: (workspaceId: string, rootPath?: string) => Promise<WorkspaceEntry[]>;
};

export class WorkspaceEntryNotFoundError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Workspace entry was not found: ${path}.`);
    this.name = "WorkspaceEntryNotFoundError";
    this.path = path;
  }
}

export class WorkspaceNamespaceConflictError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Workspace entry conflicts with ${path}.`);
    this.name = "WorkspaceNamespaceConflictError";
    this.path = path;
  }
}

type StoredWorkspace = {
  createdAt?: number;
  id: string;
  lifecycle: "active" | "staging";
  name: string;
};

const defaultWorkspaceName = "Markra";
const staleStagingWorkspaceAgeMs = 24 * 60 * 60 * 1000;

function normalizeWorkspacePath(path: string) {
  const parts = path.split("/");
  if (
    path.length === 0
    || path.startsWith("/")
    || path.endsWith("/")
    || path.includes("\\")
    || path !== path.normalize("NFC")
    || parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error(`Invalid workspace path: ${path}`);
  }

  return path;
}

function isAtOrBelow(path: string, rootPath: string) {
  return path === rootPath || path.startsWith(`${rootPath}/`);
}

function sortEntries(entries: WorkspaceEntry[]) {
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function findEntry(entries: readonly WorkspaceEntry[], path: string) {
  return entries.find((entry) => entry.path === path);
}

function parentPath(path: string) {
  const separatorIndex = path.lastIndexOf("/");

  return separatorIndex < 0 ? "" : path.slice(0, separatorIndex);
}

function requireParentDirectory(entries: readonly WorkspaceEntry[], path: string) {
  const parent = parentPath(path);
  if (!parent) return;

  const entry = findEntry(entries, parent);
  if (!entry) throw notFoundError(parent);
  if (entry.kind !== "directory") throw conflictError(parent);
}

function findNamespaceConflict(
  entries: readonly WorkspaceEntry[],
  candidate: Pick<WorkspaceEntry, "kind" | "path">,
  options: { allowExactPath?: boolean; claimDescendants?: boolean } = {}
) {
  const claimDescendants = options.claimDescendants ?? candidate.kind === "file";

  return entries.find((entry) => {
    if (entry.path === candidate.path) return !options.allowExactPath;
    if (candidate.path.startsWith(`${entry.path}/`)) return entry.kind === "file";

    // A file can never own a path that already has descendants. Moves additionally claim
    // their whole target subtree so directory moves cannot silently merge namespaces.
    return claimDescendants && entry.path.startsWith(`${candidate.path}/`);
  });
}

function conflictError(path: string) {
  return new WorkspaceNamespaceConflictError(path);
}

function notFoundError(path: string) {
  return new WorkspaceEntryNotFoundError(path);
}

function requireActiveWorkspace(workspace: StoredWorkspace | undefined, workspaceId: string) {
  if (!workspace || workspace.lifecycle !== "active") {
    throw new Error(`Workspace was not found: ${workspaceId}.`);
  }
}

function workspaceEntryRange(workspaceId: string, rootPath?: string) {
  if (typeof globalThis.IDBKeyRange === "undefined") return undefined;

  const lowerPath = rootPath ?? "";
  const upperPath: IDBValidKey = rootPath ? `${rootPath}\uffff` : [];

  return globalThis.IDBKeyRange.bound(
    [workspaceId, lowerPath],
    [workspaceId, upperPath]
  );
}

function getWorkspaceEntries(
  store: IDBObjectStore,
  workspaceId: string,
  rootPath?: string
) {
  return store.getAll(workspaceEntryRange(workspaceId, rootPath));
}

function ancestorPaths(path: string) {
  const segments = path.split("/");

  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}

async function requestWorkspacePathContext(
  store: IDBObjectStore,
  workspaceId: string,
  path: string,
  includeSubtree = true
) {
  const ancestors = ancestorPaths(path);
  const [exact, storedAncestors, storedSubtree] = await Promise.all([
    requestToPromise<WorkspaceEntry | undefined>(store.get([workspaceId, path])),
    Promise.all(ancestors.map((ancestor) =>
      requestToPromise<WorkspaceEntry | undefined>(store.get([workspaceId, ancestor]))
    )),
    includeSubtree
      ? requestToPromise<WorkspaceEntry[]>(getWorkspaceEntries(store, workspaceId, path))
      : Promise.resolve([] as WorkspaceEntry[])
  ]);
  const ancestorEntries = storedAncestors.filter((entry): entry is WorkspaceEntry =>
    entry?.workspaceId === workspaceId
  );
  const subtree = storedSubtree.filter((entry) =>
    entry.workspaceId === workspaceId && isAtOrBelow(entry.path, path)
  );
  if (exact?.workspaceId === workspaceId && !subtree.some((entry) => entry.path === exact.path)) {
    subtree.push(exact);
  }
  const entriesByPath = new Map<string, WorkspaceEntry>();
  for (const entry of [...ancestorEntries, ...subtree]) entriesByPath.set(entry.path, entry);
  if (exact?.workspaceId === workspaceId) entriesByPath.set(exact.path, exact);

  return {
    entries: Array.from(entriesByPath.values()),
    exact: exact?.workspaceId === workspaceId ? exact : undefined,
    subtree
  };
}

function importedPath(rootPath: string, file: File) {
  const relativePath = normalizeWorkspacePath(file.webkitRelativePath || file.name);
  if (relativePath === rootPath || relativePath.startsWith(`${rootPath}/`)) return relativePath;

  return normalizeWorkspacePath(`${rootPath}/${relativePath}`);
}

function buildImportedEntries(workspaceId: string, rootPath: string, files: readonly File[]) {
  const timestamp = Date.now();
  const entriesByPath = new Map<string, WorkspaceEntry>();
  entriesByPath.set(rootPath, {
    createdAt: timestamp,
    kind: "directory",
    modifiedAt: timestamp,
    path: rootPath,
    workspaceId
  });

  for (const file of files) {
    const path = importedPath(rootPath, file);
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const directoryPath = parts.slice(0, index).join("/");
      const existing = entriesByPath.get(directoryPath);
      if (existing?.kind === "file") throw conflictError(directoryPath);
      entriesByPath.set(directoryPath, existing ?? {
        createdAt: timestamp,
        kind: "directory",
        modifiedAt: timestamp,
        path: directoryPath,
        workspaceId
      });
    }

    if (entriesByPath.has(path)) throw conflictError(path);
    entriesByPath.set(path, {
      body: file,
      createdAt: timestamp,
      kind: "file",
      mediaType: file.type,
      modifiedAt: timestamp,
      path,
      workspaceId
    });
  }

  return sortEntries(Array.from(entriesByPath.values()));
}

export function createWorkspaceRepository(
  options: IndexedDbSettingsRuntimeOptions = {}
): WorkspaceRepository {
  let databasePromise: Promise<IDBDatabase> | null = null;

  const removeStaleStagingWorkspaces = async (database: IDBDatabase) => {
    const transaction = database.transaction(
      [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
      "readwrite"
    );
    const completion = transactionToPromise(transaction);
    const workspaceStore = transaction.objectStore(webRuntimeWorkspaceStoreName);
    const entryStore = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
    const workspaces = await requestToPromise<StoredWorkspace[]>(workspaceStore.getAll());
    const cutoff = Date.now() - staleStagingWorkspaceAgeMs;
    const staleWorkspaces = workspaces.filter((workspace) =>
      workspace.lifecycle === "staging"
      && (workspace.createdAt === undefined || workspace.createdAt < cutoff)
    );
    const storedEntries = await Promise.all(staleWorkspaces.map(async (workspace) =>
      requestToPromise<WorkspaceEntry[]>(getWorkspaceEntries(entryStore, workspace.id))
    ));
    await Promise.all(staleWorkspaces.flatMap((workspace, index) => [
      ...storedEntries[index]
        .filter((entry) => entry.workspaceId === workspace.id)
        .map((entry) => requestToPromise(entryStore.delete([workspace.id, entry.path]))),
      requestToPromise(workspaceStore.delete(workspace.id))
    ]));
    await completion;
  };

  const getDatabase = () => {
    databasePromise ??= openWebRuntimeDatabase(options).then(async (database) => {
      // Interrupted imports must not retain duplicate blobs forever, but recent staging records
      // may belong to an import still running in another browser tab.
      await removeStaleStagingWorkspaces(database);

      return database;
    });

    return databasePromise;
  };

  const readWorkspaceEntries = async (workspaceId: string, rootPath?: string) => {
    const database = await getDatabase();
    const transaction = database.transaction(
      [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
      "readonly"
    );
    const completion = transactionToPromise(transaction);
    const workspaceRequest = transaction.objectStore(webRuntimeWorkspaceStoreName).get(workspaceId);
    const entriesRequest = getWorkspaceEntries(
      transaction.objectStore(webRuntimeWorkspaceEntryStoreName),
      workspaceId,
      rootPath
    );
    const [workspace, storedEntries] = await Promise.all([
      requestToPromise<StoredWorkspace | undefined>(workspaceRequest),
      requestToPromise<WorkspaceEntry[]>(entriesRequest)
    ]);
    await completion;
    requireActiveWorkspace(workspace, workspaceId);

    return storedEntries.filter((entry) => entry.workspaceId === workspaceId);
  };

  const createWorkspace = async (workspace: StoredWorkspace) => {
    const database = await getDatabase();
    const transaction = database.transaction(webRuntimeWorkspaceStoreName, "readwrite");
    const completion = transactionToPromise(transaction);
    await requestToPromise(transaction.objectStore(webRuntimeWorkspaceStoreName).put(workspace));
    await completion;
  };

  const writeImportedFiles = async (workspaceId: string, entries: readonly WorkspaceEntry[]) => {
    const database = await getDatabase();
    const transaction = database.transaction(
      [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
      "readwrite"
    );
    const completion = transactionToPromise(transaction);
    const workspace = await requestToPromise<StoredWorkspace | undefined>(
      transaction.objectStore(webRuntimeWorkspaceStoreName).get(workspaceId)
    );
    if (!workspace || workspace.lifecycle !== "staging") {
      await completion;
      throw new Error(`Staging workspace was not found: ${workspaceId}.`);
    }

    const store = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
    await Promise.all(entries.map((entry) => requestToPromise(store.put(entry))));
    await completion;
  };

  const publishStagedEntries = async (stagedId: string, workspaceId: string) => {
    const database = await getDatabase();
    const transaction = database.transaction(
      [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
      "readwrite"
    );
    const completion = transactionToPromise(transaction);
    const workspaceStore = transaction.objectStore(webRuntimeWorkspaceStoreName);
    const entryStore = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
    const [targetWorkspace, stagedWorkspace, storedTargetEntries, storedStagedEntries] = await Promise.all([
      requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(workspaceId)),
      requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(stagedId)),
      requestToPromise<WorkspaceEntry[]>(getWorkspaceEntries(entryStore, workspaceId)),
      requestToPromise<WorkspaceEntry[]>(getWorkspaceEntries(entryStore, stagedId))
    ]);
    requireActiveWorkspace(targetWorkspace, workspaceId);
    if (!stagedWorkspace || stagedWorkspace.lifecycle !== "staging") {
      throw new Error(`Staging workspace was not found: ${stagedId}.`);
    }

    const targetEntries = storedTargetEntries.filter((entry) => entry.workspaceId === workspaceId);
    const stagedEntries = storedStagedEntries.filter((entry) => entry.workspaceId === stagedId);
    for (const entry of stagedEntries) {
      if (findNamespaceConflict(targetEntries, entry)) {
        await completion;
        throw conflictError(entry.path);
      }
    }

    const published = stagedEntries.map((entry) => ({ ...entry, workspaceId }));
    await Promise.all(published.map((entry) => requestToPromise(entryStore.put(entry))));
    await completion;
  };

  const removeWorkspace = async (workspaceId: string) => {
    const database = await getDatabase();
    const transaction = database.transaction(
      [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
      "readwrite"
    );
    const completion = transactionToPromise(transaction);
    const workspaceStore = transaction.objectStore(webRuntimeWorkspaceStoreName);
    const entryStore = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
    const storedEntries = await requestToPromise<WorkspaceEntry[]>(
      getWorkspaceEntries(entryStore, workspaceId)
    );
    const deleteRequests = storedEntries
      .filter((entry) => entry.workspaceId === workspaceId)
      .map((entry) => requestToPromise(entryStore.delete([workspaceId, entry.path])));
    deleteRequests.push(requestToPromise(workspaceStore.delete(workspaceId)));
    await Promise.all(deleteRequests);
    await completion;
  };

  return {
    async ensureDefaultWorkspace() {
      const database = await getDatabase();
      const transaction = database.transaction(webRuntimeWorkspaceStoreName, "readwrite");
      const completion = transactionToPromise(transaction);
      const store = transaction.objectStore(webRuntimeWorkspaceStoreName);
      const existing = await requestToPromise<StoredWorkspace | undefined>(store.get(defaultWorkspaceId));

      if (!existing) {
        await requestToPromise(store.put({
          id: defaultWorkspaceId,
          lifecycle: "active",
          name: defaultWorkspaceName
        } satisfies StoredWorkspace));
      }
      await completion;

      return {
        id: defaultWorkspaceId,
        name: existing?.name ?? defaultWorkspaceName
      };
    },
    async list(workspaceId, rootPath) {
      const normalizedRoot = rootPath === undefined ? undefined : normalizeWorkspacePath(rootPath);
      const entries = await readWorkspaceEntries(workspaceId, normalizedRoot);

      return sortEntries(entries.filter((entry) => !normalizedRoot || isAtOrBelow(entry.path, normalizedRoot)));
    },
    async read(workspaceId, path) {
      const normalizedPath = normalizeWorkspacePath(path);
      const database = await getDatabase();
      const transaction = database.transaction(
        [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
        "readonly"
      );
      const completion = transactionToPromise(transaction);
      const [workspace, entry] = await Promise.all([
        requestToPromise<StoredWorkspace | undefined>(
          transaction.objectStore(webRuntimeWorkspaceStoreName).get(workspaceId)
        ),
        requestToPromise<WorkspaceEntry | undefined>(
          transaction.objectStore(webRuntimeWorkspaceEntryStoreName).get([workspaceId, normalizedPath])
        )
      ]);
      await completion;
      requireActiveWorkspace(workspace, workspaceId);
      if (!entry) throw notFoundError(normalizedPath);

      return entry;
    },
    async createDirectory(workspaceId, path, options = {}) {
      const normalizedPath = normalizeWorkspacePath(path);
      const database = await getDatabase();
      const transaction = database.transaction(
        [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
        "readwrite"
      );
      const completion = transactionToPromise(transaction);
      const workspaceStore = transaction.objectStore(webRuntimeWorkspaceStoreName);
      const entryStore = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
      const [workspace, context] = await Promise.all([
        requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(workspaceId)),
        requestWorkspacePathContext(entryStore, workspaceId, normalizedPath)
      ]);
      requireActiveWorkspace(workspace, workspaceId);
      try {
        requireParentDirectory(context.entries, normalizedPath);
      } catch (error) {
        await completion;
        throw error;
      }
      const existing = context.exact;
      if (existing?.kind === "directory") {
        await completion;
        if (options.exclusive) throw conflictError(normalizedPath);
        return existing;
      }
      if (
        existing
        || findNamespaceConflict(context.entries, { kind: "directory", path: normalizedPath })
      ) {
        await completion;
        throw conflictError(normalizedPath);
      }

      const timestamp = Date.now();
      const entry: WorkspaceEntry = {
        createdAt: timestamp,
        kind: "directory",
        modifiedAt: timestamp,
        path: normalizedPath,
        workspaceId
      };
      await requestToPromise(entryStore.put(entry));
      await completion;

      return entry;
    },
    async writeFile(workspaceId, path, body, options = {}) {
      const normalizedPath = normalizeWorkspacePath(path);
      const mode = options.mode ?? "upsert";
      const database = await getDatabase();
      const transaction = database.transaction(
        [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
        "readwrite"
      );
      const completion = transactionToPromise(transaction);
      const workspaceStore = transaction.objectStore(webRuntimeWorkspaceStoreName);
      const entryStore = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
      const [workspace, context] = await Promise.all([
        requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(workspaceId)),
        requestWorkspacePathContext(entryStore, workspaceId, normalizedPath, mode !== "update")
      ]);
      requireActiveWorkspace(workspace, workspaceId);
      const existing = context.exact;
      try {
        requireParentDirectory(context.entries, normalizedPath);
      } catch (error) {
        await completion;
        throw error;
      }
      if (mode === "create" && existing) {
        await completion;
        throw conflictError(normalizedPath);
      }
      if (mode === "update" && !existing) {
        await completion;
        throw notFoundError(normalizedPath);
      }
      if (
        existing?.kind === "directory"
        || findNamespaceConflict(context.entries, { kind: "file", path: normalizedPath }, {
          allowExactPath: existing?.kind === "file"
        })
      ) {
        await completion;
        throw conflictError(normalizedPath);
      }

      const timestamp = Date.now();
      const entry: WorkspaceEntry = {
        body,
        createdAt: existing?.createdAt ?? timestamp,
        kind: "file",
        mediaType: body.type,
        modifiedAt: timestamp,
        path: normalizedPath,
        workspaceId
      };
      await requestToPromise(entryStore.put(entry));
      await completion;

      return entry;
    },
    async move(workspaceId, sourcePath, targetPath) {
      const normalizedSource = normalizeWorkspacePath(sourcePath);
      const normalizedTarget = normalizeWorkspacePath(targetPath);
      const database = await getDatabase();
      const transaction = database.transaction(
        [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
        "readwrite"
      );
      const completion = transactionToPromise(transaction);
      const workspaceStore = transaction.objectStore(webRuntimeWorkspaceStoreName);
      const entryStore = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
      const [workspace, sourceContext, targetContext] = await Promise.all([
        requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(workspaceId)),
        requestWorkspacePathContext(entryStore, workspaceId, normalizedSource),
        requestWorkspacePathContext(entryStore, workspaceId, normalizedTarget)
      ]);
      requireActiveWorkspace(workspace, workspaceId);
      const source = sourceContext.exact;
      if (!source) {
        await completion;
        throw notFoundError(normalizedSource);
      }
      const affected = sourceContext.subtree;
      if (normalizedTarget.startsWith(`${normalizedSource}/`)) {
        await completion;
        throw conflictError(normalizedTarget);
      }
      if (normalizedSource === normalizedTarget) {
        await completion;
        return sortEntries(affected);
      }

      try {
        requireParentDirectory(targetContext.entries, normalizedTarget);
      } catch (error) {
        await completion;
        throw error;
      }

      const affectedPaths = new Set(affected.map((entry) => entry.path));
      const unaffected = targetContext.entries.filter((entry) => !affectedPaths.has(entry.path));
      const timestamp = Date.now();
      const moved = affected.map((entry) => ({
        ...entry,
        modifiedAt: timestamp,
        path: `${normalizedTarget}${entry.path.slice(normalizedSource.length)}`
      }));
      for (const entry of moved) {
        if (findNamespaceConflict(unaffected, entry, {
          claimDescendants: entry.path === normalizedTarget || entry.kind === "file"
        })) {
          await completion;
          throw conflictError(entry.path);
        }
      }

      const deleteRequests = affected.map((entry) => requestToPromise(
        entryStore.delete([workspaceId, entry.path])
      ));
      const putRequests = moved.map((entry) => requestToPromise(entryStore.put(entry)));
      await Promise.all([...deleteRequests, ...putRequests]);
      await completion;

      return sortEntries(moved);
    },
    async remove(workspaceId, path, recursive = false) {
      const normalizedPath = normalizeWorkspacePath(path);
      const database = await getDatabase();
      const transaction = database.transaction(
        [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
        "readwrite"
      );
      const completion = transactionToPromise(transaction);
      const workspaceStore = transaction.objectStore(webRuntimeWorkspaceStoreName);
      const entryStore = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
      const [workspace, context] = await Promise.all([
        requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(workspaceId)),
        requestWorkspacePathContext(entryStore, workspaceId, normalizedPath)
      ]);
      requireActiveWorkspace(workspace, workspaceId);
      const entry = context.exact;
      if (!entry) {
        await completion;
        throw notFoundError(normalizedPath);
      }
      const affected = entry.kind === "file"
        ? [entry]
        : context.subtree;
      if (entry.kind === "directory" && affected.length > 1 && !recursive) {
        await completion;
        throw new Error(`Workspace directory is not empty: ${normalizedPath}.`);
      }

      await Promise.all(affected.map((candidate) => requestToPromise(
        entryStore.delete([workspaceId, candidate.path])
      )));
      await completion;

      return undefined;
    },
    async importDirectory(workspaceId, rootName, files) {
      const rootPath = normalizeWorkspacePath(rootName);
      const stagedId = `staging-${globalThis.crypto.randomUUID()}`;
      const entries = buildImportedEntries(stagedId, rootPath, files);
      await createWorkspace({
        createdAt: Date.now(),
        id: stagedId,
        lifecycle: "staging",
        name: rootName
      });

      try {
        await writeImportedFiles(stagedId, entries);
        await publishStagedEntries(stagedId, workspaceId);
        return rootPath;
      } finally {
        await removeWorkspace(stagedId);
      }
    },
    async exportEntries(workspaceId, rootPath) {
      const normalizedRoot = rootPath === undefined ? undefined : normalizeWorkspacePath(rootPath);
      const entries = await readWorkspaceEntries(workspaceId, normalizedRoot);

      return sortEntries(entries.filter((entry) => !normalizedRoot || isAtOrBelow(entry.path, normalizedRoot)));
    }
  };
}
