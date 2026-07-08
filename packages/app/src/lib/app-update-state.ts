import { useSyncExternalStore } from "react";

const discoveredAppUpdateVersionStorageKey = "markra.discoveredAppUpdate.version";
const discoveredAppUpdateVersionChangedEvent = "markra:discovered-app-update-version-changed";

let fallbackDiscoveredAppUpdateVersion: string | null = null;

function normalizeDiscoveredAppUpdateVersion(value: unknown) {
  if (typeof value !== "string") return null;

  const version = value.trim();
  return version.length > 0 ? version : null;
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

export function getDiscoveredAppUpdateVersion() {
  const storage = getStorage();
  if (!storage) return fallbackDiscoveredAppUpdateVersion;

  try {
    return normalizeDiscoveredAppUpdateVersion(storage.getItem(discoveredAppUpdateVersionStorageKey));
  } catch {
    return fallbackDiscoveredAppUpdateVersion;
  }
}

export function setDiscoveredAppUpdateVersion(version: string | null) {
  const normalizedVersion = normalizeDiscoveredAppUpdateVersion(version);
  fallbackDiscoveredAppUpdateVersion = normalizedVersion;

  const storage = getStorage();
  if (storage) {
    try {
      if (normalizedVersion) {
        storage.setItem(discoveredAppUpdateVersionStorageKey, normalizedVersion);
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
  const currentVersion = getDiscoveredAppUpdateVersion();
  if (version && currentVersion && currentVersion !== version) return;

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

export function useDiscoveredAppUpdateVersion() {
  return useSyncExternalStore(subscribeDiscoveredAppUpdateVersion, getDiscoveredAppUpdateVersion, () => null);
}
