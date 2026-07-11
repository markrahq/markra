import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AiProviderConfig } from "@markra/providers";
import type { ChatImageAttachment } from "../chat/types";
import type { AiDiffResult, AiDiffTarget, AiDocumentAnchor, AiHeadingAnchor, AiSelectionContext } from "../inline";
import type { InlineAiAgentComplete } from "../runtime";
import type { AgentWorkspaceFile } from "../read-only-tools";
import type { WebSearchSettings, WebSearchTransport } from "../tools/web-search";

export type DocumentAiHistoryMessage = {
  images?: DocumentAiChatImage[];
  preview?: DocumentAiHistoryPreview;
  previews?: DocumentAiHistoryPreview[];
  role: "assistant" | "user";
  text: string;
};

export type DocumentAiChatImage = ChatImageAttachment & {
  id: string;
};

export type DocumentAiHistoryPreview = {
  from?: number;
  original: string;
  replacement: string;
  target?: AiDiffTarget;
  to?: number;
  type: "insert" | "replace";
};

export type RunDocumentAiAgentInput = {
  complete?: InlineAiAgentComplete;
  documentContent: string;
  documentEndPosition?: number;
  documentPath: string | null;
  headingAnchors?: AiHeadingAnchor[];
  history?: DocumentAiHistoryMessage[];
  images?: DocumentAiChatImage[];
  model: string;
  onEvent?: (event: AgentEvent) => unknown;
  onPreviewResult?: (result: AiDiffResult, previewId?: string) => unknown;
  onTextDelta?: (content: string) => unknown;
  onThinkingDelta?: (thinking: string) => unknown;
  prompt: string;
  provider: AiProviderConfig;
  readDocumentImage?: (src: string) => Promise<DocumentAiImage | null>;
  readWorkspaceFile?: (path: string) => Promise<string>;
  sectionAnchors?: AiDocumentAnchor[];
  selection?: AiSelectionContext | null;
  tableAnchors?: AiDocumentAnchor[];
  thinkingEnabled?: boolean;
  webSearchEnabled?: boolean;
  webSearchSettings?: WebSearchSettings | null;
  webSearchTransport?: WebSearchTransport;
  workspaceFiles?: AgentWorkspaceFile[];
};

export type DocumentAiImage = ChatImageAttachment & {
  alt?: string;
  path?: string;
  src: string;
};

export type RunDocumentAiAgentResult = {
  content: string;
  finishReason?: string;
  preparedPreview?: boolean;
  stopReasonCode?: "repeated_multi_write";
};
