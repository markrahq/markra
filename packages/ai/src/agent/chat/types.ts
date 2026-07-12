import type { Tool } from "@earendil-works/pi-ai";
import type { AiProviderApiStyle, AiProviderConfig } from "@markra/providers";

export type ChatMessage = {
  content: string;
  images?: ChatImageAttachment[];
  role: "assistant" | "system" | "user";
  thinking?: string;
  thinkingBlocks?: ChatThinkingBlock[];
  thinkingRedacted?: boolean;
  thinkingSignature?: string;
  toolCalls?: ChatToolCall[];
  toolResult?: {
    outputText: string;
    toolCallId: string;
    toolName: string;
  };
};

export type ChatThinkingBlock = {
  redacted?: boolean;
  thinking: string;
  thinkingSignature?: string;
};

export type ChatImageAttachment = {
  dataUrl: string;
  mimeType: string;
};

export type ChatRequest = {
  body: unknown;
  headers: Record<string, string>;
  url: string;
};

export type ChatRequestOptions = {
  stream?: boolean;
  thinkingEnabled?: boolean;
  tools?: Tool[];
  webSearchEnabled?: boolean;
};

export type ChatToolCall = {
  arguments: Record<string, unknown>;
  id: string;
  name: string;
  thoughtSignature?: string;
};

export type ChatThinkingMetadata = {
  blockId?: string;
  phase?: "end" | "start" | "update";
  redacted?: boolean;
  signature?: string;
};

export type ChatToolCallDelta = {
  argumentsDelta?: string;
  id?: string;
  index: number;
  nameDelta?: string;
  replaceArguments?: boolean;
  replaceName?: boolean;
};

export type ChatResponse = {
  content: string;
  finishReason?: string;
  toolCalls?: ChatToolCall[];
};

export type ChatStreamEventResult = {
  contentDelta?: string;
  done?: boolean;
  finishReason?: string;
  reasoningDetails?: Record<string, unknown>[];
  thinkingDelta?: string;
  toolCallDeltas?: ChatToolCallDelta[];
};

export type ChatAdapter = {
  buildRequest: (config: AiProviderConfig, model: string, messages: ChatMessage[], options?: ChatRequestOptions) => ChatRequest;
  parseResponse: (body: unknown) => ChatResponse;
  parseStreamEvent: (body: unknown) => ChatStreamEventResult;
};
