import { Agent } from "@mariozechner/pi-agent-core";
import { getProviderCapabilities, providerSupportsNativeWebSearch, type AiProviderConfig } from "@markra/providers";
import { createNativeChatStreamFn, createPiAgentModel } from "./runtime";
import { chatCompletionStream } from "./chat-completion";
import { runReadOnlyAgentTools } from "./read-only-tools";
import type { ChatImageAttachment } from "./chat/types";
import { createDocumentAgentTools } from "./document-tools";
import { readPromptedDocumentImages } from "./document/images";
import {
  assistantTextFromAgentMessage,
  assistantThinkingFromAgentMessage,
  buildDocumentAgentMessages,
  buildDocumentToolCallingHistoryMessages,
  buildDocumentToolCallingSystemPrompt,
  buildDocumentToolCallingTurnMessages
} from "./document/messages";
import { modelSupportsTools, modelSupportsVision } from "./document/models";
import type { RunDocumentAiAgentInput, RunDocumentAiAgentResult } from "./document/types";
import { webSearchSettingsAreUsable } from "./tools/web-search";
export type * from "./document/types";

export async function runDocumentAiAgent({
  complete = chatCompletionStream,
  documentContent,
  documentEndPosition = 0,
  documentPath,
  history = [],
  headingAnchors = [],
  model,
  onEvent,
  onPreviewResult,
  onTextDelta,
  onThinkingDelta,
  prompt,
  provider,
  readDocumentImage,
  readWorkspaceFile,
  sectionAnchors,
  selection = null,
  tableAnchors,
  thinkingEnabled,
  webSearchEnabled = false,
  webSearchSettings = null,
  webSearchTransport,
  workspaceFiles = []
}: RunDocumentAiAgentInput): Promise<RunDocumentAiAgentResult> {
  const capabilities = getProviderCapabilities(provider.id, provider.type);
  if (capabilities.toolCalling && supportsDocumentToolCalling(provider.type) && modelSupportsTools(provider, model)) {
    return runDocumentToolCallingAgent({
      complete,
      documentContent,
      documentEndPosition,
      documentPath,
      headingAnchors,
      history,
      model,
      onEvent,
      onPreviewResult,
      onTextDelta,
      onThinkingDelta,
      prompt,
      provider,
      readDocumentImage: modelSupportsVision(provider, model) ? readDocumentImage : undefined,
      readWorkspaceFile,
      sectionAnchors,
      selection,
      tableAnchors,
      thinkingEnabled,
      webSearchEnabled,
      webSearchSettings,
      webSearchTransport,
      workspaceFiles
    });
  }

  const documentImages = await readPromptedDocumentImages({
    complete,
    documentContent,
    model,
    prompt,
    provider,
    readDocumentImage
  });
  return runDocumentChatOnlyAgent({
    complete,
    documentContent,
    documentPath,
    documentImages,
    history,
    model,
    onTextDelta,
    onThinkingDelta,
    prompt,
    provider,
    selection,
    thinkingEnabled,
    webSearchEnabled,
    webSearchSettings,
    webSearchTransport,
    workspaceFiles
  });
}

type RunDocumentAiAgentRuntimeInput = RunDocumentAiAgentInput & {
  documentImages?: ChatImageAttachment[];
};

async function runDocumentChatOnlyAgent({
  complete = chatCompletionStream,
  documentContent,
  documentPath,
  documentImages = [],
  headingAnchors = [],
  history = [],
  model,
  onTextDelta,
  onThinkingDelta,
  prompt,
  provider,
  sectionAnchors,
  selection = null,
  thinkingEnabled,
  webSearchEnabled = false,
  webSearchSettings = null,
  webSearchTransport,
  workspaceFiles = []
}: RunDocumentAiAgentRuntimeInput): Promise<RunDocumentAiAgentResult> {
  const toolResults = await runReadOnlyAgentTools({
    documentContent,
    documentPath,
    workspaceFiles
  });
  const nativeWebSearchEnabled = webSearchEnabled && providerSupportsNativeWebSearch(provider, model);
  const messages = buildDocumentAgentMessages({
    documentContent,
    documentImages,
    headingAnchors,
    history,
    prompt,
    sectionAnchors,
    selection,
    toolResults,
    webSearchMode: nativeWebSearchEnabled ? "native" : "none"
  });
  let streamedContent = "";
  let streamedThinking = "";
  const response = await complete(provider, model, messages, {
    onDelta: (delta) => {
      streamedContent += delta;
      onTextDelta?.(streamedContent);
    },
    onThinkingDelta: (delta) => {
      streamedThinking += delta;
      onThinkingDelta?.(streamedThinking);
    },
    thinkingEnabled,
    webSearchEnabled: nativeWebSearchEnabled
  });

  return {
    content: (response.content || streamedContent).trim(),
    finishReason: response.finishReason
  };
}

function supportsDocumentToolCalling(
  providerType: AiProviderConfig["type"]
) {
  return [
    "anthropic",
    "azure-openai",
    "deepseek",
    "groq",
    "mistral",
    "openai",
    "openai-compatible",
    "openrouter",
    "together",
    "xai"
  ].includes(providerType);
}

async function runDocumentToolCallingAgent({
  complete = chatCompletionStream,
  documentContent,
  documentEndPosition = 0,
  documentPath,
  history = [],
  headingAnchors = [],
  model,
  onEvent,
  onPreviewResult,
  onTextDelta,
  onThinkingDelta,
  prompt,
  provider,
  readDocumentImage,
  readWorkspaceFile,
  sectionAnchors,
  selection = null,
  tableAnchors,
  thinkingEnabled,
  webSearchEnabled = false,
  webSearchSettings = null,
  webSearchTransport,
  workspaceFiles = []
}: RunDocumentAiAgentRuntimeInput): Promise<RunDocumentAiAgentResult> {
  let preparedPreview = false;
  const piAgentModel = createPiAgentModel(provider, model);
  const nativeWebSearchEnabled = webSearchEnabled && providerSupportsNativeWebSearch(provider, model);
  const activeWebSearchSettings =
    webSearchEnabled && !nativeWebSearchEnabled && webSearchSettingsAreUsable(webSearchSettings) ? webSearchSettings : null;
  const agent = new Agent({
    initialState: {
      messages: buildDocumentToolCallingHistoryMessages({ history, model, providerId: provider.id }),
      model: piAgentModel,
      systemPrompt: buildDocumentToolCallingSystemPrompt(
        nativeWebSearchEnabled ? "native" : activeWebSearchSettings ? "custom" : "none"
      ),
      tools: createDocumentAgentTools({
        documentContent,
        documentEndPosition,
        documentPath,
        headingAnchors,
        onPreviewResult: (result, previewId) => {
          preparedPreview = true;
          onPreviewResult?.(result, previewId);
        },
        readDocumentImage,
        readWorkspaceFile,
        sectionAnchors,
        selection,
        tableAnchors,
        webSearch: activeWebSearchSettings ? { settings: activeWebSearchSettings, transport: webSearchTransport } : undefined,
        workspaceFiles
      })
    },
    streamFn: createNativeChatStreamFn(provider, complete, thinkingEnabled, nativeWebSearchEnabled)
  });
  let finalContent = "";
  let finishReason: string | undefined;
  let latestAssistantText = "";

  agent.subscribe((event) => {
    onEvent?.(event);

    if (event.type === "message_update" && event.message.role === "assistant") {
      const nextText = assistantTextFromAgentMessage(event.message.content);
      if (nextText) {
        latestAssistantText = nextText;
        onTextDelta?.(nextText);
      }

      const nextThinking = assistantThinkingFromAgentMessage(event.message.content);
      if (nextThinking) onThinkingDelta?.(nextThinking);
    }

    if (event.type !== "message_end" || event.message.role !== "assistant") return;

    finalContent = assistantTextFromAgentMessage(event.message.content);
    if (finalContent.trim()) latestAssistantText = finalContent;
    finishReason = event.message.stopReason;
  });

  await agent.prompt(buildDocumentToolCallingTurnMessages({
    documentContent,
    documentImages: [],
    headingAnchors,
    prompt,
    sectionAnchors,
    selection,
    webSearchMode: nativeWebSearchEnabled ? "native" : activeWebSearchSettings ? "custom" : "none"
  }));

  return {
    content: preparedPreview ? "" : (finalContent || latestAssistantText).trim(),
    finishReason,
    preparedPreview
  };
}
