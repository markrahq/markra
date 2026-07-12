import type {
  AssistantMessage,
  Context,
  ImageContent,
  Message,
  Model,
  StopReason,
  TextContent,
  ThinkingContent,
  ToolCall
} from "@earendil-works/pi-ai";

import type { ChatMessage } from "../chat/types";
import type { AssistantContentBlock } from "./types";

export function messagesFromPiContext(context: Context): ChatMessage[] {
  return [
    ...(context.systemPrompt ? [{ content: context.systemPrompt, role: "system" as const }] : []),
    ...context.messages.flatMap(chatMessageFromPiMessage)
  ];
}

function chatMessageFromPiMessage(message: Message): ChatMessage[] {
  if (message.role === "user") {
    return [chatMessageFromPiUserMessage(message.content)];
  }

  if (message.role === "assistant") {
    const thinkingBlocks = message.content.filter((part): part is ThinkingContent => part.type === "thinking");
    const thinking = thinkingBlocks.map((part) => part.thinking).join("");
    const thinkingSignature = thinkingBlocks.find((part) => part.thinkingSignature)?.thinkingSignature;
    const toolCalls = message.content
      .filter((part): part is ToolCall => part.type === "toolCall")
      .map((toolCall) => ({
        arguments: structuredClone(toolCall.arguments),
        id: toolCall.id,
        name: toolCall.name,
        ...(toolCall.thoughtSignature ? { thoughtSignature: toolCall.thoughtSignature } : {})
      }));

    return [{
      content: assistantTextContent(message),
      role: "assistant",
      ...(thinking ? { thinking } : {}),
      ...(thinkingBlocks.length
        ? {
            thinkingBlocks: thinkingBlocks.map((part) => ({
              ...(part.redacted !== undefined ? { redacted: part.redacted } : {}),
              thinking: part.thinking,
              ...(part.thinkingSignature ? { thinkingSignature: part.thinkingSignature } : {})
            }))
          }
        : {}),
      ...(thinkingBlocks.length ? { thinkingRedacted: thinkingBlocks.some((part) => part.redacted === true) } : {}),
      ...(thinkingSignature ? { thinkingSignature } : {}),
      ...(toolCalls.length ? { toolCalls } : {})
    }];
  }

  return [chatMessageFromPiToolResultMessage(message)];
}

function chatMessageFromPiUserMessage(content: string | (TextContent | ImageContent)[]): ChatMessage {
  if (typeof content === "string") return { content, role: "user" };

  const { images, text } = chatContentFromPiContent(content);

  return {
    content: text,
    ...(images.length ? { images } : {}),
    role: "user"
  };
}

function chatMessageFromPiToolResultMessage(message: Extract<Message, { role: "toolResult" }>): ChatMessage {
  const { images, text } = chatContentFromPiContent(message.content);

  return {
    content: [`Tool result from ${message.toolName}:`, text].filter((part) => part.length > 0).join("\n"),
    ...(images.length ? { images } : {}),
    role: "user",
    toolResult: {
      outputText: text,
      toolCallId: message.toolCallId,
      toolName: message.toolName
    }
  };
}

function chatContentFromPiContent(content: (TextContent | ImageContent)[]) {
  return {
    images: content
      .filter((part): part is ImageContent => part.type === "image")
      .map((part) => ({
        dataUrl: imageDataUrlFromPiImage(part),
        mimeType: part.mimeType
      })),
    text: content.map((part) => (part.type === "text" ? part.text : "")).filter(Boolean).join("\n")
  };
}

function imageDataUrlFromPiImage(image: ImageContent) {
  if (image.data.startsWith("data:")) return image.data;

  return `data:${image.mimeType};base64,${image.data}`;
}

export function assistantTextContent(message: AssistantMessage) {
  return message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

export function createAssistantMessage(
  model: Model<any>,
  content: string | AssistantContentBlock[] = "",
  stopReason: StopReason = "stop"
): AssistantMessage {
  return {
    api: model.api,
    content: typeof content === "string"
      ? content ? [{ text: content, type: "text" }] : []
      : cloneAssistantContent(content),
    model: model.id,
    provider: model.provider,
    role: "assistant",
    stopReason,
    timestamp: Date.now(),
    usage: emptyUsage()
  };
}

function cloneAssistantContent(content: AssistantContentBlock[]): AssistantContentBlock[] {
  return content.map((block) => {
    return block.type === "toolCall" ? { ...block, arguments: structuredClone(block.arguments) } : { ...block };
  });
}

function emptyUsage() {
  return {
    cacheRead: 0,
    cacheWrite: 0,
    cost: {
      cacheRead: 0,
      cacheWrite: 0,
      input: 0,
      output: 0,
      total: 0
    },
    input: 0,
    output: 0,
    totalTokens: 0
  };
}

export function stopReasonFromFinishReason(reason: string | undefined): StopReason {
  if (reason === "length") return "length";
  if (reason === "toolUse") return "toolUse";
  if (reason === "error") return "error";
  if (reason === "aborted") return "aborted";

  return "stop";
}
