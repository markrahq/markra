import type { ProviderMetadata } from "ai";

import { isRecord } from "@markra/shared";

type ReasoningMetadataEnvelope =
  | {
      kind: "openrouter-reasoning-details";
      value: Record<string, unknown>[];
      version: 1;
    }
  | {
      kind: "provider-metadata";
      value: ProviderMetadata;
      version: 1;
    };

export function encodeProviderMetadata(metadata: ProviderMetadata | undefined) {
  if (!metadata || Object.keys(metadata).length === 0) return undefined;

  return encodeEnvelope({
    kind: "provider-metadata",
    value: metadata,
    version: 1
  });
}

export function decodeProviderMetadata(signature: string | undefined): ProviderMetadata | undefined {
  const envelope = decodeEnvelope(signature);
  if (!envelope || envelope.kind !== "provider-metadata" || !isProviderMetadata(envelope.value)) return undefined;

  return envelope.value;
}

export function encodeOpenRouterReasoningDetails(details: Record<string, unknown>[]) {
  if (details.length === 0) return undefined;

  return encodeEnvelope({
    kind: "openrouter-reasoning-details",
    value: details,
    version: 1
  });
}

export function decodeOpenRouterReasoningDetails(signature: string | undefined) {
  const envelope = decodeEnvelope(signature);
  if (
    !envelope ||
    envelope.kind !== "openrouter-reasoning-details" ||
    !Array.isArray(envelope.value) ||
    !envelope.value.every(isRecord)
  ) {
    return undefined;
  }

  return envelope.value;
}

export function mergeOpenRouterReasoningDetails(
  current: Record<string, unknown>[],
  incoming: Record<string, unknown>[]
) {
  const merged = current.map((detail) => ({ ...detail }));

  for (const [incomingIndex, incomingDetail] of incoming.entries()) {
    const detailIndex = merged.findIndex((detail, index) => {
      return reasoningDetailKey(detail, index) === reasoningDetailKey(incomingDetail, incomingIndex);
    });
    if (detailIndex < 0) {
      merged.push({ ...incomingDetail });
      continue;
    }

    const previousDetail = merged[detailIndex]!;
    merged[detailIndex] = {
      ...previousDetail,
      ...incomingDetail,
      ...mergedTextFields(previousDetail, incomingDetail)
    };
  }

  return merged;
}

function encodeEnvelope(envelope: ReasoningMetadataEnvelope) {
  try {
    return JSON.stringify(envelope);
  } catch {
    return undefined;
  }
}

function decodeEnvelope(signature: string | undefined): ReasoningMetadataEnvelope | undefined {
  if (!signature?.trim()) return undefined;

  try {
    const value = JSON.parse(signature) as unknown;
    if (!isRecord(value) || value.version !== 1) return undefined;
    if (value.kind !== "provider-metadata" && value.kind !== "openrouter-reasoning-details") return undefined;

    return value as ReasoningMetadataEnvelope;
  } catch {
    return undefined;
  }
}

function isProviderMetadata(value: unknown): value is ProviderMetadata {
  return isRecord(value) && Object.values(value).every(isRecord);
}

function reasoningDetailKey(detail: Record<string, unknown>, fallbackIndex: number) {
  if (typeof detail.index === "number") return `index:${detail.index}`;
  if (typeof detail.id === "string" && detail.id) return `id:${detail.id}`;

  return `position:${fallbackIndex}`;
}

function mergedTextFields(previous: Record<string, unknown>, incoming: Record<string, unknown>) {
  return Object.fromEntries(
    ["summary", "text"].flatMap((field) => {
      const previousText = previous[field];
      const incomingText = incoming[field];
      if (typeof previousText !== "string" || typeof incomingText !== "string") return [];

      return [[field, mergeReasoningText(previousText, incomingText)]];
    })
  );
}

function mergeReasoningText(previous: string, incoming: string) {
  if (incoming.startsWith(previous)) return incoming;
  if (previous.endsWith(incoming)) return previous;

  return `${previous}${incoming}`;
}
