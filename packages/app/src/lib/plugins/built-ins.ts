import { createDocumentStatsPlugin } from "@markra/document-stats";
import type { BuiltInPluginFactory } from "./registry";

export const builtInPluginFactories: BuiltInPluginFactory[] = [
  createDocumentStatsPlugin
];
