import {
  buildAnthropicThinkingRequestOptions,
  buildDeepSeekThinkingRequestOptions,
  buildOpenAiCompatibleRequestParts,
  buildResponsesStyleRequestOptions,
  getNativeWebSearchKind,
  readAiProviderCustomHeaders,
  type AiProviderApiStyle,
  type AiProviderConfig
} from "@markra/providers";
import { isRecord, joinApiUrl } from "@markra/shared";
import type {
  ChatAdapter,
  ChatMessage,
  ChatRequest,
  ChatRequestOptions,
  ChatResponse,
  ChatStreamEventResult,
  ChatToolCall,
  ChatToolCallDelta
} from "./chat/types";
import { buildChatCompletionsRequestBody } from "./requests/chat-completions";
import { buildResponsesRequestBody } from "./requests/responses";
import { mergeRequestBody } from "./requests/shared";
import { buildAnthropicTools } from "./tool-builders/anthropic";
import { buildGoogleTools } from "./tool-builders/google";

export type * from "./chat/types";

const anthropicVersion = "2023-06-01";
const azureApiVersion = "2024-10-21";

const defaultChatBaseUrlByApiStyle: Partial<Record<AiProviderApiStyle, string>> = {
  anthropic: "https://api.anthropic.com/v1",
  "azure-openai": "https://your-resource-name.openai.azure.com",
  deepseek: "https://api.deepseek.com",
  google: "https://generativelanguage.googleapis.com/v1beta",
  openai: "https://api.openai.com/v1"
};

const openAiCompatibleAdapter: ChatAdapter = {
  buildRequest(config, model, messages, options = {}) {
    const baseUrl = config.baseUrl?.trim() || defaultChatBaseUrlByApiStyle[config.type] || "";
    if (!baseUrl) throw new Error("API URL is required.");
    const nativeWebSearchKind = options.webSearchEnabled === true ? getNativeWebSearchKind(config, model) : null;
    if (
      nativeWebSearchKind === "dashscope-responses-tool" ||
      nativeWebSearchKind === "openai-responses" ||
      nativeWebSearchKind === "openrouter-server-tool" ||
      nativeWebSearchKind === "volcengine-responses-tool"
    ) {
      return buildResponsesStyleRequest({
        authHeaders: {
          ...(config.apiKey?.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
          "content-type": "application/json",
          ...readAiProviderCustomHeaders(config)
        },
        baseUrl,
        config,
        messages,
        model,
        nativeWebSearchToolType: nativeWebSearchKind === "openrouter-server-tool" ? "openrouter:web_search" : "web_search",
        options,
        responsePath: "/responses"
      });
    }

    const requestParts = buildOpenAiCompatibleRequestParts(config, model, options);
    const body = buildChatCompletionsRequestBody({
      extraBody: requestParts.extraBody,
      messages: messages.map(openAiCompatibleMessage),
      model,
      nativeTools: requestParts.nativeTools,
      stream: options.stream,
      tools: options.tools
    });

    return {
      body,
      headers: {
        ...(config.apiKey?.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
        "content-type": "application/json",
        ...readAiProviderCustomHeaders(config)
      },
      url: joinApiUrl(baseUrl, "/chat/completions")
    };
  },
  parseResponse(body) {
    if (isOpenAiResponsesBody(body)) return parseOpenAiResponsesResponse(body);

    const record = isRecord(body) ? body : {};
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const firstChoice = isRecord(choices[0]) ? choices[0] : {};
    const message = isRecord(firstChoice.message) ? firstChoice.message : {};
    const content = readOpenAiCompatibleContentDeltas(message.content).contentDelta ?? "";
    const toolCalls = readOpenAiCompatibleToolCalls(message);

    return {
      content,
      finishReason: normalizeFinishReason(typeof firstChoice.finish_reason === "string" ? firstChoice.finish_reason : undefined),
      ...(toolCalls.length ? { toolCalls } : {})
    };
  },
  parseStreamEvent(body) {
    if (isOpenAiResponsesStreamEvent(body)) return parseOpenAiResponsesStreamEvent(body);

    return parseOpenAiCompatibleStreamEvent(body);
  }
};
function buildResponsesStyleRequest({
  authHeaders,
  baseUrl,
  config,
  messages,
  model,
  nativeWebSearchToolType,
  options,
  responsePath
}: {
  authHeaders: Record<string, string>;
  baseUrl: string;
  config: AiProviderConfig;
  messages: ChatMessage[];
  model: string;
  nativeWebSearchToolType: "openrouter:web_search" | "web_search";
  options: ChatRequestOptions;
  responsePath: string;
}): ChatRequest {
  const body = buildResponsesRequestBody({
    extraBody: buildResponsesStyleRequestOptions(config, model, nativeWebSearchToolType, options),
    messages,
    model,
    nativeWebSearchToolType,
    stream: options.stream,
    tools: options.tools
  });

  return {
    body,
    headers: authHeaders,
    url: joinApiUrl(baseUrl, responsePath)
  };
}

const deepseekAdapter: ChatAdapter = {
  buildRequest(config, model, messages, options = {}) {
    const baseUrl = config.baseUrl?.trim() || defaultChatBaseUrlByApiStyle.deepseek!;
    const body = buildChatCompletionsRequestBody({
      extraBody: buildDeepSeekThinkingRequestOptions(options),
      messages: messages.map((message) => deepseekCompatibleMessage(message, options.thinkingEnabled)),
      model,
      stream: options.stream,
      tools: options.tools
    });

    return {
      body,
      headers: {
        ...(config.apiKey?.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
        "content-type": "application/json",
        ...readAiProviderCustomHeaders(config)
      },
      url: joinApiUrl(baseUrl, "/chat/completions")
    };
  },
  parseResponse: openAiCompatibleAdapter.parseResponse,
  parseStreamEvent: openAiCompatibleAdapter.parseStreamEvent
};

function deepseekCompatibleMessage(message: ChatMessage, thinkingEnabled: boolean | undefined) {
  const mappedMessage = openAiCompatibleMessage(message);
  if (thinkingEnabled !== true || message.role !== "assistant" || !message.thinking?.trim() || !isRecord(mappedMessage)) {
    return mappedMessage;
  }

  return {
    ...mappedMessage,
    reasoning_content: message.thinking
  };
}

const anthropicAdapter: ChatAdapter = {
  buildRequest(config, model, messages, options = {}) {
    const systemMessage = messages.find((message) => message.role === "system");
    const nonSystemMessages = messages.filter((message) => message.role !== "system");
    const tools = buildAnthropicTools(config, model, options.webSearchEnabled, options.tools);
    const body = mergeRequestBody(
      {
        max_tokens: 4096,
        messages: nonSystemMessages.map((message) => ({
          content: anthropicMessageContent(message),
          role: message.role
        })),
        model,
        ...(options.stream ? { stream: true } : {}),
        ...(tools.length ? { tools } : {}),
        ...(systemMessage ? { system: systemMessage.content } : {})
      },
      buildAnthropicThinkingRequestOptions(model, options)
    );

    return {
      body,
      headers: {
        "anthropic-version": anthropicVersion,
        "content-type": "application/json",
        "x-api-key": config.apiKey?.trim() ?? "",
        ...readAiProviderCustomHeaders(config)
      },
      url: joinApiUrl(config.baseUrl?.trim() || defaultChatBaseUrlByApiStyle.anthropic!, "/messages")
    };
  },
  parseResponse(body) {
    const record = isRecord(body) ? body : {};
    const contentBlocks = Array.isArray(record.content) ? record.content : [];
    const content = contentBlocks
      .filter(isRecord)
      .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
      .join("");
    const toolCalls = contentBlocks.flatMap(readAnthropicToolCall);

    return {
      content,
      finishReason: normalizeFinishReason(typeof record.stop_reason === "string" ? record.stop_reason : undefined),
      ...(toolCalls.length ? { toolCalls } : {})
    };
  },
  parseStreamEvent(body) {
    const record = isRecord(body) ? body : {};
    if (record.type === "message_stop") return { done: true };

    if (record.type === "content_block_start") {
      const block = isRecord(record.content_block) ? record.content_block : {};
      const index = typeof record.index === "number" ? record.index : 0;
      if (block.type !== "tool_use") return {};

      return {
        toolCallDeltas: [
          {
            argumentsDelta: typeof block.input === "object" && block.input !== null ? JSON.stringify(block.input) : undefined,
            id: typeof block.id === "string" ? block.id : undefined,
            index,
            nameDelta: typeof block.name === "string" ? block.name : undefined
          }
        ]
      };
    }

    if (record.type === "content_block_delta") {
      const delta = isRecord(record.delta) ? record.delta : {};
      const index = typeof record.index === "number" ? record.index : 0;
      if (delta.type === "thinking_delta") {
        const thinkingDelta = typeof delta.thinking === "string" ? delta.thinking : undefined;
        return thinkingDelta ? { thinkingDelta } : {};
      }

      if (delta.type === "input_json_delta") {
        return {
          toolCallDeltas: [
            {
              argumentsDelta: typeof delta.partial_json === "string" ? delta.partial_json : undefined,
              index
            }
          ]
        };
      }

      const contentDelta = typeof delta.text === "string" ? delta.text : undefined;
      return contentDelta ? { contentDelta } : {};
    }

    if (record.type === "message_delta") {
      const delta = isRecord(record.delta) ? record.delta : {};
      return {
        finishReason: normalizeFinishReason(typeof delta.stop_reason === "string" ? delta.stop_reason : undefined)
      };
    }

    return {};
  }
};

const azureAdapter: ChatAdapter = {
  buildRequest(config, model, messages, options = {}) {
    const baseUrl = config.baseUrl?.trim() || defaultChatBaseUrlByApiStyle["azure-openai"]!;
    if (options.webSearchEnabled === true && getNativeWebSearchKind(config, model) === "azure-openai-responses") {
      return buildResponsesStyleRequest({
        authHeaders: {
          "api-key": config.apiKey?.trim() ?? "",
          "content-type": "application/json",
          ...readAiProviderCustomHeaders(config)
        },
        baseUrl,
        config,
        messages,
        model,
        nativeWebSearchToolType: "web_search",
        options,
        responsePath: "/openai/v1/responses"
      });
    }

    const body = buildChatCompletionsRequestBody({
      extraBody: buildOpenAiCompatibleRequestParts(config, model, options).extraBody,
      messages: messages.map(openAiCompatibleMessage),
      stream: options.stream,
      tools: options.tools
    });

    return {
      body,
      headers: {
        "api-key": config.apiKey?.trim() ?? "",
        "content-type": "application/json",
        ...readAiProviderCustomHeaders(config)
      },
      url: `${joinApiUrl(baseUrl, `/openai/deployments/${encodeURIComponent(model)}/chat/completions`)}?api-version=${azureApiVersion}`
    };
  },
  parseResponse: openAiCompatibleAdapter.parseResponse,
  parseStreamEvent: openAiCompatibleAdapter.parseStreamEvent
};

const googleAdapter: ChatAdapter = {
  buildRequest(config, model, messages, options = {}) {
    const systemMessage = messages.find((message) => message.role === "system");
    const contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        parts: googleMessageParts(message),
        role: message.role === "assistant" ? "model" : "user"
    }));
    const baseUrl = config.baseUrl?.trim() || defaultChatBaseUrlByApiStyle.google!;
    const key = encodeURIComponent(config.apiKey?.trim() ?? "");
    const tools = buildGoogleTools(config, model, options.webSearchEnabled);
    const body = mergeRequestBody(
      {
        contents,
        generationConfig: {
          temperature: 0.7
        },
        ...(tools.length ? { tools } : {}),
        ...(systemMessage ? { systemInstruction: { parts: [{ text: systemMessage.content }] } } : {})
      },
      googleThinkingOptions(options)
    );

    return {
      body,
      headers: { "content-type": "application/json", ...readAiProviderCustomHeaders(config) },
      url: options.stream
        ? `${joinApiUrl(baseUrl, `/models/${encodeURIComponent(model)}:streamGenerateContent`)}?key=${key}&alt=sse`
        : `${joinApiUrl(baseUrl, `/models/${encodeURIComponent(model)}:generateContent`)}?key=${key}`
    };
  },
  parseResponse(body) {
    const record = isRecord(body) ? body : {};
    const candidates = Array.isArray(record.candidates) ? record.candidates : [];
    const candidate = isRecord(candidates[0]) ? candidates[0] : {};
    const content = isRecord(candidate.content) ? candidate.content : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];

    return {
      content: parts
        .filter(isRecord)
        .map((part) => (part.thought === true ? "" : typeof part.text === "string" ? part.text : ""))
        .join("")
    };
  },
  parseStreamEvent(body) {
    const record = isRecord(body) ? body : {};
    const candidates = Array.isArray(record.candidates) ? record.candidates : [];
    const candidate = isRecord(candidates[0]) ? candidates[0] : {};
    const content = isRecord(candidate.content) ? candidate.content : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const { contentDelta, thinkingDelta } = readGoogleTextParts(parts);
    const result: ChatStreamEventResult = {};

    if (contentDelta) result.contentDelta = contentDelta;
    if (thinkingDelta) result.thinkingDelta = thinkingDelta;
    if (typeof candidate.finishReason === "string") result.finishReason = candidate.finishReason;

    return result;
  }
};

function googleThinkingOptions(options: ChatRequestOptions) {
  return options.thinkingEnabled
    ? {
        generationConfig: {
          thinkingConfig: { includeThoughts: true }
        }
      }
    : {};
}

function readGoogleTextParts(parts: unknown[]) {
  let contentDelta = "";
  let thinkingDelta = "";

  for (const part of parts) {
    if (!isRecord(part) || typeof part.text !== "string") continue;

    if (part.thought === true) {
      thinkingDelta += part.text;
    } else {
      contentDelta += part.text;
    }
  }

  return { contentDelta, thinkingDelta };
}

const adapterByApiStyle: Record<AiProviderApiStyle, ChatAdapter> = {
  anthropic: anthropicAdapter,
  "azure-openai": azureAdapter,
  deepseek: deepseekAdapter,
  google: googleAdapter,
  groq: openAiCompatibleAdapter,
  mistral: openAiCompatibleAdapter,
  ollama: openAiCompatibleAdapter,
  openai: openAiCompatibleAdapter,
  "openai-compatible": openAiCompatibleAdapter,
  openrouter: openAiCompatibleAdapter,
  together: openAiCompatibleAdapter,
  xai: openAiCompatibleAdapter
};

export function getChatAdapter(apiStyle: AiProviderApiStyle): ChatAdapter {
  return adapterByApiStyle[apiStyle] ?? openAiCompatibleAdapter;
}

function openAiCompatibleMessage(message: ChatMessage) {
  if (message.toolResult && !message.images?.length) {
    return {
      content: message.toolResult.outputText,
      name: message.toolResult.toolName,
      role: "tool" as const,
      tool_call_id: message.toolResult.toolCallId
    };
  }

  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      content: message.content,
      role: message.role,
      tool_calls: message.toolCalls.map((toolCall) => ({
        function: {
          arguments: JSON.stringify(toolCall.arguments),
          name: toolCall.name
        },
        id: toolCall.id,
        type: "function" as const
      }))
    };
  }

  if (!message.images?.length) {
    return {
      content: message.content,
      role: message.role
    };
  }

  return {
    content: [
      { text: message.content, type: "text" },
      ...message.images.map((image) => ({
        image_url: { url: image.dataUrl },
        type: "image_url"
      }))
    ],
    role: message.role
  };
}

function anthropicMessageContent(message: ChatMessage) {
  if (!message.images?.length) return message.content;

  return [
    { text: message.content, type: "text" },
    ...message.images.map((image) => ({
      source: {
        data: base64DataFromDataUrl(image.dataUrl),
        media_type: image.mimeType,
        type: "base64"
      },
      type: "image"
    }))
  ];
}

function googleMessageParts(message: ChatMessage) {
  return [
    { text: message.content },
    ...(message.images ?? []).map((image) => ({
      inlineData: {
        data: base64DataFromDataUrl(image.dataUrl),
        mimeType: image.mimeType
      }
    }))
  ];
}

function base64DataFromDataUrl(dataUrl: string) {
  const marker = ";base64,";
  const markerIndex = dataUrl.indexOf(marker);
  if (markerIndex < 0) return dataUrl;

  return dataUrl.slice(markerIndex + marker.length);
}

function isOpenAiResponsesBody(body: unknown) {
  return isRecord(body) && (body.object === "response" || Array.isArray(body.output));
}

function parseOpenAiResponsesResponse(body: unknown): ChatResponse {
  const record = isRecord(body) ? body : {};
  const output = Array.isArray(record.output) ? record.output : [];
  const content =
    (typeof record.output_text === "string" && record.output_text.length > 0 ? record.output_text : undefined) ??
    output
      .filter(isRecord)
      .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
      .filter(isRecord)
      .map(readOpenAiResponsesTextPart)
      .join("");
  const toolCalls = output.flatMap(readOpenAiResponsesToolCall);

  return {
    content,
    ...(typeof record.status === "string" ? { finishReason: record.status } : {}),
    ...(toolCalls.length ? { toolCalls } : {})
  };
}

function readOpenAiResponsesToolCall(item: unknown): ChatToolCall[] {
  if (!isRecord(item) || item.type !== "function_call") return [];

  const id = typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : "";
  const name = typeof item.name === "string" ? item.name : "";
  const rawArguments = typeof item.arguments === "string" ? item.arguments : "";
  if (!id || !name) return [];

  return [
    {
      arguments: parseToolArguments(rawArguments),
      id,
      name
    }
  ];
}

function isOpenAiResponsesStreamEvent(body: unknown) {
  return isRecord(body) && typeof body.type === "string" && body.type.startsWith("response.");
}

function parseOpenAiResponsesStreamEvent(body: unknown): ChatStreamEventResult {
  const record = isRecord(body) ? body : {};
  if (record.type === "response.output_text.delta") {
    const contentDelta = typeof record.delta === "string" ? record.delta : undefined;
    return contentDelta ? { contentDelta } : {};
  }
  if (record.type === "response.text.delta") {
    const contentDelta = typeof record.delta === "string" ? record.delta : undefined;
    return contentDelta ? { contentDelta } : {};
  }
  if (record.type === "response.reasoning_summary_text.delta") {
    const thinkingDelta = typeof record.delta === "string" ? record.delta : undefined;
    return thinkingDelta ? { thinkingDelta } : {};
  }
  if (record.type === "response.output_item.added") {
    const item = isRecord(record.item) ? record.item : {};
    if (item.type !== "function_call") return {};

    return {
      toolCallDeltas: [
        {
          id: typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : undefined,
          index: typeof record.output_index === "number" ? record.output_index : 0,
          nameDelta: typeof item.name === "string" ? item.name : undefined
        }
      ]
    };
  }
  if (record.type === "response.function_call_arguments.delta") {
    return {
      toolCallDeltas: [
        {
          argumentsDelta: typeof record.delta === "string" ? record.delta : undefined,
          id: typeof record.call_id === "string" ? record.call_id : undefined,
          index: typeof record.output_index === "number" ? record.output_index : 0
        }
      ]
    };
  }
  if (record.type === "response.function_call_arguments.done") {
    return {
      toolCallDeltas: [
        {
          argumentsDelta: typeof record.arguments === "string" ? record.arguments : undefined,
          id: typeof record.call_id === "string" ? record.call_id : undefined,
          index: typeof record.output_index === "number" ? record.output_index : 0,
          nameDelta: typeof record.name === "string" ? record.name : undefined,
          replaceArguments: true,
          replaceName: true
        }
      ]
    };
  }
  if (record.type === "response.output_item.done") {
    const item = isRecord(record.item) ? record.item : {};
    if (item.type !== "function_call") return {};

    return {
      toolCallDeltas: [
        {
          argumentsDelta: typeof item.arguments === "string" ? item.arguments : undefined,
          id: typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : undefined,
          index: typeof record.output_index === "number" ? record.output_index : 0,
          nameDelta: typeof item.name === "string" ? item.name : undefined,
          replaceArguments: true,
          replaceName: true
        }
      ]
    };
  }
  if (record.type === "response.completed") return { finishReason: "stop" };
  if (record.type === "response.failed") return { finishReason: "error" };

  return {};
}

function readOpenAiResponsesTextPart(item: Record<string, unknown>) {
  if ((item.type === "output_text" || item.type === "text") && typeof item.text === "string") {
    return item.text;
  }

  return "";
}

function parseOpenAiCompatibleStreamEvent(body: unknown): ChatStreamEventResult {
  if (body === "[DONE]") return { done: true };

  const record = isRecord(body) ? body : {};
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = isRecord(choices[0]) ? choices[0] : {};
  const delta = isRecord(firstChoice.delta) ? firstChoice.delta : {};
  const message = isRecord(firstChoice.message) ? firstChoice.message : {};
  const result: ChatStreamEventResult = {};
  const contentDeltas = readOpenAiCompatibleContentDeltas(delta.content ?? message.content);
  const thinkingDelta = readOpenAiCompatibleThinkingDelta(delta) ?? contentDeltas.thinkingDelta;
  const toolCallDeltas = readOpenAiCompatibleToolCallDeltas(delta);

  if (contentDeltas.contentDelta) result.contentDelta = contentDeltas.contentDelta;
  if (thinkingDelta) result.thinkingDelta = thinkingDelta;
  if (toolCallDeltas.length > 0) result.toolCallDeltas = toolCallDeltas;
  if (typeof firstChoice.finish_reason === "string") result.finishReason = normalizeFinishReason(firstChoice.finish_reason);

  return result;
}

function readOpenAiCompatibleThinkingDelta(delta: Record<string, unknown>) {
  const thinkingFields = ["reasoning_content", "reasoning", "reasoning_text"];

  for (const field of thinkingFields) {
    const value = delta[field];
    if (typeof value === "string" && value.length > 0) return value;
  }

  return undefined;
}

function readOpenAiCompatibleContentDeltas(value: unknown) {
  if (typeof value === "string") return { contentDelta: value };
  if (!Array.isArray(value)) return {};

  const contentDelta = value.filter(isRecord).map(readOpenAiCompatibleTextChunk).join("");
  const thinkingDelta = value.filter(isRecord).map(readOpenAiCompatibleThinkingChunk).join("");

  return {
    ...(contentDelta ? { contentDelta } : {}),
    ...(thinkingDelta ? { thinkingDelta } : {})
  };
}

function readOpenAiCompatibleTextChunk(chunk: Record<string, unknown>) {
  if (chunk.type === "thinking" || chunk.type === "reasoning") return "";
  if (typeof chunk.text === "string") return chunk.text;
  if (typeof chunk.content === "string") return chunk.content;

  return "";
}

function readOpenAiCompatibleThinkingChunk(chunk: Record<string, unknown>) {
  if (chunk.type !== "thinking" && chunk.type !== "reasoning") return "";

  return readNestedText(chunk.thinking ?? chunk.reasoning ?? chunk.text ?? chunk.content);
}

function readNestedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";

  return value
    .filter(isRecord)
    .map((item) => readNestedText(item.text ?? item.content ?? item.thinking ?? item.reasoning))
    .join("");
}

function readOpenAiCompatibleToolCalls(message: Record<string, unknown>): ChatToolCall[] {
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

  return toolCalls.flatMap((toolCall) => {
    if (!isRecord(toolCall)) return [];
    const functionPayload = isRecord(toolCall.function) ? toolCall.function : {};
    const id = typeof toolCall.id === "string" ? toolCall.id : "";
    const name = typeof functionPayload.name === "string" ? functionPayload.name : "";
    const rawArguments = typeof functionPayload.arguments === "string" ? functionPayload.arguments : "";
    if (!id || !name) return [];

    return [
      {
        arguments: parseToolArguments(rawArguments),
        id,
        name
      }
    ];
  });
}

function readOpenAiCompatibleToolCallDeltas(delta: Record<string, unknown>): ChatToolCallDelta[] {
  const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];

  return toolCalls.flatMap((toolCall) => {
    if (!isRecord(toolCall)) return [];
    const functionPayload = isRecord(toolCall.function) ? toolCall.function : {};

    return [
      {
        argumentsDelta: typeof functionPayload.arguments === "string" ? functionPayload.arguments : undefined,
        id: typeof toolCall.id === "string" ? toolCall.id : undefined,
        index: typeof toolCall.index === "number" ? toolCall.index : 0,
        nameDelta: typeof functionPayload.name === "string" ? functionPayload.name : undefined
      }
    ];
  });
}

function readAnthropicToolCall(block: unknown): ChatToolCall[] {
  if (!isRecord(block) || block.type !== "tool_use") return [];

  return [
    {
      arguments: isRecord(block.input) ? block.input : {},
      id: typeof block.id === "string" ? block.id : "",
      name: typeof block.name === "string" ? block.name : ""
    }
  ].filter((toolCall) => toolCall.id && toolCall.name);
}

function normalizeFinishReason(finishReason: string | undefined) {
  if (finishReason === "tool_calls" || finishReason === "tool_use") return "toolUse";
  return finishReason;
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
