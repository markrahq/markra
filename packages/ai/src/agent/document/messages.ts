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
    "Use the available tools in three stages: inspect, locate, then execute.",
    "Inspect the document and current context first, especially when the user asks you to insert or restructure content.",
    "Reply in the user's language unless the user asks for another language.",
    "After tool results return, provide a final user-visible answer with the concrete findings or prepared edit summary.",
    "Do not put the final answer only in thinking. Thinking is for internal reasoning; the user-visible answer must be normal assistant text.",
    "Use get_editor_context for lightweight file path, cursor, selection, document length, and capability metadata; use read_document only when content is needed.",
    "Use inspect_document_structure for headings, sections, blocks, tables, assets, and anchors; use search_document when the user refers to text, titles, or table content.",
    "When the user asks about nearby notes, call search_workspace first, then read_workspace_file for the exact Markdown files you need.",
    "When the user asks about images in the document and image tools are available, call list_assets first, then view_asset for the exact src you need.",
    "Do not guess image contents from alt text or filenames when view_asset is available.",
    ...documentToolCallingWebSearchInstructions(webSearchMode),
    "Use locate_content or inspect_document_structure before writing whenever the edit position is not trivially obvious.",
    "When the user asks to rewrite, compress, clean up, or keep only part of the whole document, use replace_content with targetKind=document.",
    "Use inspect_document_structure and locate_content with targetKind=section when the user asks to rewrite, delete, move, or regenerate an entire section.",
    "When the request targets a whole section, prefer replace_content or delete_content with a section anchor instead of block-level edits.",
    "When the request targets a Markdown table, locate the table anchor and prefer replace_content with targetKind=table instead of replacing a heading, cell, or nearby block; pass headingTitle when the user identifies the table by section heading.",
    "When the request targets exactly one paragraph, heading, list item, or non-table block, prefer replace_content with targetKind=block instead of guessing a character range; pass originalText when the user quotes the exact text to change.",
    "When the user asks for a document edit, prefer the write tools instead of only describing the edit.",
    "Use move_content for move, reorder, put-before, put-after, or rearrange requests; do not use replace_content with targetKind=document to simulate a move.",
    "Use batch_edit only for multiple small structured operations; never pass an entire rewritten document to batch_edit.",
    "Use validate_edit when a structural Markdown self-check would reduce risk, especially after table, link, heading, or frontmatter edits.",
    "Prefer replace_content for replacement, insert_content for insertion, delete_content for deletion, move_content for reordering, and batch_edit for coordinated small edits.",
    "Choose the edit location intentionally: insert_content can use the current context or a resolved anchor. Do not ask the user to place the cursor unless no viable anchor can be resolved from the document.",
    "When the target location is ambiguous, inspect the document structure, choose the most semantically appropriate anchor or section, and then execute the edit there.",
    "When there is no active selection, do not stop at that limitation. Inspect the document structure and decide an appropriate location yourself.",
    "When preparing block-level Markdown such as headings, lists, tables, or multi-paragraph sections, pass clean Markdown to the write tool and choose an insertion/replacement location that preserves document structure.",
    "After a write tool succeeds, briefly tell the user what was prepared and what changed.",
    "Do not claim to have searched the web or read files that were not available through tools."
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
