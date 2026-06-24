import type {
  WorkspaceChangePlanArgs,
  WorkspacePlanVisualEvent,
  WorkspacePlanVisualStepEvent,
  WorkspacePlanVisualTarget
} from "@markra/ai";

type PreparedWorkspacePlanChange = {
  content?: string;
  from?: string;
  label?: string;
  links?: string[];
  path?: string;
  reason?: string;
  summary?: string;
  tags?: string[];
  to?: string;
  type?: unknown;
};

type WorkspacePlanAction = WorkspacePlanVisualStepEvent["action"];
type WorkspacePlanChangeForApply = WorkspaceChangePlanArgs["changes"][number] & {
  label?: string;
};

export function workspacePlanEventsFromToolResult(result: unknown): WorkspacePlanVisualEvent[] {
  const changes = preparedWorkspacePlanChanges(result);
  if (!changes.length) return [];

  return [
    {
      totalSteps: changes.length,
      type: "plan_validating" as const
    },
    ...changes.flatMap((change, index) => {
      const action = workspacePlanAction(change.type);
      if (!action) return [];

      const base = workspacePlanStepEvent(change, index, action, "step_started");
      return [
        base,
        workspacePlanStepEvent(change, index, action, "step_previewed")
      ];
    })
  ];
}

export function workspaceChangePlanFromToolResult(result: unknown): WorkspaceChangePlanArgs | null {
  const changes = preparedWorkspacePlanChanges(result)
    .map(workspacePlanChangeForApply)
    .filter((change): change is WorkspacePlanChangeForApply => Boolean(change));
  if (!changes.length) return null;

  const summary = trimmedValue(workspacePlanDetails(result)?.summary);
  return {
    changes,
    ...(summary ? { summary } : {})
  };
}

function preparedWorkspacePlanChanges(result: unknown) {
  const details = workspacePlanDetails(result);
  if (!details) return [];
  const changes = (details as { changes?: unknown }).changes;

  return Array.isArray(changes) ? changes.filter(isPreparedWorkspacePlanChange) : [];
}

function workspacePlanDetails(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;

  return details as { changes?: unknown; summary?: unknown };
}

function isPreparedWorkspacePlanChange(value: unknown): value is PreparedWorkspacePlanChange {
  if (!value || typeof value !== "object") return false;

  return Boolean(workspacePlanAction((value as PreparedWorkspacePlanChange).type));
}

function workspacePlanStepEvent(
  change: PreparedWorkspacePlanChange,
  index: number,
  action: WorkspacePlanAction,
  type: WorkspacePlanVisualStepEvent["type"]
): WorkspacePlanVisualStepEvent {
  const path = trimmedValue(change.path);
  const from = trimmedValue(change.from);
  const to = trimmedValue(change.to);
  const afterContent = type === "step_previewed" ? previewContentForChange(change, action) : undefined;

  return {
    action,
    index,
    label: trimmedValue(change.label) ?? fallbackLabelForChange(action, path, from, to),
    target: workspacePlanTarget(action),
    type,
    ...(afterContent ? { afterContent } : {}),
    ...(from ? { from } : {}),
    ...(path ? { path } : {}),
    ...(to ? { to } : {})
  };
}

function workspacePlanChangeForApply(change: PreparedWorkspacePlanChange): WorkspacePlanChangeForApply | null {
  const action = workspacePlanAction(change.type);
  if (!action) return null;

  const nextChange: WorkspacePlanChangeForApply = {
    type: action
  };
  const path = trimmedValue(change.path);
  const from = trimmedValue(change.from);
  const to = trimmedValue(change.to);
  const reason = trimmedValue(change.reason);
  const summary = trimmedValue(change.summary);
  const label = trimmedValue(change.label);
  const tags = stringArray(change.tags);
  const links = stringArray(change.links);

  if (typeof change.content === "string") nextChange.content = change.content;
  if (from) nextChange.from = from;
  if (label) nextChange.label = label;
  if (links.length > 0) nextChange.links = links;
  if (path) nextChange.path = path;
  if (reason) nextChange.reason = reason;
  if (summary) nextChange.summary = summary;
  if (tags.length > 0) nextChange.tags = tags;
  if (to) nextChange.to = to;

  return nextChange;
}

function workspacePlanAction(value: unknown): WorkspacePlanAction | null {
  if (
    value === "add_links" ||
    value === "add_tags" ||
    value === "create_note" ||
    value === "move_note" ||
    value === "rename_note" ||
    value === "update_note"
  ) {
    return value;
  }

  return null;
}

function workspacePlanTarget(action: WorkspacePlanAction): WorkspacePlanVisualTarget {
  if (action === "create_note" || action === "move_note" || action === "rename_note") return "file_tree";

  return "editor";
}

function previewContentForChange(change: PreparedWorkspacePlanChange, action: WorkspacePlanAction) {
  if (action === "add_tags" && change.tags?.length) return `Tags: ${change.tags.join(", ")}`;
  if (action === "add_links" && change.links?.length) return change.links.join("\n");
  if (typeof change.content === "string") return change.content;

  return undefined;
}

function fallbackLabelForChange(
  action: WorkspacePlanAction,
  path: string | undefined,
  from: string | undefined,
  to: string | undefined
) {
  const target = path ?? (from && to ? `${from} -> ${to}` : "workspace note");

  if (action === "add_links") return `Add links: ${target}`;
  if (action === "add_tags") return `Add tags: ${target}`;
  if (action === "create_note") return `Create note: ${target}`;
  if (action === "move_note") return `Move note: ${target}`;
  if (action === "rename_note") return `Rename note: ${target}`;

  return `Update note: ${target}`;
}

function trimmedValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
