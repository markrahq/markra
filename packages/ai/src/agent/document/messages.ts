import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ChatImageAttachment, ChatMessage } from "../chat/types";
import type { AiDiffTarget, AiDocumentAnchor, AiHeadingAnchor, AiSelectionContext } from "../inline";
import type { AgentToolResult } from "../read-only-tools";
import { formatSelectionSourceContext } from "../selection";
import type { DocumentAiHistoryMessage, DocumentAiHistoryPreview } from "./types";

export type DocumentToolCallingWebSearchMode = "custom" | "native" | "none";

export function buildDocumentAgentMessages({
  documentContent,
  documentImages,
  history,
  prompt,
  selection,
  sectionAnchors,
  headingAnchors,
  toolResults,
  webSearchMode
}: {
  documentContent: string;
  documentImages: ChatImageAttachment[];
  headingAnchors?: AiHeadingAnchor[];
  history: DocumentAiHistoryMessage[];
  prompt: string;
  sectionAnchors?: AiDocumentAnchor[];
  selection: AiSelectionContext | null;
  toolResults: AgentToolResult[];
  webSearchMode: DocumentToolCallingWebSearchMode;
}): ChatMessage[] {
  return [
    {
      content: buildDocumentAgentSystemPrompt(),
      role: "system"
    },
    ...history.map((message) => ({
      content: formatHistoryMessageText(message),
      role: message.role
    })),
    {
      content: buildDocumentRuntimeContext({
        documentContent,
        headingAnchors,
        sectionAnchors,
        selection,
        toolCallingEnabled: false,
        webSearchMode
      }),
      role: "user"
    },
    {
      content: buildReadOnlyWorkspaceContext(toolResults),
      role: "user"
    },
    {
      content: buildCurrentUserRequest(prompt),
      ...(documentImages.length ? { images: documentImages } : {}),
      role: "user"
    }
  ];
}

export function buildDocumentToolCallingTurnMessages({
  documentContent,
  documentImages,
  prompt,
  selection,
  sectionAnchors,
  headingAnchors,
  webSearchMode
}: {
  documentContent: string;
  documentImages: ChatImageAttachment[];
  headingAnchors?: AiHeadingAnchor[];
  prompt: string;
  sectionAnchors?: AiDocumentAnchor[];
  selection: AiSelectionContext | null;
  webSearchMode: DocumentToolCallingWebSearchMode;
}): AgentMessage[] {
  return [
    createAgentUserMessage(
      buildDocumentRuntimeContext({
        documentContent,
        headingAnchors,
        sectionAnchors,
        selection,
        toolCallingEnabled: true,
        webSearchMode
      })
    ),
    createAgentUserMessage(buildCurrentUserRequest(prompt), documentImages)
  ];
}

export function buildDocumentToolCallingHistoryMessages({
  history,
  model,
  providerId
}: {
  history: DocumentAiHistoryMessage[];
  model: string;
  providerId: string;
}): AgentMessage[] {
  return history
    .map((message): AgentMessage | null => {
      const content = formatHistoryMessageText(message);
      if (!content.trim()) return null;

      if (message.role === "user") {
        return createAgentUserMessage(content);
      }

      return {
        api: "markra-native-chat",
        content: [{ text: content, type: "text" }],
        model,
        provider: providerId,
        role: "assistant",
        stopReason: "stop",
        timestamp: Date.now(),
        usage: emptyAgentUsage()
      };
    })
    .filter((message): message is AgentMessage => message !== null);
}

export function buildDocumentToolCallingSystemPrompt(webSearchMode: DocumentToolCallingWebSearchMode) {
  return [
    "You are Markra AI, a local-first Markdown assistant.",
    "Help the user work with the current Markdown document and nearby workspace notes.",
    "Use only the context and tools available in this turn. Do not claim to have read files, viewed images, searched the web, or changed the document unless a tool result confirms it.",
    "Reply in the user's language unless the user asks for another language.",
    "Be concise, practical, and explicit about what you know. Put user-visible answers in normal assistant text, not only internal thinking.",
    "When the user asks a question, inspect the relevant document or workspace context first if the answer depends on current content.",
    ...documentToolCallingWebSearchInstructions(webSearchMode),
    "When the user asks for a document edit, prefer the write tools instead of only describing the edit.",
    "Work in this order when needed: inspect the current editor context, locate the intended target, apply the narrowest reliable edit, and validate risky structural Markdown changes.",
    "Apply the narrowest reliable edit: use document-level edits for whole-document changes, section-level edits for whole sections, table-level edits for Markdown tables, block-level edits for single blocks or quoted exact text, and insertion points for new content.",
    "Use table-level edits for Markdown tables.",
    "Use move tools for reordering or moving content, and batch edits only for multiple small structured changes.",
    "If there is no active selection, inspect the document structure and choose the most appropriate location. Ask a clarification question only when several plausible targets remain and choosing one would be risky.",
    "When working with images, use available asset tools to inspect the actual image. Do not infer image contents from filenames or alt text alone.",
    "After a successful write tool call, briefly tell the user what changed. If no edit was made, say what you found or why no change was applied."
  ].join("\n");
}

export function assistantTextFromAgentMessage(content: AgentAssistantContent[]) {
  return content
    .map((part) => ("text" in part && part.type === "text" ? part.text : ""))
    .join("");
}

export function assistantThinkingFromAgentMessage(content: AgentAssistantContent[]) {
  return content
    .map((part) => ("thinking" in part && part.type === "thinking" ? part.thinking : ""))
    .join("");
}

function buildDocumentAgentSystemPrompt() {
  return [
    "You are Markra AI, a local-first Markdown writing assistant.",
    "Help with the current document and nearby workspace notes using only the context that is provided in this turn.",
    "Be concise, practical, and explicit about what you know from the provided context.",
    "Reply in the user's language unless the user asks for another language.",
    "If the user asks for a rewrite or edit, provide the revised text first, then add a short explanation only when it helps.",
    "Do not claim to have searched the web or read files that were not included in the provided context."
  ].join("\n");
}

function documentToolCallingWebSearchInstructions(webSearchMode: DocumentToolCallingWebSearchMode) {
  if (webSearchMode === "custom") {
    return [
      "When the user asks for current or external web information and web_search is available, use web_search and cite sources with [1], [2], etc."
    ];
  }
  if (webSearchMode === "native") {
    return [
      "When the user asks for current or external web information, use the provider's native web search capability and cite sources when the provider returns them."
    ];
  }

  return [];
}

function buildCurrentUserRequest(prompt: string) {
  return `User request:\n${prompt.trim()}`;
}

function buildDocumentRuntimeContext({
  documentContent,
  headingAnchors,
  sectionAnchors,
  selection,
  toolCallingEnabled,
  webSearchMode
}: {
  documentContent: string;
  headingAnchors?: AiHeadingAnchor[];
  sectionAnchors?: AiDocumentAnchor[];
  selection: AiSelectionContext | null;
  toolCallingEnabled: boolean;
  webSearchMode: DocumentToolCallingWebSearchMode;
}) {
  const sections = ["Document runtime context:"];

  sections.push(formatSelectionSnapshot({
    documentContent,
    headingAnchors,
    sectionAnchors,
    selection
  }) ?? "There is no active cursor or selection snapshot.");

  sections.push(
    toolCallingEnabled
      ? "Document tools are available. Use them to inspect authoritative document content before editing when the location or scope is ambiguous."
      : "No document write tools are available in this provider path. Use the read-only workspace context and answer with text."
  );

  sections.push(...documentRuntimeWebSearchInstructions({ toolCallingEnabled, webSearchMode }));

  return sections.join("\n\n");
}

function documentRuntimeWebSearchInstructions({
  toolCallingEnabled,
  webSearchMode
}: {
  toolCallingEnabled: boolean;
  webSearchMode: DocumentToolCallingWebSearchMode;
}) {
  if (webSearchMode === "native") {
    return [
      "Native web search is enabled for this request. Use the provider's built-in web search for current or external web information, and cite sources when the provider returns them.",
      "Do not say live browsing is unavailable merely because no local browser tool is listed."
    ];
  }
  if (webSearchMode === "custom") {
    return [
      toolCallingEnabled
        ? "Use web_search for live web information."
        : "Web search was requested, but no live search tool is available on this provider path. Say so briefly and continue with the provided document context."
    ];
  }

  return [];
}

function buildReadOnlyWorkspaceContext(toolResults: AgentToolResult[]) {
  return [
    "Read-only workspace context:",
    ...toolResults.map((result) => [`Tool: ${result.name}`, result.content].join("\n"))
  ].join("\n\n");
}

function createAgentUserMessage(content: string, images: ChatImageAttachment[] = []): AgentMessage {
  return {
    content: images.length
      ? [
          { text: content, type: "text" },
          ...images.map((image) => ({
            data: image.dataUrl,
            mimeType: image.mimeType,
            type: "image" as const
          }))
        ]
      : content,
    role: "user",
    timestamp: Date.now()
  };
}

function formatHistoryMessageText(message: DocumentAiHistoryMessage) {
  const parts = [message.text.trim()];
  const previews = message.previews?.length ? message.previews : (message.preview ? [message.preview] : []);
  previews.forEach((preview) => {
    const previewSummary = formatHistoryPreviewSummary(preview);
    if (previewSummary) parts.push(previewSummary);
  });

  return parts.filter((part) => part.length > 0).join("\n\n");
}

function formatHistoryPreviewSummary(preview: DocumentAiHistoryPreview) {
  const range = preview.from === undefined || preview.to === undefined ? "unknown range" : `${preview.from}-${preview.to}`;
  const target = formatHistoryPreviewTarget(preview.target);

  return [
    "Prepared editor preview:",
    `Type: ${preview.type}`,
    ...(target ? [`Target: ${target}`] : []),
    `Range: ${range}`,
    `Original excerpt: ${formatHistoryPreviewExcerpt(preview.original)}`,
    `Replacement excerpt: ${formatHistoryPreviewExcerpt(preview.replacement)}`
  ].join("\n");
}

function formatHistoryPreviewTarget(target: AiDiffTarget | undefined) {
  if (!target) return null;

  const title = target.title?.trim() || target.id?.trim();
  const label = title ? `${target.kind}: ${title}` : target.kind;
  const range = target.from === undefined || target.to === undefined ? null : `${target.from}-${target.to}`;

  return range ? `${label} (${range})` : label;
}

function formatHistoryPreviewExcerpt(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "(empty)";

  return normalized.length > 240 ? `${normalized.slice(0, 240)}...` : normalized;
}

function emptyAgentUsage() {
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

function formatSelectionSnapshot({
  documentContent,
  headingAnchors,
  sectionAnchors,
  selection
}: {
  documentContent: string;
  headingAnchors?: AiHeadingAnchor[];
  sectionAnchors?: AiDocumentAnchor[];
  selection: AiSelectionContext | null;
}) {
  if (!selection) return null;

  if (!selection.text.trim()) {
    return [
      "Current cursor snapshot:",
      `Cursor: ${selection.cursor ?? selection.from}`,
      `Range: ${selection.from}-${selection.to}`,
      ...formatSelectionSourceContext({ documentContent, headingAnchors, sectionAnchors, selection })
    ].join("\n");
  }

  return [
    "Current selection snapshot:",
    `Range: ${selection.from}-${selection.to}`,
    `Cursor: ${selection.cursor ?? selection.to}`,
    `Source: ${selection.source ?? "selection"}`,
    ...formatSelectionSourceContext({ documentContent, headingAnchors, sectionAnchors, selection }),
    selection.text
  ].join("\n");
}

type AgentAssistantContent =
  | {
      text: string;
      type: "text";
    }
  | {
      thinking: string;
      type: "thinking";
    }
  | {
      arguments: Record<string, unknown>;
      id: string;
      name: string;
      type: "toolCall";
    };
