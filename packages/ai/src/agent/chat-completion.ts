import type { AiProviderConfig } from "@markra/providers";
import { isRecord } from "@markra/shared";
import {
  getChatAdapter,
  getChatAdapterForProvider
} from "./chat-adapters";
import type { ChatMessage, ChatResponse, ChatThinkingMetadata, ChatToolCallDelta } from "./chat/types";
import { encodeOpenRouterReasoningDetails, mergeOpenRouterReasoningDetails } from "./reasoning-metadata";

export type NativeAiChatRequest = {
  body: string;
  headers: Record<string, string>;
  url: string;
};

export type NativeAiHttpResponse = {
  body: unknown;
  status: number;
};

export type NativeAiStreamResponse = {
  body?: unknown;
  status: number;
};

export type ChatCompletionTransport = (request: NativeAiChatRequest) => Promise<NativeAiHttpResponse>;
export type ChatCompletionStreamTransport = (
  request: NativeAiChatRequest,
  onChunk: (chunk: string) => unknown
) => Promise<NativeAiStreamResponse>;

export type ChatCompletionStreamOptions = {
  fallbackTransport?: ChatCompletionTransport;
  onDelta?: (delta: string) => unknown;
  onThinkingDelta?: (delta: string) => unknown;
  onThinkingMetadata?: (metadata: ChatThinkingMetadata) => unknown;
  onToolCallDelta?: (delta: ChatToolCallDelta) => unknown;
  streamTransport?: ChatCompletionStreamTransport;
  thinkingEnabled?: boolean;
  tools?: import("@earendil-works/pi-ai").Tool[];
  useVercelAiSdk?: boolean;
  webSearchEnabled?: boolean;
};

export async function chatCompletion(
  provider: AiProviderConfig,
  model: string,
  messages: ChatMessage[],
  transport: ChatCompletionTransport = missingChatCompletionTransport
): Promise<ChatResponse> {
  const adapter = getChatAdapterForProvider(provider);
  const request = adapter.buildRequest(provider, model, messages);
  const response = await transport({
    body: JSON.stringify(request.body),
    headers: request.headers,
    url: request.url
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(readResponseError(response));
  }
  const providerError = readProviderErrorMessage(response.body);
  if (providerError) {
    throw new Error(providerError);
  }

  return adapter.parseResponse(response.body);
}

export async function chatCompletionStream(
  provider: AiProviderConfig,
  model: string,
  messages: ChatMessage[],
  {
    fallbackTransport,
    onDelta,
    onThinkingDelta,
    onThinkingMetadata,
    onToolCallDelta,
    streamTransport = missingChatCompletionStreamTransport,
    thinkingEnabled,
    tools,
    useVercelAiSdk,
    webSearchEnabled
  }: ChatCompletionStreamOptions = {}
): Promise<ChatResponse> {
  const adapter = getChatAdapterForProvider(provider);
  let streamRequest: NativeAiChatRequest | undefined;
  const buildStreamRequest = () => {
    if (streamRequest) return streamRequest;
    const request = adapter.buildRequest(provider, model, messages, { stream: true, thinkingEnabled, tools, webSearchEnabled });
    streamRequest = {
      body: JSON.stringify(request.body),
      headers: request.headers,
      url: request.url
    };

    return streamRequest;
  };
  let content = "";
  let finishReason: string | undefined;
  const toolCalls = new Map<number, { argumentsText: string; id: string; name: string; thoughtSignature?: string }>();
  let reasoningDetails: Record<string, unknown>[] = [];
  const parser = createServerSentEventParser();
  const inlineThinkingExtractor = thinkingEnabled ? createInlineThinkingExtractor() : null;
  let streamErrorMessage: string | undefined;
  const emitContentDelta = (delta: string) => {
    content += delta;
    onDelta?.(delta);
  };
  const emitThinkingDelta = (delta: string) => {
    onThinkingDelta?.(delta);
  };
  const processContentDelta = (delta: string) => {
    if (!inlineThinkingExtractor) {
      emitContentDelta(delta);
      return;
    }

    const extracted = inlineThinkingExtractor.push(delta);
    if (extracted.thinkingDelta) emitThinkingDelta(extracted.thinkingDelta);
    if (extracted.contentDelta) emitContentDelta(extracted.contentDelta);
  };
  const processStreamEvent = (event: unknown) => {
    const providerError = readProviderErrorMessage(event);
    if (providerError) {
      streamErrorMessage = providerError;
      return;
    }

    const parsed = adapter.parseStreamEvent(event);
    if (parsed.done) return;

    if (parsed.contentDelta) {
      processContentDelta(parsed.contentDelta);
    }

    if (parsed.thinkingDelta) emitThinkingDelta(parsed.thinkingDelta);
    if (parsed.reasoningDetails?.length) {
      reasoningDetails = mergeOpenRouterReasoningDetails(reasoningDetails, parsed.reasoningDetails);
    }
    if (parsed.toolCallDeltas?.length) {
      for (const delta of parsed.toolCallDeltas) {
        const currentToolCall = toolCalls.get(delta.index) ?? { argumentsText: "", id: "", name: "" };
        currentToolCall.argumentsText = delta.replaceArguments
          ? (delta.argumentsDelta ?? "")
          : `${currentToolCall.argumentsText}${delta.argumentsDelta ?? ""}`;
        currentToolCall.id = delta.id ?? currentToolCall.id;
        currentToolCall.name = delta.replaceName
          ? (delta.nameDelta ?? "")
          : `${currentToolCall.name}${delta.nameDelta ?? ""}`;
        toolCalls.set(delta.index, currentToolCall);
        onToolCallDelta?.(delta);
      }
    }

    if (parsed.finishReason) finishReason = parsed.finishReason;
  };
  const applyParsedFallbackResponse = (parsed: ChatResponse) => {
    if (!finishReason && parsed.finishReason) finishReason = parsed.finishReason;
    if (!content && parsed.content) processContentDelta(parsed.content);
    if (toolCalls.size > 0 || !parsed.toolCalls?.length) return;

    for (const [index, toolCall] of parsed.toolCalls.entries()) {
      toolCalls.set(index, {
        argumentsText: JSON.stringify(toolCall.arguments),
        id: toolCall.id,
        name: toolCall.name,
        ...(toolCall.thoughtSignature ? { thoughtSignature: toolCall.thoughtSignature } : {})
      });
    }
  };
  const buildResponse = (): ChatResponse => {
    // OpenRouter details belong to the assistant turn; the first tool call is pi-ai's opaque transport field for them.
    const reasoningSignature = encodeOpenRouterReasoningDetails(reasoningDetails);

    return {
      content,
      finishReason,
      ...(toolCalls.size > 0
        ? {
            toolCalls: [...toolCalls.entries()].map(([, toolCall], index) => ({
              arguments: parseToolArguments(toolCall.argumentsText),
              id: toolCall.id,
              name: toolCall.name,
              ...(toolCall.thoughtSignature
                ? { thoughtSignature: toolCall.thoughtSignature }
                : index === 0 && reasoningSignature
                  ? { thoughtSignature: reasoningSignature }
                  : {})
            }))
          }
        : {})
    };
  };
  const flushInlineThinking = () => {
    const finalInlineThinkingDelta = inlineThinkingExtractor?.finish();
    if (finalInlineThinkingDelta?.thinkingDelta) emitThinkingDelta(finalInlineThinkingDelta.thinkingDelta);
    if (finalInlineThinkingDelta?.contentDelta) emitContentDelta(finalInlineThinkingDelta.contentDelta);
  };
  const canFallbackToNonStream = () => fallbackTransport !== undefined && !content;
  const applyParsedFallback = (parsed: ChatResponse) => {
    toolCalls.clear();
    applyParsedFallbackResponse(parsed);
    flushInlineThinking();

    return buildResponse();
  };
  const runCompatibleChatFallback = async () => {
    if (!fallbackTransport) throw new Error("AI chat fallback transport is not configured.");
    const compatibleAdapter = getChatAdapter("openai-compatible");
    const compatibleRequest = compatibleAdapter.buildRequest(provider, model, messages, { thinkingEnabled, tools });
    const compatibleResponse = await fallbackTransport({
      body: JSON.stringify(compatibleRequest.body),
      headers: compatibleRequest.headers,
      url: compatibleRequest.url
    });

    if (compatibleResponse.status < 200 || compatibleResponse.status >= 300) {
      throw new Error(readResponseError(compatibleResponse));
    }
    const compatibleProviderError = readProviderErrorMessage(compatibleResponse.body);
    if (compatibleProviderError) {
      throw new Error(compatibleProviderError);
    }

    return applyParsedFallback(compatibleAdapter.parseResponse(compatibleResponse.body));
  };
  const runNonStreamFallback = async () => {
    if (!fallbackTransport) throw new Error("AI chat fallback transport is not configured.");
    const fallbackRequest = adapter.buildRequest(provider, model, messages, { thinkingEnabled, tools, webSearchEnabled });
    const fallbackResponse = await fallbackTransport({
      body: JSON.stringify(fallbackRequest.body),
      headers: fallbackRequest.headers,
      url: fallbackRequest.url
    });

    if (fallbackResponse.status < 200 || fallbackResponse.status >= 300) {
      if (provider.apiStyle === "openai-responses") return runCompatibleChatFallback();
      throw new Error(readResponseError(fallbackResponse));
    }
    const fallbackProviderError = readProviderErrorMessage(fallbackResponse.body);
    if (fallbackProviderError) {
      if (provider.apiStyle === "openai-responses") return runCompatibleChatFallback();
      throw new Error(fallbackProviderError);
    }

    return applyParsedFallback(adapter.parseResponse(fallbackResponse.body));
  };
  if (useVercelAiSdk === true) {
    const {
      canUseVercelAiSdkChatCompletion,
      chatCompletionStreamWithVercelAiSdk
    } = await loadVercelAiSdkChatCompletion();

    if (canUseVercelAiSdkChatCompletion({
      fallbackTransport,
      messages,
      model,
      provider,
      streamTransport,
      thinkingEnabled,
      tools,
      useVercelAiSdk,
      webSearchEnabled
    })) {
      let sdkOutputEmitted = false;
      try {
        return await chatCompletionStreamWithVercelAiSdk({
          fallbackTransport,
          messages,
          model,
          onDelta: (delta) => {
            sdkOutputEmitted = true;
            onDelta?.(delta);
          },
          onThinkingDelta: (delta) => {
            sdkOutputEmitted = true;
            onThinkingDelta?.(delta);
          },
          onThinkingMetadata: (metadata) => {
            sdkOutputEmitted = true;
            onThinkingMetadata?.(metadata);
          },
          onToolCallDelta: (delta) => {
            sdkOutputEmitted = true;
            onToolCallDelta?.(delta);
          },
          provider,
          streamTransport,
          thinkingEnabled,
          tools,
          webSearchEnabled
        });
      } catch (error) {
        if (sdkOutputEmitted) throw error;
        if (canFallbackToNonStream()) return runNonStreamFallback();
      }
    }
  }
  let response: NativeAiStreamResponse;
  try {
    response = await streamTransport(buildStreamRequest(), (chunk) => {
      parser.push(chunk).forEach(processStreamEvent);
    });
  } catch (error) {
    if (canFallbackToNonStream()) return runNonStreamFallback();
    throw error;
  }

  try {
    parser.finish().forEach(processStreamEvent);
  } catch (error) {
    if (canFallbackToNonStream()) return runNonStreamFallback();
    throw error;
  }
  flushInlineThinking();

  if (response.status < 200 || response.status >= 300) {
    if (canFallbackToNonStream()) return runNonStreamFallback();
    throw new Error(readResponseError({ body: response.body ?? null, status: response.status }));
  }
  const providerError = streamErrorMessage ?? (response.body === undefined ? undefined : readProviderErrorMessage(response.body));
  if (providerError) {
    if (canFallbackToNonStream()) return runNonStreamFallback();
    throw new Error(providerError);
  }
  if ((!content || !finishReason) && response.body !== undefined) {
    applyParsedFallbackResponse(adapter.parseResponse(response.body));
  }
  if (!content && toolCalls.size === 0 && canFallbackToNonStream()) return runNonStreamFallback();

  return buildResponse();
}

function loadVercelAiSdkChatCompletion() {
  return import("./sdk/chat-completion");
}

function missingChatCompletionTransport(): never {
  throw new Error("AI chat transport is not configured.");
}

function missingChatCompletionStreamTransport(): never {
  throw new Error("AI chat stream transport is not configured.");
}

function readResponseError(response: NativeAiHttpResponse) {
  if (isRecord(response.body)) {
    if (typeof response.body.message === "string") return response.body.message;
    const providerError = readProviderErrorMessage(response.body);
    if (providerError) return providerError;
  }

  return `Request failed with HTTP ${response.status}.`;
}

function readProviderErrorMessage(body: unknown) {
  if (!isRecord(body)) return undefined;
  if (isRecord(body.error) && typeof body.error.message === "string") {
    if (typeof body.error.param === "string" && body.error.param.trim()) {
      return `${body.error.message}: ${body.error.param}`;
    }

    return body.error.message;
  }
  if (typeof body.error === "string") return body.error;

  return undefined;
}

function createServerSentEventParser() {
  let buffer = "";

  return {
    finish() {
      const finalBlock = buffer;
      buffer = "";

      return finalBlock.trim() ? parseServerSentEventBlock(finalBlock) : [];
    },
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, "\n");
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      return blocks.flatMap(parseServerSentEventBlock);
    }
  };
}

function parseServerSentEventBlock(block: string) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart());
  const data = dataLines.join("\n").trim();

  if (dataLines.length === 0) return parseRawJsonStreamLines(lines);
  if (!data) return [];
  if (data === "[DONE]") return ["[DONE]"];

  return [JSON.parse(data) as unknown];
}

function parseRawJsonStreamLines(lines: string[]) {
  return lines.flatMap((line) => {
    if (line === "[DONE]") return ["[DONE]"];
    if (!line.startsWith("{") && !line.startsWith("[")) return [];

    return [JSON.parse(line) as unknown];
  });
}

function parseToolArguments(rawArguments: string) {
  if (!rawArguments.trim()) return {};

  try {
    const parsed = JSON.parse(rawArguments) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

type InlineThinkingExtraction = {
  contentDelta?: string;
  thinkingDelta?: string;
};

const inlineThinkingTagNames = new Set(["reasoning", "seed:think", "think", "thinking", "thought"]);

function createInlineThinkingExtractor() {
  let activeThinkingTag: string | null = null;
  let pending = "";

  const append = (result: { contentDelta: string; thinkingDelta: string }, text: string) => {
    if (!text) return;
    if (activeThinkingTag) {
      result.thinkingDelta += text;
    } else {
      result.contentDelta += text;
    }
  };

  const readTag = (tag: string) => {
    const match = tag.trim().match(/^(\/)?([a-z][\w:-]*)\b[^>]*$/iu);
    if (!match) return null;

    const name = match[2]?.toLowerCase();
    if (!name || !inlineThinkingTagNames.has(name)) return null;

    return {
      closing: match[1] === "/",
      name
    };
  };

  const consume = (text: string, flushPending: boolean): InlineThinkingExtraction => {
    const result = { contentDelta: "", thinkingDelta: "" };
    let buffer = pending + text;
    let index = 0;
    pending = "";

    while (index < buffer.length) {
      const tagStart = buffer.indexOf("<", index);
      if (tagStart < 0) {
        append(result, buffer.slice(index));
        break;
      }

      append(result, buffer.slice(index, tagStart));
      const tagEnd = buffer.indexOf(">", tagStart + 1);
      if (tagEnd < 0) {
        pending = buffer.slice(tagStart);
        break;
      }

      const rawTag = buffer.slice(tagStart + 1, tagEnd);
      const tag = readTag(rawTag);
      if (tag?.closing && activeThinkingTag && tag.name === activeThinkingTag) {
        activeThinkingTag = null;
      } else if (tag && !tag.closing && !activeThinkingTag) {
        activeThinkingTag = tag.name;
      } else {
        append(result, buffer.slice(tagStart, tagEnd + 1));
      }

      index = tagEnd + 1;
    }

    if (flushPending && pending) {
      buffer = pending;
      pending = "";
      append(result, buffer);
    }

    return {
      ...(result.contentDelta ? { contentDelta: result.contentDelta } : {}),
      ...(result.thinkingDelta ? { thinkingDelta: result.thinkingDelta } : {})
    };
  };

  return {
    finish() {
      return consume("", true);
    },
    push(text: string) {
      return consume(text, false);
    }
  };
}
