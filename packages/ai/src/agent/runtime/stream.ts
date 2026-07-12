import { type StreamFn } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type Context,
  type Model,
  type ThinkingContent,
  type TextContent,
  type ToolCall
} from "@earendil-works/pi-ai";

import type { AiProviderConfig } from "@markra/providers";
import { createAssistantMessage, messagesFromPiContext, stopReasonFromFinishReason } from "./messages";
import type { AssistantContentBlock, InlineAiAgentComplete } from "./types";

export function createNativeChatStreamFn(
  provider: AiProviderConfig,
  complete: InlineAiAgentComplete,
  thinkingEnabled: boolean | undefined,
  webSearchEnabled = false
): StreamFn {
  let localToolCallCounter = 0;

  return (model, context, options) => {
    const stream = createAssistantMessageEventStream();
    streamNativeChatCompletion({
      complete,
      context,
      model,
      nextLocalToolCallId: () => `tool-call-${++localToolCallCounter}`,
      options,
      provider,
      stream,
      thinkingEnabled,
      webSearchEnabled
    }).catch((error) => {
      pushAssistantError(stream, model, error, options?.signal);
    });
    return stream;
  };
}

async function streamNativeChatCompletion({
  complete,
  context,
  model,
  options,
  provider,
  stream,
  thinkingEnabled,
  webSearchEnabled,
  nextLocalToolCallId
}: {
  complete: InlineAiAgentComplete;
  context: Context;
  model: Model<any>;
  nextLocalToolCallId: () => string;
  options?: { signal?: AbortSignal };
  provider: AiProviderConfig;
  stream: ReturnType<typeof createAssistantMessageEventStream>;
  thinkingEnabled: boolean | undefined;
  webSearchEnabled: boolean;
}) {
  if (options?.signal?.aborted) {
    pushAssistantError(stream, model, new Error("Request aborted by user."), options.signal);
    return;
  }

  const contentBlocks: AssistantContentBlock[] = [];
  const thinkingBlocksById = new Map<string, ThinkingContent>();
  const toolCallBlocks = new Map<number, ToolCall>();
  const toolCallArgumentBuffers = new Map<number, string>();
  const ignoredToolCallIndexes = new Set<number>();
  const openToolCallIndexes = new Set<number>();
  let currentBlock: AssistantContentBlock | null = null;
  const partial = createAssistantMessage(model);
  let streamedContent = "";
  stream.push({ partial, type: "start" });
  const localToolNames = new Set((context.tools ?? []).map((tool) => tool.name));
  const shouldIgnoreToolCall = (name: string) => {
    return webSearchEnabled && !localToolNames.has(name);
  };

  const finishCurrentBlock = () => {
    if (!currentBlock) return;

    const contentIndex = contentBlocks.indexOf(currentBlock);
    const partialMessage = createAssistantMessage(model, contentBlocks);
    if (currentBlock.type === "text") {
      stream.push({
        content: currentBlock.text,
        contentIndex,
        partial: partialMessage,
        type: "text_end"
      });
    } else if (currentBlock.type === "thinking") {
      stream.push({
        content: currentBlock.thinking,
        contentIndex,
        partial: partialMessage,
        type: "thinking_end"
      });
    }
    currentBlock = null;
  };
  const ensureTextBlock = () => {
    if (currentBlock?.type === "text") return currentBlock;

    finishCurrentBlock();
    const block: TextContent = { text: "", type: "text" };
    currentBlock = block;
    contentBlocks.push(block);
    stream.push({
      contentIndex: contentBlocks.length - 1,
      partial: createAssistantMessage(model, contentBlocks),
      type: "text_start"
    });

    return block;
  };
  const ensureThinkingBlock = (blockId?: string) => {
    const existingBlock = blockId ? thinkingBlocksById.get(blockId) : undefined;
    if (existingBlock) {
      if (currentBlock !== existingBlock) {
        finishCurrentBlock();
        currentBlock = existingBlock;
      }

      return existingBlock;
    }
    if (!blockId && currentBlock?.type === "thinking") return currentBlock;

    finishCurrentBlock();
    const block: ThinkingContent = { thinking: "", type: "thinking" };
    currentBlock = block;
    contentBlocks.push(block);
    if (blockId) thinkingBlocksById.set(blockId, block);
    stream.push({
      contentIndex: contentBlocks.length - 1,
      partial: createAssistantMessage(model, contentBlocks),
      type: "thinking_start"
    });

    return block;
  };
  const ensureToolCallBlock = (index: number) => {
    finishCurrentBlock();
    const existingBlock = toolCallBlocks.get(index);
    if (existingBlock) return existingBlock;

    const localToolCallId = nextLocalToolCallId();
    const block: ToolCall = {
      arguments: {},
      id: localToolCallId,
      name: "",
      type: "toolCall"
    };
    toolCallBlocks.set(index, block);
    contentBlocks.push(block);
    openToolCallIndexes.add(index);
    stream.push({
      contentIndex: contentBlocks.length - 1,
      partial: createAssistantMessage(model, contentBlocks),
      type: "toolcall_start"
    });

    return block;
  };
  const discardToolCallBlock = (index: number) => {
    const block = toolCallBlocks.get(index);
    if (block) {
      const contentIndex = contentBlocks.indexOf(block);
      if (contentIndex >= 0) contentBlocks.splice(contentIndex, 1);
      if (currentBlock === block) currentBlock = null;
    }
    ignoredToolCallIndexes.add(index);
    openToolCallIndexes.delete(index);
    toolCallArgumentBuffers.delete(index);
    toolCallBlocks.delete(index);
  };
  const finishToolCallBlocks = () => {
    for (const index of [...openToolCallIndexes].sort((left, right) => left - right)) {
      const block = toolCallBlocks.get(index);
      if (!block) continue;

      block.arguments = parseToolCallArguments(toolCallArgumentBuffers.get(index) ?? "");
      stream.push({
        contentIndex: contentBlocks.indexOf(block),
        partial: createAssistantMessage(model, contentBlocks),
        toolCall: { ...block, arguments: structuredClone(block.arguments) },
        type: "toolcall_end"
      });
      openToolCallIndexes.delete(index);
    }
  };

  const response = await complete(provider, model.id, messagesFromPiContext(context), {
    onDelta: (delta) => {
      streamedContent += delta;
      const textBlock = ensureTextBlock();
      textBlock.text += delta;
      stream.push({
        contentIndex: contentBlocks.indexOf(textBlock),
        delta,
        partial: createAssistantMessage(model, contentBlocks),
        type: "text_delta"
      });
    },
    onThinkingDelta: (delta) => {
      const thinkingBlock = ensureThinkingBlock();
      thinkingBlock.thinking += delta;
      stream.push({
        contentIndex: contentBlocks.indexOf(thinkingBlock),
        delta,
        partial: createAssistantMessage(model, contentBlocks),
        type: "thinking_delta"
      });
    },
    onThinkingMetadata: (metadata) => {
      const thinkingBlock = ensureThinkingBlock(metadata.blockId);
      if (metadata.signature) thinkingBlock.thinkingSignature = metadata.signature;
      if (metadata.redacted !== undefined) thinkingBlock.redacted = metadata.redacted;
      if (metadata.phase === "end" && currentBlock === thinkingBlock) finishCurrentBlock();
    },
    onToolCallDelta: (delta) => {
      if (ignoredToolCallIndexes.has(delta.index)) return;

      const existingToolCall = toolCallBlocks.get(delta.index);
      const nextToolCallName = delta.replaceName
        ? (delta.nameDelta ?? "")
        : `${existingToolCall?.name ?? ""}${delta.nameDelta ?? ""}`;
      if (nextToolCallName && shouldIgnoreToolCall(nextToolCallName)) {
        discardToolCallBlock(delta.index);
        return;
      }

      const toolCallBlock = ensureToolCallBlock(delta.index);
      if (delta.id) {
        toolCallBlock.id = combineToolCallIds(delta.id, localToolCallIdFromCombined(toolCallBlock.id));
      }
      if (delta.nameDelta) {
        toolCallBlock.name = delta.replaceName ? delta.nameDelta : `${toolCallBlock.name}${delta.nameDelta}`;
      }
      if (delta.argumentsDelta) {
        toolCallArgumentBuffers.set(
          delta.index,
          delta.replaceArguments ? delta.argumentsDelta : `${toolCallArgumentBuffers.get(delta.index) ?? ""}${delta.argumentsDelta}`
        );
      }

      const parsedArguments = parseToolCallArguments(toolCallArgumentBuffers.get(delta.index) ?? "");
      toolCallBlock.arguments = parsedArguments;
      stream.push({
        contentIndex: contentBlocks.indexOf(toolCallBlock),
        delta: delta.argumentsDelta ?? delta.nameDelta ?? "",
        partial: createAssistantMessage(model, contentBlocks),
        type: "toolcall_delta"
      });
    },
    thinkingEnabled,
    tools: context.tools,
    webSearchEnabled
  });
  if (options?.signal?.aborted) {
    pushAssistantError(stream, model, new Error("Request aborted by user."), options.signal);
    return;
  }

  if (response.toolCalls?.length) {
    for (const [index, toolCall] of response.toolCalls.entries()) {
      if (shouldIgnoreToolCall(toolCall.name)) continue;

      const block = ensureToolCallBlock(index);
      block.id = combineToolCallIds(toolCall.id, localToolCallIdFromCombined(block.id));
      block.name = toolCall.name;
      block.arguments = structuredClone(toolCall.arguments);
      if (toolCall.thoughtSignature) block.thoughtSignature = toolCall.thoughtSignature;
      toolCallArgumentBuffers.set(index, JSON.stringify(toolCall.arguments));
    }
  }
  finishToolCallBlocks();

  const finalContent = response.content || streamedContent;
  if (!streamedContent && finalContent) {
    const textBlock = ensureTextBlock();
    textBlock.text += finalContent;
    stream.push({
      contentIndex: contentBlocks.indexOf(textBlock),
      delta: finalContent,
      partial: createAssistantMessage(model, contentBlocks),
      type: "text_delta"
    });
  }
  finishCurrentBlock();
  const finalStopReason = stopReasonFromFinishReason(
    response.finishReason ?? (response.toolCalls?.length ? "toolUse" : undefined)
  );
  const finalMessage = createAssistantMessage(model, contentBlocks, finalStopReason);
  stream.push({
    message: finalMessage,
    reason:
      finalMessage.stopReason === "toolUse"
        ? "toolUse"
        : finalMessage.stopReason === "length"
          ? "length"
          : "stop",
    type: "done"
  });
}

function combineToolCallIds(providerToolCallId: string, localToolCallId: string) {
  return providerToolCallId ? `${providerToolCallId}|${localToolCallId}` : localToolCallId;
}

function localToolCallIdFromCombined(toolCallId: string) {
  const [, localToolCallId] = toolCallId.split("|");
  return localToolCallId ?? toolCallId;
}

function pushAssistantError(
  stream: ReturnType<typeof createAssistantMessageEventStream>,
  model: Model<any>,
  error: unknown,
  signal: AbortSignal | undefined
) {
  const reason = signal?.aborted ? "aborted" : "error";
  const message = createAssistantMessage(model, "", reason);
  message.errorMessage = error instanceof Error ? error.message : String(error);
  stream.push({
    error: message,
    reason,
    type: "error"
  });
}

function parseToolCallArguments(rawArguments: string) {
  if (!rawArguments.trim()) return {};

  try {
    const parsed = JSON.parse(rawArguments) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
