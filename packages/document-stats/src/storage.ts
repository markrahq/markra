import type { PluginStorage } from "@markra/plugin-api";
import {
  defaultDocumentStatsOptions,
  normalizeDocumentStatsOptions,
  type DocumentStatsOptions
} from "./stats";

const optionsStorageKey = "options";

export async function loadDocumentStatsOptions(storage?: PluginStorage): Promise<DocumentStatsOptions> {
  const storedOptions = await storage?.get(optionsStorageKey, defaultDocumentStatsOptions);

  return normalizeDocumentStatsOptions(storedOptions);
}

export async function saveDocumentStatsOptions(storage: PluginStorage | undefined, options: DocumentStatsOptions) {
  if (!storage) return;

  await storage.set(optionsStorageKey, normalizeDocumentStatsOptions(options));
}
