export type IndexedDbSettingsRuntimeOptions = {
  databaseName?: string;
  indexedDB?: IDBFactory | null;
  objectStoreName?: string;
};

export type WebWritableFileStream = {
  close: () => Promise<unknown>;
  write: (data: BlobPart) => Promise<unknown>;
};

export type WebHandleMove = {
  (name: string): Promise<unknown>;
  (directory: WebDirectoryHandle): Promise<unknown>;
  (directory: WebDirectoryHandle, name: string): Promise<unknown>;
};

export type WebFileHandle = {
  createWritable?: () => Promise<WebWritableFileStream>;
  getFile: () => Promise<File>;
  kind?: "file";
  move?: WebHandleMove;
  name: string;
};

export type WebDirectoryHandle = {
  createDirectoryExclusive?: (name: string) => Promise<WebDirectoryHandle>;
  createFileExclusive?: (name: string) => Promise<WebFileHandle>;
  entries?: () => AsyncIterable<[string, WebFileHandle | WebDirectoryHandle]>;
  getDirectoryHandle?: (name: string, options?: { create?: boolean }) => Promise<WebDirectoryHandle>;
  getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<WebFileHandle>;
  kind?: "directory";
  move?: WebHandleMove;
  name: string;
  removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<unknown>;
  values?: () => AsyncIterable<WebFileHandle | WebDirectoryHandle>;
};

export type WebWorkspaceLocation = {
  path: string;
  workspaceId: string;
};

export type WebDownloadFile = {
  contents: BlobPart;
  name: string;
  type: string;
};

export type WebRuntimeOptions = IndexedDbSettingsRuntimeOptions & {
  confirm?: (message: string) => boolean;
  document?: Document;
  downloadFile?: (download: WebDownloadFile) => Promise<unknown> | unknown;
  eventTarget?: EventTarget;
  fetch?: typeof fetch;
  openExternalUrl?: (url: string) => Promise<unknown> | unknown;
  pickDirectoryFiles?: () => Promise<File[]>;
  printFile?: (download: WebDownloadFile) => Promise<unknown> | unknown;
  showDirectoryPicker?: (options?: unknown) => Promise<WebDirectoryHandle>;
  showOpenFilePicker?: (options?: unknown) => Promise<WebFileHandle[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<WebFileHandle>;
};
