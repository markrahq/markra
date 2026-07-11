import { cancelAgentProcesses, type AiAgentProcessItem, type AiAgentProcessKind, type AiAgentProcessStatus } from "./process-trace";
import type { AiDiffTarget } from "./inline";
import { clampNumber, isRecord } from "@markra/shared";

export type AiAgentSessionAttachment = {
  height: number;
  id: string;
  mimeType: "image/gif" | "image/jpeg" | "image/png" | "image/webp";
  name: string;
  size: number;
  width: number;
};

export type AiAgentSessionMessage = {
  activities?: AiAgentProcessItem[];
  attachments?: AiAgentSessionAttachment[];
  id: number;
  isError?: boolean;
  preview?: AiAgentSessionPreview;
  previews?: AiAgentSessionPreview[];
  role: "assistant" | "user";
  text: string;
  thinking?: string;
  thinkingTurns?: string[];
};

export type AiAgentSessionPreview = {
  from?: number;
  original: string;
  replacement: string;
  target?: AiDiffTarget;
  to?: number;
  type: "insert" | "replace";
};

export type StoredAiAgentSessionState = {
  agentModelId: string | null;
  agentProviderId: string | null;
  draft: string;
  messages: AiAgentSessionMessage[];
  panelOpen: boolean;
  panelWidth: number | null;
  thinkingEnabled: boolean;
  webSearchEnabled: boolean;
};

export type StoredAiAgentSessionSummary = {
  archivedAt: number | null;
  createdAt: number;
  id: string;
  messageCount: number;
  title: string | null;
  titleSource: "ai" | "fallback" | "manual" | null;
  updatedAt: number;
  workspaceKey: string;
};

const storedPanelWidthMin = 320;
const storedPanelWidthMax = 760;
const untitledWorkspaceKey = "__untitled__";
const maxSessionMessageAttachmentCount = 4;
const sessionAttachmentIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const sessionAttachmentMimeTypes = new Set<AiAgentSessionAttachment["mimeType"]>([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export function createDefaultAiAgentSessionState(
  overrides: Partial<
    Pick<StoredAiAgentSessionState, "agentModelId" | "agentProviderId" | "thinkingEnabled" | "webSearchEnabled">
  > = {}
): StoredAiAgentSessionState {
  return {
    agentModelId: normalizeSessionIdentifier(overrides.agentModelId),
    agentProviderId: normalizeSessionIdentifier(overrides.agentProviderId),
    draft: "",
    messages: [],
    panelOpen: false,
    panelWidth: null,
    thinkingEnabled: overrides.thinkingEnabled ?? false,
    webSearchEnabled: overrides.webSearchEnabled ?? false
  };
}

export function normalizeStoredAiAgentSessionState(value: unknown): StoredAiAgentSessionState {
  if (!isRecord(value)) return createDefaultAiAgentSessionState();

  return {
    agentModelId: normalizeSessionIdentifier(value.agentModelId),
    agentProviderId: normalizeSessionIdentifier(value.agentProviderId),
    draft: typeof value.draft === "string" ? value.draft : "",
    messages: Array.isArray(value.messages)
      ? value.messages.map(normalizeSessionMessage).filter((message): message is AiAgentSessionMessage => message !== null)
      : [],
    panelOpen: value.panelOpen === true,
    panelWidth: clampNumber(value.panelWidth, storedPanelWidthMin, storedPanelWidthMax),
    thinkingEnabled: value.thinkingEnabled === true,
    webSearchEnabled: value.webSearchEnabled === true
  };
}

function normalizeSessionIdentifier(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function createAiAgentSessionTitle(session: StoredAiAgentSessionState) {
  const firstUserText = session.messages.find((message) => message.role === "user" && message.text.trim())?.text;
  const titleSource = firstUserText
    ? firstUserText
    : session.messages.some((message) => message.role === "user" && message.attachments?.length)
      ? "Image conversation"
      : session.messages.find((message) => message.role === "assistant" && message.text.trim())?.text ??
        session.draft;

  return normalizeAiAgentSessionTitle(titleSource);
}

export function normalizeAiAgentSessionTitle(value: unknown) {
  if (typeof value !== "string") return null;

  const singleLineTitle = value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!singleLineTitle) return null;

  const normalizedTitle = singleLineTitle
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalizedTitle.length > 0 ? normalizedTitle.slice(0, 72) : null;
}

export function normalizeAiAgentWorkspaceKey(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : untitledWorkspaceKey;
}

export function normalizeStoredAiAgentSessionSummary(value: unknown): StoredAiAgentSessionSummary | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.trim().length === 0) return null;
  if (typeof value.createdAt !== "number" || Number.isNaN(value.createdAt)) return null;
  if (typeof value.updatedAt !== "number" || Number.isNaN(value.updatedAt)) return null;

  return {
    archivedAt: typeof value.archivedAt === "number" && !Number.isNaN(value.archivedAt) ? value.archivedAt : null,
    createdAt: value.createdAt,
    id: value.id,
    messageCount: typeof value.messageCount === "number" && value.messageCount >= 0 ? Math.floor(value.messageCount) : 0,
    title: normalizeAiAgentSessionTitle(value.title),
    titleSource:
      value.titleSource === "ai" || value.titleSource === "fallback" || value.titleSource === "manual"
        ? value.titleSource
        : normalizeAiAgentSessionTitle(value.title)
          ? "fallback"
          : null,
    updatedAt: value.updatedAt,
    workspaceKey: normalizeAiAgentWorkspaceKey(value.workspaceKey)
  };
}

export function normalizeStoredAiAgentSessionSummaries(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeStoredAiAgentSessionSummary)
    .filter((summary): summary is StoredAiAgentSessionSummary => summary !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function normalizeSessionMessage(value: unknown): AiAgentSessionMessage | null {
  if (!isRecord(value) || typeof value.id !== "number") return null;
  if (value.role !== "assistant" && value.role !== "user") return null;
  if (typeof value.text !== "string") return null;

  const activities = Array.isArray(value.activities)
    ? value.activities.map(normalizeProcessItem).filter((item): item is AiAgentProcessItem => item !== null)
    : undefined;

  const previews = normalizeSessionPreviews(value.previews, value.preview);

  return {
    activities: activities && activities.length > 0 ? cancelAgentProcesses(activities) : undefined,
    attachments: normalizeSessionAttachments(value.attachments),
    id: value.id,
    isError: value.isError === true,
    preview: normalizeSessionPreview(value.preview) ?? previews?.at(-1),
    previews,
    role: value.role,
    text: value.text,
    thinking: typeof value.thinking === "string" ? value.thinking : undefined,
    thinkingTurns: normalizeThinkingTurns(value.thinkingTurns)
  };
}

function normalizeSessionAttachments(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const attachments = value
    .map(normalizeSessionAttachment)
    .filter((attachment): attachment is AiAgentSessionAttachment => attachment !== undefined)
    .slice(0, maxSessionMessageAttachmentCount);

  return attachments.length > 0 ? attachments : undefined;
}

function normalizeSessionAttachment(value: unknown): AiAgentSessionAttachment | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.id !== "string" || !sessionAttachmentIdPattern.test(value.id)) return undefined;
  if (!isSessionAttachmentMimeType(value.mimeType)) return undefined;
  if (typeof value.name !== "string" || !value.name.trim()) return undefined;
  if (!isNonNegativeFiniteNumber(value.size)) return undefined;
  if (!isPositiveFiniteNumber(value.width) || !isPositiveFiniteNumber(value.height)) return undefined;

  return {
    height: value.height,
    id: value.id,
    mimeType: value.mimeType,
    name: value.name.trim(),
    size: value.size,
    width: value.width
  };
}

function isSessionAttachmentMimeType(value: unknown): value is AiAgentSessionAttachment["mimeType"] {
  return typeof value === "string" && sessionAttachmentMimeTypes.has(value as AiAgentSessionAttachment["mimeType"]);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeThinkingTurns(value: unknown) {
  if (!Array.isArray(value)) return undefined;

  const turns = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return turns.length > 0 ? turns : undefined;
}

function normalizeSessionPreviews(previewsValue: unknown, previewValue: unknown) {
  if (Array.isArray(previewsValue)) {
    const previews = previewsValue
      .map(normalizeSessionPreview)
      .filter((preview): preview is AiAgentSessionPreview => preview !== undefined);

    if (previews.length > 0) return previews;
  }

  const preview = normalizeSessionPreview(previewValue);
  return preview ? [preview] : undefined;
}

function normalizeSessionPreview(value: unknown): AiAgentSessionPreview | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type !== "insert" && value.type !== "replace") return undefined;
  if (typeof value.original !== "string" || typeof value.replacement !== "string") return undefined;
  const target = normalizeSessionPreviewTarget(value.target);

  return {
    from: normalizeOptionalDocumentPosition(value.from),
    original: value.original,
    replacement: value.replacement,
    ...(target ? { target } : {}),
    to: normalizeOptionalDocumentPosition(value.to),
    type: value.type
  };
}

function normalizeSessionPreviewTarget(value: unknown): AiDiffTarget | undefined {
  if (!isRecord(value)) return undefined;
  if (!isAiDiffTargetKind(value.kind)) return undefined;

  return {
    from: normalizeOptionalDocumentPosition(value.from),
    id: typeof value.id === "string" ? value.id : undefined,
    kind: value.kind,
    title: typeof value.title === "string" ? value.title : undefined,
    to: normalizeOptionalDocumentPosition(value.to)
  };
}

function isAiDiffTargetKind(value: unknown): value is AiDiffTarget["kind"] {
  return (
    value === "current_block" ||
    value === "document" ||
    value === "document_end" ||
    value === "heading" ||
    value === "section" ||
    value === "selection" ||
    value === "table"
  );
}

function normalizeOptionalDocumentPosition(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeProcessItem(value: unknown): AiAgentProcessItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.label !== "string" || typeof value.turn !== "number") return null;
  if (!isProcessKind(value.kind) || !isProcessStatus(value.status)) return null;

  return {
    detail: typeof value.detail === "string" ? value.detail : undefined,
    id: value.id,
    kind: value.kind,
    label: value.label,
    rawLabel: typeof value.rawLabel === "string" ? value.rawLabel : undefined,
    status: value.status,
    turn: value.turn
  };
}

function isProcessKind(value: unknown): value is AiAgentProcessKind {
  return value === "ai_call" || value === "assistant_message" || value === "tool_call";
}

function isProcessStatus(value: unknown): value is AiAgentProcessStatus {
  return value === "cancelled" || value === "completed" || value === "error" || value === "running";
}
