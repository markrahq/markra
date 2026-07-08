import { useSyncExternalStore } from "react";

const discoveredAppUpdateVersionStorageKey = "markra.discoveredAppUpdate.version";
const discoveredAppUpdateVersionChangedEvent = "markra:discovered-app-update-version-changed";

type DiscoveredAppUpdate = {
  currentVersion: string;
  version: string;
};

let fallbackDiscoveredAppUpdate: DiscoveredAppUpdate | null = null;

function normalizeDiscoveredAppUpdateVersion(value: unknown) {
  if (typeof value !== "string") return null;

  const version = value.trim();
  return version.length > 0 ? version : null;
}

function normalizeDiscoveredAppUpdate(value: unknown): DiscoveredAppUpdate | null {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as Partial<DiscoveredAppUpdate>;
  const version = normalizeDiscoveredAppUpdateVersion(candidate.version);
  const currentVersion = normalizeDiscoveredAppUpdateVersion(candidate.currentVersion);
  if (!version || !currentVersion) return null;

  return {
    currentVersion,
    version
  };
}

function getStorage() {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notifyDiscoveredAppUpdateVersionChanged() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(discoveredAppUpdateVersionChangedEvent));
}

export function getDiscoveredAppUpdateVersion(currentVersion?: string | null) {
  const update = getDiscoveredAppUpdate(currentVersion);

  return update?.version ?? null;
}

function getDiscoveredAppUpdate(currentVersion?: string | null) {
  const storage = getStorage();
  if (!storage) return filterDiscoveredAppUpdate(fallbackDiscoveredAppUpdate, currentVersion);

  let rawUpdate: string | null = null;
  try {
    rawUpdate = storage.getItem(discoveredAppUpdateVersionStorageKey);
  } catch {
    return filterDiscoveredAppUpdate(fallbackDiscoveredAppUpdate, currentVersion);
  }

  if (!rawUpdate) return filterDiscoveredAppUpdate(fallbackDiscoveredAppUpdate, currentVersion);

  try {
    const update = normalizeDiscoveredAppUpdate(JSON.parse(rawUpdate));

    return filterDiscoveredAppUpdate(update, currentVersion);
  } catch {
    return null;
  }
}

function filterDiscoveredAppUpdate(update: DiscoveredAppUpdate | null, currentVersion?: string | null) {
  const normalizedCurrentVersion = normalizeDiscoveredAppUpdateVersion(currentVersion);
  if (normalizedCurrentVersion && update?.currentVersion !== normalizedCurrentVersion) return null;

  return update;
}

export function setDiscoveredAppUpdateVersion(update: DiscoveredAppUpdate | null) {
  const normalizedUpdate = normalizeDiscoveredAppUpdate(update);
  fallbackDiscoveredAppUpdate = normalizedUpdate;

  const storage = getStorage();
  if (storage) {
    try {
      if (normalizedUpdate) {
        storage.setItem(discoveredAppUpdateVersionStorageKey, JSON.stringify(normalizedUpdate));
      } else {
        storage.removeItem(discoveredAppUpdateVersionStorageKey);
      }
    } catch {
      // Keep the in-memory fallback so the current window still updates even when storage is unavailable.
    }
  }

  notifyDiscoveredAppUpdateVersionChanged();
}

export function clearDiscoveredAppUpdateVersion(version?: string) {
  const update = getDiscoveredAppUpdate();
  if (version && update && update.version !== version) return;

  setDiscoveredAppUpdateVersion(null);
}

function subscribeDiscoveredAppUpdateVersion(listener: () => unknown) {
  if (typeof window === "undefined") return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === discoveredAppUpdateVersionStorageKey) listener();
  };

  window.addEventListener(discoveredAppUpdateVersionChangedEvent, listener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(discoveredAppUpdateVersionChangedEvent, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useDiscoveredAppUpdateVersion(currentVersion?: string | null) {
  return useSyncExternalStore(
    subscribeDiscoveredAppUpdateVersion,
    () => getDiscoveredAppUpdate(currentVersion)?.version ?? null,
    () => null
  );
}
