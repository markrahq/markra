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
  if (containsFakeFileSystemHandle(value)) return value;
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
    private readonly keyPath: string,
    private readonly records: Map<string, StoredIndexedDbRecord>
  ) {}

  delete(key: IDBValidKey) {
    const request = new FakeIdbRequest<undefined>();

    queueMicrotask(() => {
      this.records.delete(String(key));
      request.succeed(undefined);
    });

    return request as unknown as IDBRequest<undefined>;
  }

  get(key: IDBValidKey) {
    const request = new FakeIdbRequest<StoredIndexedDbRecord | undefined>();

    queueMicrotask(() => {
      request.succeed(cloneValue(this.records.get(String(key))));
    });

    return request as unknown as IDBRequest<StoredIndexedDbRecord | undefined>;
  }

  put(record: StoredIndexedDbRecord) {
    const request = new FakeIdbRequest<IDBValidKey>();

    queueMicrotask(() => {
      const key = String(record[this.keyPath]);
      this.records.set(key, cloneValue(record));
      request.succeed(key);
    });

    return request as unknown as IDBRequest<IDBValidKey>;
  }
}

class FakeIdbDatabase {
  private readonly stores = new Map<string, {
    keyPath: string;
    records: Map<string, StoredIndexedDbRecord>;
  }>();

  objectStoreNames = {
    contains: (name: string) => this.stores.has(name)
  };

  createObjectStore(name: string, options: IDBObjectStoreParameters = {}) {
    if (!this.stores.has(name)) {
      this.stores.set(name, {
        keyPath: typeof options.keyPath === "string" ? options.keyPath : "id",
        records: new Map()
      });
    }

    const store = this.stores.get(name)!;

    return new FakeIdbObjectStore(store.keyPath, store.records);
  }

  transaction(name: string) {
    if (!this.stores.has(name)) {
      this.stores.set(name, {
        keyPath: "id",
        records: new Map()
      });
    }

    const store = this.stores.get(name)!;

    return {
      objectStore: () => new FakeIdbObjectStore(store.keyPath, store.records)
    };
  }
}

export class FakeIndexedDbFactory {
  private readonly databases = new Map<string, FakeIdbDatabase>();
  readonly openedNames: string[] = [];

  open(name: string) {
    const request = new FakeIdbOpenRequest();
    const existingDatabase = this.databases.get(name);
    const database = existingDatabase ?? new FakeIdbDatabase();

    this.openedNames.push(name);
    queueMicrotask(() => {
      request.result = database;
      if (!existingDatabase) {
        this.databases.set(name, database);
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
