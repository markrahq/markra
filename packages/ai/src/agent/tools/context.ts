import type { AiDiffResult, AiDocumentAnchor, AiHeadingAnchor, AiSelectionContext } from "../inline";
import type { AgentWorkspaceFile } from "../read-only-tools";
import type { WebSearchResponse, WebSearchSettings, WebSearchTransport } from "./web-search";

export type DocumentAgentToolContext = {
  documentContent: string;
  documentEndPosition: number;
  documentPath: string | null;
  headingAnchors?: AiHeadingAnchor[];
  onPreviewResult?: (result: AiDiffResult, previewId?: string) => unknown;
  readDocumentImage?: (src: string) => Promise<DocumentAgentImage | null>;
  readWorkspaceFile?: (path: string) => Promise<string>;
  sectionAnchors?: AiDocumentAnchor[];
  selection: AiSelectionContext | null;
  tableAnchors?: AiDocumentAnchor[];
  webSearch?: DocumentAgentWebSearch;
  workspaceFiles: AgentWorkspaceFile[];
};

export type DocumentAgentWebSearch = {
  runWebSearch?: (query: string, settings: WebSearchSettings) => Promise<WebSearchResponse>;
  settings: WebSearchSettings;
  transport?: WebSearchTransport;
};

export type DocumentAgentImage = {
  alt?: string;
  dataUrl: string;
  mimeType: string;
  path?: string;
  src: string;
};

export type DocumentAnchorPlacement =
  | "after_anchor"
  | "after_selection"
  | "after_heading"
  | "before_anchor"
  | "before_selection"
  | "before_heading"
  | "cursor";

export type RegionOperation = "delete" | "insert" | "replace";

export type PreparedInsertionPreview = {
  content: string;
  normalizedContent: string;
  position: number;
  previewId: string;
};

export type DocumentAgentToolState = {
  preparedInsertions: PreparedInsertionPreview[];
};
