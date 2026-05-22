import type { AgentEvent } from "@mariozechner/pi-agent-core";
import type { I18nKey } from "@markra/shared";

export type AiAgentProcessKind = "ai_call" | "assistant_message" | "tool_call";
export type AiAgentProcessStatus = "cancelled" | "completed" | "error" | "running";

export type AiAgentProcessItem = {
  detail?: string;
  id: string;
  kind: AiAgentProcessKind;
  label: string;
  rawLabel?: string;
  status: AiAgentProcessStatus;
  turn: number;
};

type Translate = (key: I18nKey) => string;

export function createInitialAgentProcesses(translate: Translate) {
  return [
    {
      id: "call:1",
      kind: "ai_call" as const,
      label: `${translate("app.aiAgentTraceCall")} 1`,
      status: "running" as const,
      turn: 1
    }
  ] satisfies AiAgentProcessItem[];
}

export function applyAgentEventToProcesses(
  currentProcesses: AiAgentProcessItem[],
  event: AgentEvent,
  translate: Translate
): AiAgentProcessItem[] {
  if (event.type === "turn_start") {
    const nextTurn = nextTurnNumber(currentProcesses);
    if (nextTurn === 2 && hasOnlyInitialAiCall(currentProcesses)) return currentProcesses;

    return [
      ...currentProcesses,
      {
        id: `call:${nextTurn}`,
        kind: "ai_call",
        label: `${translate("app.aiAgentTraceCall")} ${nextTurn}`,
        status: "running",
        turn: nextTurn
      }
    ];
  }

  if (event.type === "tool_execution_start") {
    const turn = currentTurnNumber(currentProcesses);
    return upsertProcess(currentProcesses, {
      detail: formatToolArgs(event.args),
      id: `tool:${event.toolCallId}`,
      kind: "tool_call",
      label: toolLabelForToolStart(event, translate),
      rawLabel: event.toolName,
      status: "running",
      turn
    });
  }

  if (event.type === "tool_execution_end") {
    const turn = existingTurnForTool(currentProcesses, event.toolCallId) ?? currentTurnNumber(currentProcesses);
    return upsertProcess(currentProcesses, {
      detail: formatToolResult(event),
      id: `tool:${event.toolCallId}`,
      kind: "tool_call",
      label: toolLabelForToolEnd(event, translate),
      rawLabel: event.toolName,
      status: event.isError ? "error" : "completed",
      turn
    });
  }

  if (event.type === "message_end" && event.message.role === "assistant") {
    const nextProcesses = completeLatestAiCall(currentProcesses, event.message.stopReason, translate);
    const assistantMessage = assistantTextFromMessageContent(event.message.content);
    if (event.message.stopReason !== "toolUse" || !assistantMessage) return nextProcesses;

    return upsertProcess(nextProcesses, {
      id: `assistant:${currentTurnNumber(nextProcesses)}`,
      kind: "assistant_message",
      label: assistantMessage,
      status: "completed",
      turn: currentTurnNumber(nextProcesses)
    });
  }

  if (event.type === "agent_end") {
    return markRunningProcesses(currentProcesses, "completed");
  }

  return currentProcesses;
}

export function finalizeAgentProcesses(
  currentProcesses: AiAgentProcessItem[],
  translate: Translate,
  hasAssistantContent: boolean
) {
  if (!currentProcesses.length && hasAssistantContent) {
    return [
      {
        id: "call:1",
        kind: "ai_call" as const,
        label: `${translate("app.aiAgentTraceCall")} 1`,
        status: "completed" as const,
        turn: 1
      }
    ];
  }

  return markRunningProcesses(currentProcesses, "completed");
}

export function failAgentProcesses(currentProcesses: AiAgentProcessItem[]) {
  return markRunningProcesses(currentProcesses, "error");
}

export function cancelAgentProcesses(currentProcesses: AiAgentProcessItem[]) {
  return markRunningProcesses(currentProcesses, "cancelled");
}

function nextTurnNumber(currentProcesses: AiAgentProcessItem[]) {
  return currentProcesses.filter((process) => process.kind === "ai_call").length + 1;
}

function hasOnlyInitialAiCall(currentProcesses: AiAgentProcessItem[]) {
  return currentProcesses.length === 1 && currentProcesses[0]?.id === "call:1" && currentProcesses[0]?.status === "running";
}

function currentTurnNumber(currentProcesses: AiAgentProcessItem[]) {
  const aiCalls = currentProcesses.filter((process) => process.kind === "ai_call");
  return aiCalls.at(-1)?.turn ?? 1;
}

function existingTurnForTool(currentProcesses: AiAgentProcessItem[], toolCallId: string) {
  return currentProcesses.find((process) => process.id === `tool:${toolCallId}`)?.turn;
}

function upsertProcess(currentProcesses: AiAgentProcessItem[], nextProcess: AiAgentProcessItem) {
  const processIndex = currentProcesses.findIndex((process) => process.id === nextProcess.id);
  if (processIndex < 0) return [...currentProcesses, nextProcess];

  return currentProcesses.map((process, index) =>
    index === processIndex
      ? {
          ...process,
          ...nextProcess,
          detail: nextProcess.detail ?? process.detail,
          rawLabel: nextProcess.rawLabel ?? process.rawLabel
        }
      : process
  );
}

function completeLatestAiCall(currentProcesses: AiAgentProcessItem[], stopReason: string | undefined, translate: Translate) {
  const aiCalls = currentProcesses.filter((process) => process.kind === "ai_call");
  const latestAiCall = [...aiCalls].reverse().find((process) => process.status === "running") ?? aiCalls.at(-1);
  if (!latestAiCall) return currentProcesses;

  return currentProcesses.map((process) =>
    process.id === latestAiCall.id
      ? {
          ...process,
          detail: stopReason === "toolUse" ? translateAiCallDetail(stopReason, process.detail, translate) : process.detail,
          status: "completed" as const
        }
      : process
  );
}

function markRunningProcesses(currentProcesses: AiAgentProcessItem[], status: Exclude<AiAgentProcessStatus, "running">) {
  return currentProcesses.map((process) =>
    process.status === "running"
      ? {
          ...process,
          status
        }
      : process
  );
}

function formatToolArgs(args: unknown) {
  if (!args || typeof args !== "object") return undefined;

  const entries = Object.entries(args as Record<string, unknown>).filter(([, value]) => typeof value === "string");
  if (!entries.length) return undefined;

  const [key, value] = entries[0]!;
  return summarizeValue(`${key}: ${String(value)}`);
}

function formatToolResult(event: Extract<AgentEvent, { type: "tool_execution_end" }>) {
  if (event.isError) return formatToolErrorResult(event.result);
  if (event.toolName === "search_workspace" && typeof event.result?.details?.count === "number") {
    return `${event.result.details.count} files`;
  }
  if (event.toolName === "read_workspace_file" && typeof event.result?.details?.relativePath === "string") {
    const length = typeof event.result.details.length === "number" ? ` · ${event.result.details.length} chars` : "";

    return `${event.result.details.relativePath}${length}`;
  }
  if (event.toolName === "list_assets" && typeof event.result?.details?.count === "number") {
    const unit = event.result.details.count === 1 ? "image" : "images";

    return `${event.result.details.count} ${unit}`;
  }
  if (event.toolName === "view_asset" && typeof event.result?.details?.src === "string") {
    const mimeType = typeof event.result.details.mimeType === "string" ? ` · ${event.result.details.mimeType}` : "";

    return `${event.result.details.src}${mimeType}`;
  }
  if (event.toolName === "web_search" && typeof event.result?.details?.count === "number") {
    const unit = event.result.details.count === 1 ? "source" : "sources";

    return `${event.result.details.count} ${unit}`;
  }
  if (event.toolName === "get_editor_context" && typeof event.result?.details?.documentLength === "number") {
    return `${event.result.details.documentLength} chars`;
  }
  if (event.toolName === "read_document" && typeof event.result?.details?.length === "number") {
    return `${event.result.details.length} chars`;
  }
  if (event.toolName === "inspect_document_structure" && typeof event.result?.details?.anchorCount === "number") {
    return `${event.result.details.anchorCount} anchors`;
  }
  if (event.toolName === "search_document" && typeof event.result?.details?.count === "number") {
    return `${event.result.details.count} matches`;
  }
  if (event.toolName === "validate_edit" && typeof event.result?.details?.issueCount === "number") {
    return `${event.result.details.issueCount} issues`;
  }
  if (event.toolName === "locate_content" && typeof event.result?.details?.anchorId === "string") {
    return formatLocatedAnchorDetail(event.result.details);
  }
  if (
    (
      event.toolName === "replace_content" ||
      event.toolName === "delete_content" ||
      event.toolName === "move_content" ||
      event.toolName === "batch_edit" ||
      event.toolName === "delete_selection"
    ) &&
    typeof event.result?.details?.original === "string"
  ) {
    return formatPreparedWriteDetail(event.result.details);
  }

  return undefined;
}

function formatPreparedWriteDetail(details: { original: string; target?: unknown }) {
  const length = `${details.original.length} chars`;
  const target = formatPreparedWriteTarget(details.target);

  return target ? `${target} · ${length}` : length;
}

function formatPreparedWriteTarget(target: unknown) {
  if (!target || typeof target !== "object") return undefined;

  const targetRecord = target as Record<string, unknown>;
  if (typeof targetRecord.kind !== "string") return undefined;

  const title = typeof targetRecord.title === "string" && targetRecord.title.trim()
    ? targetRecord.title.trim()
    : typeof targetRecord.id === "string" && targetRecord.id.trim()
      ? targetRecord.id.trim()
      : null;

  return title ? `${targetRecord.kind}: ${title}` : targetRecord.kind;
}

function formatToolErrorResult(result: unknown) {
  if (!result || typeof result !== "object") return undefined;

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;

  const firstTextPart = content.find((part) => {
    return typeof part === "object" && part !== null && "type" in part && "text" in part && part.type === "text";
  });
  if (!firstTextPart || typeof firstTextPart !== "object" || !("text" in firstTextPart)) return undefined;

  const text = String(firstTextPart.text).trim();

  return text ? summarizeValue(text) : undefined;
}

function assistantTextFromMessageContent(content: unknown) {
  if (!Array.isArray(content)) return "";

  return content
    .map((part) =>
      typeof part === "object" && part !== null && "type" in part && "text" in part && part.type === "text"
        ? String(part.text)
        : ""
    )
    .join("")
    .trim();
}

function toolLabelForToolStart(event: Extract<AgentEvent, { type: "tool_execution_start" }>, translate: Translate) {
  if (event.toolName === "locate_content") return locateContentLabel((event.args as { targetKind?: unknown } | undefined)?.targetKind, translate);

  return toolLabelForName(event.toolName, translate);
}

function toolLabelForToolEnd(event: Extract<AgentEvent, { type: "tool_execution_end" }>, translate: Translate) {
  if (event.toolName === "locate_content") return locateContentLabel((event.result?.details as { targetKind?: unknown } | undefined)?.targetKind, translate);

  return toolLabelForName(event.toolName, translate);
}

function toolLabelForName(toolName: string, translate: Translate) {
  if (toolName === "get_editor_context") return translate("app.aiAgentProcessReadSelection");
  if (toolName === "read_document") return translate("app.aiAgentProcessReadDocument");
  if (toolName === "inspect_document_structure") return translate("app.aiAgentProcessReadAnchors");
  if (toolName === "search_document") return translate("app.aiAgentProcessLocateRegion");
  if (toolName === "search_workspace") return translate("app.aiAgentProcessListWorkspaceFiles");
  if (toolName === "read_workspace_file") return translate("app.aiAgentProcessReadWorkspaceFile");
  if (toolName === "list_assets") return translate("app.aiAgentProcessListDocumentImages");
  if (toolName === "view_asset") return translate("app.aiAgentProcessReadDocumentImage");
  if (toolName === "web_search") return translate("app.aiAgentProcessWebSearch");
  if (toolName === "replace_content") return translate("app.aiAgentProcessReplaceRegion");
  if (toolName === "replace_selection") return translate("app.aiAgentProcessReplaceSelection");
  if (toolName === "insert_after_selection") return translate("app.aiAgentProcessInsertAfterSelection");
  if (toolName === "insert_content") return translate("app.aiAgentProcessInsertMarkdown");
  if (toolName === "delete_content") return translate("app.aiAgentProcessDeleteRegion");
  if (toolName === "delete_selection") return translate("app.aiAgentProcessDeleteSelection");
  if (toolName === "batch_edit") return translate("app.aiAgentProcessReplaceRegion");

  return translate("app.aiAgentProcessRunTool");
}

function locateContentLabel(targetKind: unknown, translate: Translate) {
  return targetKind === "section"
    ? translate("app.aiAgentProcessLocateSection")
    : translate("app.aiAgentProcessLocateRegion");
}

function formatLocatedAnchorDetail(details: unknown) {
  if (!details || typeof details !== "object") return undefined;

  const locatedDetails = details as {
    anchorId?: unknown;
    candidates?: unknown;
    reason?: unknown;
  };
  if (typeof locatedDetails.anchorId !== "string") return undefined;

  const candidates = Array.isArray(locatedDetails.candidates) ? locatedDetails.candidates : [];
  const selectedCandidate = candidates.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;

    return (candidate as { anchorId?: unknown }).anchorId === locatedDetails.anchorId;
  });
  const selectedDescription =
    selectedCandidate && typeof selectedCandidate === "object"
      ? (selectedCandidate as { description?: unknown }).description
      : undefined;
  const description = typeof selectedDescription === "string" ? selectedDescription : locatedDetails.anchorId;
  const reason = typeof locatedDetails.reason === "string" ? locatedDetails.reason : undefined;

  return summarizeValue(reason ? `${description} · ${reason}` : description);
}

function translateAiCallDetail(stopReason: string, currentDetail: string | undefined, translate: Translate) {
  if (currentDetail && currentDetail !== "toolUse") return currentDetail;
  if (stopReason === "toolUse") return translate("app.aiAgentTraceRequestedTools");

  return currentDetail;
}

function summarizeValue(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 56) return normalized;

  return `${normalized.slice(0, 53)}...`;
}
