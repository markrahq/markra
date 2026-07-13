type StoredIndexedDbRecord = Record<string, unknown>;

type RequestHandler = ((event: Event) => unknown) | null;

export class FakeWritableFileStream {
  constructor(private readonly onWrite: (contents: string) => unknown) {}

  async close() {
    return undefined;
  }

  async write(chunk: BlobPart) {
    if (typeof chunk === "string") {
      this.onWrite(chunk);
      return;
    }

    if (chunk instanceof Blob) {
      this.onWrite(await chunk.text());
      return;
    }

    this.onWrite(new TextDecoder().decode(chunk as BufferSource));
  }
}

export class FakeFileHandle {
  readonly kind = "file";
  writes: string[] = [];

  constructor(readonly name: string, private contents: string, private readonly type = "text/markdown") {}

  async createWritable() {
    return new FakeWritableFileStream((contents) => {
      this.contents = contents;
      this.writes.push(contents);
    });
  }

  async getFile() {
    return new File([this.contents], this.name, { type: this.type });
  }
}

export class FakeDirectoryHandle {
  readonly kind = "directory";

  constructor(
    readonly name: string,
    private readonly entriesByName: Record<string, FakeDirectoryHandle | FakeFileHandle>
  ) {}

  async *entries() {
    for (const entry of Object.entries(this.entriesByName)) {
      yield entry;
    }
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    const entry = this.entriesByName[name];
    if (entry instanceof FakeDirectoryHandle) return entry;
    if (entry instanceof FakeFileHandle) {
      throw new DOMException("Entry is not a directory", "TypeMismatchError");
    }
    if (options.create) {
      const directory = new FakeDirectoryHandle(name, {});
      this.entriesByName[name] = directory;
      return directory;
    }

    throw new DOMException("Directory not found", "NotFoundError");
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    const entry = this.entriesByName[name];
    if (entry instanceof FakeFileHandle) return entry;
    if (entry instanceof FakeDirectoryHandle) {
      throw new DOMException("Entry is not a file", "TypeMismatchError");
    }
    if (options.create) {
      const file = new FakeFileHandle(name, "");
      this.entriesByName[name] = file;
      return file;
    }

    throw new DOMException("File not found", "NotFoundError");
  }

  async removeEntry(name: string) {
    delete this.entriesByName[name];
  }
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (value instanceof Blob) return value.slice(0, value.size, value.type) as T;
  if (containsFakeFileSystemHandle(value)) return value;
  if (Array.isArray(value)) return value.map(cloneValue) as T;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)])
    ) as T;
  }
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);

  return JSON.parse(JSON.stringify(value)) as T;
}

function containsFakeFileSystemHandle(value: unknown): boolean {
  if (typeof value === "function") return true;
  if (value instanceof FakeDirectoryHandle || value instanceof FakeFileHandle) return true;
  if (!value || typeof value !== "object") return false;

  if (Array.isArray(value)) return value.some(containsFakeFileSystemHandle);

  return Object.values(value).some(containsFakeFileSystemHandle);
}

class FakeIdbRequest<TResult> {
  error: DOMException | null = null;
  onsuccess: RequestHandler = null;
  onerror: RequestHandler = null;
  result: TResult | undefined;

  succeed(result: TResult) {
    this.result = result;
    this.onsuccess?.(new Event("success"));
  }
}

class FakeIdbOpenRequest extends FakeIdbRequest<FakeIdbDatabase> {
  onblocked: RequestHandler = null;
  onupgradeneeded: RequestHandler = null;
}

class FakeIdbObjectStore {
  constructor(
    private readonly keyPath: string | string[],
    private readonly records: Map<string, StoredIndexedDbRecord>,
    private readonly transaction?: FakeIdbTransaction
  ) {}

  private queueOperation(operation: () => unknown) {
    this.transaction?.requestStarted();
    queueMicrotask(() => {
      try {
        operation();
      } finally {
        // Let request awaiters attach transaction handlers before completion is queued.
        this.transaction?.requestFinished();
      }
    });
  }

  delete(key: IDBValidKey) {
    const request = new FakeIdbRequest<undefined>();

    this.queueOperation(() => {
      this.records.delete(serializeKey(key));
      request.succeed(undefined);
    });

    return request as unknown as IDBRequest<undefined>;
  }

  get(key: IDBValidKey) {
    const request = new FakeIdbRequest<StoredIndexedDbRecord | undefined>();

    this.queueOperation(() => {
      request.succeed(cloneValue(this.records.get(serializeKey(key))));
    });

    return request as unknown as IDBRequest<StoredIndexedDbRecord | undefined>;
  }

  getAll() {
    const request = new FakeIdbRequest<StoredIndexedDbRecord[]>();

    this.queueOperation(() => {
      request.succeed(Array.from(this.records.values(), cloneValue));
    });

    return request as unknown as IDBRequest<StoredIndexedDbRecord[]>;
  }

  put(record: StoredIndexedDbRecord) {
    const request = new FakeIdbRequest<IDBValidKey>();

    this.queueOperation(() => {
      const key = typeof this.keyPath === "string"
        ? record[this.keyPath] as IDBValidKey
        : this.keyPath.map((part) => record[part]) as IDBValidKey;
      this.records.set(serializeKey(key), cloneValue(record));
      request.succeed(key);
    });

    return request as unknown as IDBRequest<IDBValidKey>;
  }
}

function serializeKey(key: IDBValidKey) {
  return Array.isArray(key) ? JSON.stringify(key) : String(key);
}

type FakeIdbStore = {
  keyPath: string | string[];
  records: Map<string, StoredIndexedDbRecord>;
};

export class FakeIdbTransaction {
  error: DOMException | null = null;
  onabort: RequestHandler = null;
  oncomplete: RequestHandler = null;
  onerror: RequestHandler = null;
  private completionQueued = false;
  private pendingRequests = 0;
  private readonly snapshots = new Map<string, Map<string, StoredIndexedDbRecord>>();
  private state: "pending" | "complete" | "failed" | "aborted" = "pending";

  constructor(
    private readonly stores = new Map<string, FakeIdbStore>(),
    private readonly completionError?: DOMException,
    rollbackOnFailure = false
  ) {
    if (rollbackOnFailure) {
      for (const [name, store] of stores) {
        this.snapshots.set(name, new Map(
          Array.from(store.records, ([key, record]) => [key, cloneValue(record)])
        ));
      }
    }
  }

  private rollback() {
    for (const [name, snapshot] of this.snapshots) {
      const records = this.stores.get(name)?.records;
      if (!records) continue;
      records.clear();
      for (const [key, record] of snapshot) records.set(key, cloneValue(record));
    }
  }

  abort(error = new DOMException("Transaction aborted", "AbortError")) {
    if (this.state !== "pending") return;
    this.error = error;
    this.state = "aborted";
    this.rollback();
    queueMicrotask(() => this.onabort?.(new Event("abort")));
  }

  complete() {
    if (this.state !== "pending" || this.completionQueued) return;
    this.completionQueued = true;
    // IndexedDB stays active through request-created promise microtasks, so dependent writes
    // must be allowed to enqueue before the transaction auto-commits at the end of the task.
    setTimeout(() => {
      this.completionQueued = false;
      if (this.state !== "pending" || this.pendingRequests > 0) return;
      if (this.completionError) {
        this.error = this.completionError;
        this.state = "failed";
        this.rollback();
        this.onerror?.(new Event("error"));
        return;
      }
      this.state = "complete";
      this.oncomplete?.(new Event("complete"));
    }, 0);
  }

  fail(error: DOMException) {
    if (this.state !== "pending") return;
    this.error = error;
    this.state = "failed";
    this.rollback();
    queueMicrotask(() => this.onerror?.(new Event("error")));
  }

  requestFinished() {
    if (this.state !== "pending" || this.pendingRequests === 0) return;
    this.pendingRequests -= 1;
    if (this.pendingRequests === 0) this.complete();
  }

  requestStarted() {
    if (this.state !== "pending") return;
    this.pendingRequests += 1;
  }

  objectStore(name: string) {
    const store = this.stores.get(name);
    if (!store) throw new DOMException(`Object store ${name} was not found.`, "NotFoundError");

    return new FakeIdbObjectStore(store.keyPath, store.records, this);
  }
}

class FakeIdbDatabase {
  private readonly stores = new Map<string, FakeIdbStore>();
  version = 0;

  constructor(private readonly takeTransactionFailure: () => DOMException | undefined) {}

  objectStoreNames = {
    contains: (name: string) => this.stores.has(name)
  };

  createObjectStore(name: string, options: IDBObjectStoreParameters = {}) {
    if (!this.stores.has(name)) {
      this.stores.set(name, {
        keyPath: typeof options.keyPath === "string" || Array.isArray(options.keyPath)
          ? options.keyPath
          : "id",
        records: new Map()
      });
    }

    const store = this.stores.get(name)!;

    return new FakeIdbObjectStore(store.keyPath, store.records);
  }

  transaction(names: string | string[], mode: IDBTransactionMode = "readonly") {
    const requestedNames = typeof names === "string" ? [names] : names;
    const stores = new Map<string, FakeIdbStore>();

    for (const name of requestedNames) {
      if (!this.stores.has(name)) {
        this.stores.set(name, {
          keyPath: "id",
          records: new Map()
        });
      }
      stores.set(name, this.stores.get(name)!);
    }

    const completionError = mode === "readwrite" ? this.takeTransactionFailure() : undefined;
    const transaction = new FakeIdbTransaction(stores, completionError, mode === "readwrite");
    transaction.complete();

    return transaction;
  }
}

export class FakeIndexedDbFactory {
  private readonly databases = new Map<string, FakeIdbDatabase>();
  private nextTransactionError: DOMException | undefined;
  readonly openedNames: string[] = [];

  failNextTransaction(error: DOMException) {
    this.nextTransactionError = error;
  }

  private takeTransactionFailure() {
    const error = this.nextTransactionError;
    this.nextTransactionError = undefined;

    return error;
  }

  open(name: string, version?: number) {
    const request = new FakeIdbOpenRequest();
    const existingDatabase = this.databases.get(name);
    const database = existingDatabase ?? new FakeIdbDatabase(() => this.takeTransactionFailure());
    const requestedVersion = version ?? (existingDatabase?.version ?? 1);

    this.openedNames.push(name);
    queueMicrotask(() => {
      request.result = database;
      if (requestedVersion > database.version) {
        this.databases.set(name, database);
        database.version = requestedVersion;
        request.onupgradeneeded?.(new Event("upgradeneeded"));
      }
      request.succeed(database);
    });

    return request as unknown as IDBOpenDBRequest;
  }

  get indexedDB() {
    return {
      open: this.open.bind(this)
    } as unknown as IDBFactory;
  }
}
