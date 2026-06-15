import {
  configureAppRuntime,
  createDefaultAppRuntime,
  resetAppRuntimeForTests,
  type AppSettingsRuntime,
  type RuntimeStore
} from "../runtime";

type MockRuntimeStoreLoader = ReturnType<typeof vi.fn> & AppSettingsRuntime["loadStore"];

export type MockRuntimeStore = {
  delete: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

export type SettingsStoreHarness = {
  loadStore: MockRuntimeStoreLoader;
  originalRandomUuid: Crypto["randomUUID"];
  store: MockRuntimeStore;
};

export function createMockRuntimeStore(): MockRuntimeStore {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    set: vi.fn()
  };
}

export function createSettingsStoreHarness(): SettingsStoreHarness {
  return {
    loadStore: vi.fn() as MockRuntimeStoreLoader,
    originalRandomUuid: globalThis.crypto.randomUUID,
    store: createMockRuntimeStore()
  };
}

export function setupSettingsStoreHarness(harness: SettingsStoreHarness) {
  globalThis.crypto.randomUUID = harness.originalRandomUuid;
  harness.loadStore.mockReset();
  harness.store.delete.mockReset();
  harness.store.get.mockReset();
  harness.store.save.mockReset();
  harness.store.set.mockReset();
  harness.loadStore.mockResolvedValue(harness.store as unknown as RuntimeStore);
  configureAppRuntime({
    ...createDefaultAppRuntime(),
    settings: {
      loadStore: harness.loadStore
    }
  });
}

export function resetSettingsStoreRuntime() {
  resetAppRuntimeForTests();
}
