import type {
  WebDirectoryHandle,
  WebFileHandle,
  WebHandleMove,
  WebWorkspaceLocation
} from "./types";
import {
  WorkspaceEntryNotFoundError,
  WorkspaceNamespaceConflictError,
  type WorkspaceEntry,
  type WorkspaceRepository
} from "./workspace";

const workspaceUrlPrefix = "web-workspace://";

type WorkspaceHandleState = {
  name: string;
  path: string;
  repository: WorkspaceRepository;
  workspaceId: string;
};

const directoryStates = new WeakMap<WebDirectoryHandle, WorkspaceHandleState>();

function workspacePathName(path: string) {
  return path.split("/").at(-1) ?? path;
}

function workspaceParentPath(path: string) {
  const separatorIndex = path.lastIndexOf("/");

  return separatorIndex < 0 ? "" : path.slice(0, separatorIndex);
}

function workspaceChildPath(rootPath: string, name: string) {
  return rootPath ? `${rootPath}/${name}` : name;
}

function validateWorkspaceName(name: string) {
  if (
    !name
    || name === "."
    || name === ".."
    || name.includes("/")
    || name.includes("\\")
    || name !== name.normalize("NFC")
  ) {
    throw new TypeError(`Invalid workspace entry name: ${name}`);
  }
}

function validateWorkspacePath(path: string) {
  if (path === "") return;

  const parts = path.split("/");
  if (
    path.startsWith("/")
    || path.endsWith("/")
    || path.includes("\\")
    || path !== path.normalize("NFC")
    || parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new TypeError(`Invalid workspace path: ${path}`);
  }
}

function validateWorkspaceId(workspaceId: string) {
  if (
    !workspaceId
    || workspaceId.includes("/")
    || workspaceId.includes("\\")
    || workspaceId !== workspaceId.normalize("NFC")
  ) {
    throw new TypeError(`Invalid workspace id: ${workspaceId}`);
  }
}

function workspaceDomException(name: string, message: string) {
  return new DOMException(message, name);
}

function notFound(path: string) {
  return workspaceDomException("NotFoundError", `Workspace entry was not found: ${path}.`);
}

function typeMismatch(path: string, expectedKind: WorkspaceEntry["kind"]) {
  return workspaceDomException(
    "TypeMismatchError",
    `Workspace entry is not a ${expectedKind}: ${path}.`
  );
}

function invalidModification(path: string) {
  return workspaceDomException("InvalidModificationError", `Workspace entry cannot be modified: ${path}.`);
}

async function readEntry(state: WorkspaceHandleState, path: string) {
  try {
    return await state.repository.read(state.workspaceId, path);
  } catch (error) {
    if (!(error instanceof WorkspaceEntryNotFoundError)) throw error;
    throw notFound(path);
  }
}

async function requireReceivingDirectory(state: WorkspaceHandleState) {
  if (!state.path) return;

  const entry = await readEntry(state, state.path);
  if (entry.kind !== "directory") throw typeMismatch(state.path, "directory");
}

async function getEntry(
  state: WorkspaceHandleState,
  path: string,
  kind: WorkspaceEntry["kind"],
  create: boolean
) {
  let entry: WorkspaceEntry;
  try {
    entry = await state.repository.read(state.workspaceId, path);
  } catch (error) {
    if (!(error instanceof WorkspaceEntryNotFoundError)) throw error;
    if (!create) throw notFound(path);

    try {
      entry = kind === "directory"
        ? await state.repository.createDirectory(state.workspaceId, path)
        : await state.repository.writeFile(state.workspaceId, path, new Blob([]));
    } catch (creationError) {
      if (!(creationError instanceof WorkspaceNamespaceConflictError)) throw creationError;
      throw typeMismatch(path, kind);
    }
  }

  if (entry.kind !== kind) throw typeMismatch(path, kind);

  return entry;
}

async function targetMovePath(
  state: WorkspaceHandleState,
  directoryOrName: WebDirectoryHandle | string,
  newName?: string
) {
  if (typeof directoryOrName === "string") {
    validateWorkspaceName(directoryOrName);
    const parentPath = workspaceParentPath(state.path);
    if (parentPath) {
      const parent = await readEntry(state, parentPath);
      if (parent.kind !== "directory") throw typeMismatch(parentPath, "directory");
    }

    return workspaceChildPath(parentPath, directoryOrName);
  }

  const target = directoryStates.get(directoryOrName);
  if (
    !target
    || target.repository !== state.repository
    || target.workspaceId !== state.workspaceId
  ) {
    throw invalidModification(state.path);
  }
  await requireReceivingDirectory(target);

  const targetName = newName ?? workspacePathName(state.path);
  validateWorkspaceName(targetName);

  return workspaceChildPath(target.path, targetName);
}

function createMove(state: WorkspaceHandleState): WebHandleMove {
  return async (directoryOrName: WebDirectoryHandle | string, newName?: string) => {
    if (!state.path) throw invalidModification(state.path);

    const targetPath = await targetMovePath(state, directoryOrName, newName);
    try {
      await state.repository.move(state.workspaceId, state.path, targetPath);
    } catch {
      throw invalidModification(targetPath);
    }

    // A successful native-style move keeps the handle usable at its new location.
    state.path = targetPath;
    state.name = workspacePathName(targetPath);
  };
}

export function createWorkspaceFileHandle(
  repository: WorkspaceRepository,
  workspaceId: string,
  path: string
): WebFileHandle {
  validateWorkspaceId(workspaceId);
  validateWorkspacePath(path);
  const state: WorkspaceHandleState = {
    name: workspacePathName(path),
    path,
    repository,
    workspaceId
  };

  return {
    async createWritable() {
      const chunks: BlobPart[] = [];
      let closed = false;

      return {
        async close() {
          if (closed) throw new TypeError("Cannot close a closed workspace file stream.");
          closed = true;

          // Buffer until close so an incomplete save never replaces the durable entry.
          await state.repository.writeFile(state.workspaceId, state.path, new Blob(chunks));
        },
        async write(chunk) {
          if (closed) throw new TypeError("Cannot write to a closed workspace file stream.");
          chunks.push(chunk);
        }
      };
    },
    async getFile() {
      const entry = await readEntry(state, state.path);
      if (entry.kind !== "file") throw typeMismatch(state.path, "file");

      return new File([entry.body ?? new Blob([])], state.name, {
        lastModified: entry.modifiedAt,
        type: entry.mediaType ?? "application/octet-stream"
      });
    },
    kind: "file",
    move: createMove(state),
    get name() {
      return state.name;
    }
  };
}

export function createWorkspaceDirectoryHandle(
  repository: WorkspaceRepository,
  workspaceId: string,
  rootPath: string,
  name: string
): WebDirectoryHandle {
  validateWorkspaceId(workspaceId);
  validateWorkspacePath(rootPath);
  const state: WorkspaceHandleState = {
    name,
    path: rootPath,
    repository,
    workspaceId
  };
  const handle: WebDirectoryHandle = {
    async *entries() {
      const prefix = state.path ? `${state.path}/` : "";
      const entries = await state.repository.list(
        state.workspaceId,
        state.path || undefined
      );
      for (const entry of entries) {
        if (!entry.path.startsWith(prefix)) continue;
        const relativePath = entry.path.slice(prefix.length);
        if (!relativePath || relativePath.includes("/")) continue;

        const child = entry.kind === "directory"
          ? createWorkspaceDirectoryHandle(
              state.repository,
              state.workspaceId,
              entry.path,
              relativePath
            )
          : createWorkspaceFileHandle(state.repository, state.workspaceId, entry.path);
        yield [relativePath, child] satisfies [string, WebDirectoryHandle | WebFileHandle];
      }
    },
    async getDirectoryHandle(childName, options) {
      validateWorkspaceName(childName);
      if (options?.create) await requireReceivingDirectory(state);
      const path = workspaceChildPath(state.path, childName);
      await getEntry(state, path, "directory", options?.create ?? false);

      return createWorkspaceDirectoryHandle(
        state.repository,
        state.workspaceId,
        path,
        childName
      );
    },
    async getFileHandle(childName, options) {
      validateWorkspaceName(childName);
      if (options?.create) await requireReceivingDirectory(state);
      const path = workspaceChildPath(state.path, childName);
      await getEntry(state, path, "file", options?.create ?? false);

      return createWorkspaceFileHandle(state.repository, state.workspaceId, path);
    },
    kind: "directory",
    move: createMove(state),
    get name() {
      return state.name;
    },
    async removeEntry(childName, options) {
      validateWorkspaceName(childName);
      const path = workspaceChildPath(state.path, childName);
      const entry = await readEntry(state, path);
      if (entry.kind === "directory" && !options?.recursive) {
        const entries = await state.repository.list(state.workspaceId, path);
        if (entries.length > 1) throw invalidModification(path);
      }

      try {
        await state.repository.remove(state.workspaceId, path, options?.recursive);
      } catch {
        throw invalidModification(path);
      }
    },
    async *values() {
      for await (const [, child] of handle.entries!()) yield child;
    }
  };
  directoryStates.set(handle, state);

  return handle;
}

export function createWorkspaceUrl(workspaceId: string, path: string) {
  validateWorkspaceId(workspaceId);
  validateWorkspacePath(path);
  const workspaceUrl = `${workspaceUrlPrefix}${encodeURIComponent(workspaceId)}`;
  if (!path) return workspaceUrl;

  return `${workspaceUrl}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function parseWorkspaceUrl(value: string): WebWorkspaceLocation | null {
  if (!value.startsWith(workspaceUrlPrefix)) return null;

  const encodedLocation = value.slice(workspaceUrlPrefix.length);
  const separatorIndex = encodedLocation.indexOf("/");
  if (
    !encodedLocation
    || separatorIndex === 0
    || encodedLocation.includes("?")
    || encodedLocation.includes("#")
  ) {
    return null;
  }

  try {
    const encodedWorkspaceId = separatorIndex < 0
      ? encodedLocation
      : encodedLocation.slice(0, separatorIndex);
    const encodedPath = separatorIndex < 0 ? "" : encodedLocation.slice(separatorIndex + 1);
    if (separatorIndex >= 0 && !encodedPath) return null;

    const decodedSegments = encodedPath
      ? encodedPath.split("/").map((segment) => decodeURIComponent(segment))
      : [];
    if (decodedSegments.some((segment) => segment.includes("/") || segment.includes("\\"))) {
      return null;
    }

    const workspaceId = decodeURIComponent(encodedWorkspaceId);
    const path = decodedSegments.join("/");
    validateWorkspaceId(workspaceId);
    validateWorkspacePath(path);

    return { path, workspaceId };
  } catch {
    return null;
  }
}
