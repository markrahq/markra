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
  createDirectory: (workspaceId: string, path: string) => Promise<WorkspaceEntry>;
  writeFile: (workspaceId: string, path: string, body: Blob) => Promise<WorkspaceEntry>;
  move: (workspaceId: string, sourcePath: string, targetPath: string) => Promise<WorkspaceEntry[]>;
  remove: (workspaceId: string, path: string, recursive?: boolean) => Promise<unknown>;
  importDirectory: (workspaceId: string, rootName: string, files: readonly File[]) => Promise<string>;
  exportEntries: (workspaceId: string, rootPath?: string) => Promise<WorkspaceEntry[]>;
};

type StoredWorkspace = {
  id: string;
  lifecycle: "active" | "staging";
  name: string;
};

const defaultWorkspaceName = "Workspace";

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
  return new Error(`Workspace entry conflicts with ${path}.`);
}

function notFoundError(path: string) {
  return new Error(`Workspace entry was not found: ${path}.`);
}

function requireActiveWorkspace(workspace: StoredWorkspace | undefined, workspaceId: string) {
  if (!workspace || workspace.lifecycle !== "active") {
    throw new Error(`Workspace was not found: ${workspaceId}.`);
  }
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
  const getDatabase = () => {
    databasePromise ??= openWebRuntimeDatabase(options);

    return databasePromise;
  };

  const readWorkspaceEntries = async (workspaceId: string) => {
    const database = await getDatabase();
    const transaction = database.transaction(
      [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
      "readonly"
    );
    const completion = transactionToPromise(transaction);
    const workspaceRequest = transaction.objectStore(webRuntimeWorkspaceStoreName).get(workspaceId);
    const entriesRequest = transaction.objectStore(webRuntimeWorkspaceEntryStoreName).getAll();
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
    const [targetWorkspace, stagedWorkspace, storedEntries] = await Promise.all([
      requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(workspaceId)),
      requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(stagedId)),
      requestToPromise<WorkspaceEntry[]>(entryStore.getAll())
    ]);
    requireActiveWorkspace(targetWorkspace, workspaceId);
    if (!stagedWorkspace || stagedWorkspace.lifecycle !== "staging") {
      throw new Error(`Staging workspace was not found: ${stagedId}.`);
    }

    const targetEntries = storedEntries.filter((entry) => entry.workspaceId === workspaceId);
    const stagedEntries = storedEntries.filter((entry) => entry.workspaceId === stagedId);
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
    const storedEntries = await requestToPromise<WorkspaceEntry[]>(entryStore.getAll());
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
      const entries = await readWorkspaceEntries(workspaceId);

      return sortEntries(entries.filter((entry) => !normalizedRoot || isAtOrBelow(entry.path, normalizedRoot)));
    },
    async read(workspaceId, path) {
      const normalizedPath = normalizeWorkspacePath(path);
      const entry = findEntry(await readWorkspaceEntries(workspaceId), normalizedPath);
      if (!entry) throw notFoundError(normalizedPath);

      return entry;
    },
    async createDirectory(workspaceId, path) {
      const normalizedPath = normalizeWorkspacePath(path);
      const database = await getDatabase();
      const transaction = database.transaction(
        [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
        "readwrite"
      );
      const completion = transactionToPromise(transaction);
      const workspaceStore = transaction.objectStore(webRuntimeWorkspaceStoreName);
      const entryStore = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
      const [workspace, storedEntries] = await Promise.all([
        requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(workspaceId)),
        requestToPromise<WorkspaceEntry[]>(entryStore.getAll())
      ]);
      requireActiveWorkspace(workspace, workspaceId);
      const entries = storedEntries.filter((entry) => entry.workspaceId === workspaceId);
      const existing = findEntry(entries, normalizedPath);
      if (existing?.kind === "directory") {
        await completion;
        return existing;
      }
      if (existing || findNamespaceConflict(entries, { kind: "directory", path: normalizedPath })) {
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
    async writeFile(workspaceId, path, body) {
      const normalizedPath = normalizeWorkspacePath(path);
      const database = await getDatabase();
      const transaction = database.transaction(
        [webRuntimeWorkspaceStoreName, webRuntimeWorkspaceEntryStoreName],
        "readwrite"
      );
      const completion = transactionToPromise(transaction);
      const workspaceStore = transaction.objectStore(webRuntimeWorkspaceStoreName);
      const entryStore = transaction.objectStore(webRuntimeWorkspaceEntryStoreName);
      const [workspace, storedEntries] = await Promise.all([
        requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(workspaceId)),
        requestToPromise<WorkspaceEntry[]>(entryStore.getAll())
      ]);
      requireActiveWorkspace(workspace, workspaceId);
      const entries = storedEntries.filter((entry) => entry.workspaceId === workspaceId);
      const existing = findEntry(entries, normalizedPath);
      if (
        existing?.kind === "directory"
        || findNamespaceConflict(entries, { kind: "file", path: normalizedPath }, {
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
      const [workspace, storedEntries] = await Promise.all([
        requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(workspaceId)),
        requestToPromise<WorkspaceEntry[]>(entryStore.getAll())
      ]);
      requireActiveWorkspace(workspace, workspaceId);
      const entries = storedEntries.filter((entry) => entry.workspaceId === workspaceId);
      const source = findEntry(entries, normalizedSource);
      if (!source) {
        await completion;
        throw notFoundError(normalizedSource);
      }
      const affected = entries.filter((entry) => isAtOrBelow(entry.path, normalizedSource));
      if (normalizedTarget.startsWith(`${normalizedSource}/`)) {
        await completion;
        throw conflictError(normalizedTarget);
      }
      if (normalizedSource === normalizedTarget) {
        await completion;
        return sortEntries(affected);
      }

      const affectedPaths = new Set(affected.map((entry) => entry.path));
      const unaffected = entries.filter((entry) => !affectedPaths.has(entry.path));
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
      const [workspace, storedEntries] = await Promise.all([
        requestToPromise<StoredWorkspace | undefined>(workspaceStore.get(workspaceId)),
        requestToPromise<WorkspaceEntry[]>(entryStore.getAll())
      ]);
      requireActiveWorkspace(workspace, workspaceId);
      const entries = storedEntries.filter((entry) => entry.workspaceId === workspaceId);
      const entry = findEntry(entries, normalizedPath);
      if (!entry) {
        await completion;
        throw notFoundError(normalizedPath);
      }
      const affected = entry.kind === "file"
        ? [entry]
        : entries.filter((candidate) => isAtOrBelow(candidate.path, normalizedPath));
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
      await createWorkspace({ id: stagedId, lifecycle: "staging", name: rootName });

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
      const entries = await readWorkspaceEntries(workspaceId);

      return sortEntries(entries.filter((entry) => !normalizedRoot || isAtOrBelow(entry.path, normalizedRoot)));
    }
  };
}
