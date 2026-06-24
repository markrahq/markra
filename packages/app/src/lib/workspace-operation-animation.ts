import type {
  WorkspacePlanVisualEvent,
  WorkspacePlanVisualStepEvent
} from "@markra/ai";

export type WorkspaceOperationAnimationStatus = "applied" | "applying" | "error" | "idle";
export type WorkspaceOperationTarget = "editor" | "file_tree";

export type WorkspaceOperationAnimationEvent =
  | {
      totalSteps: number;
      type: "operation_started";
    }
  | WorkspaceOperationStepEvent
  | {
      count: number;
      type: "operation_completed";
    };

export type WorkspaceOperationStepEvent = {
  action: string;
  afterContent?: string;
  beforeContent?: string;
  error?: string;
  from?: string;
  index: number;
  label: string;
  path?: string;
  target: WorkspaceOperationTarget;
  to?: string;
  type: "step_applied" | "step_failed" | "step_previewed" | "step_started";
};

export type WorkspaceOperationStepView = WorkspaceOperationStepEvent & {
  statusLabel: string;
};

export function workspaceOperationEventsFromPlanEvents(
  events: readonly WorkspacePlanVisualEvent[]
): WorkspaceOperationAnimationEvent[] {
  return events.map((event) => {
    if (event.type === "plan_validating") {
      return {
        totalSteps: event.totalSteps,
        type: "operation_started"
      };
    }

    if (event.type === "plan_completed") {
      return {
        count: event.count,
        type: "operation_completed"
      };
    }

    return workspaceOperationStepFromPlanStep(event);
  });
}

export function workspaceOperationSteps(
  events: readonly WorkspaceOperationAnimationEvent[]
): WorkspaceOperationStepView[] {
  const steps = new Map<number, WorkspaceOperationStepEvent>();

  for (const event of events) {
    if (!isWorkspaceOperationStepEvent(event)) continue;
    steps.set(event.index, event);
  }

  return [...steps.values()]
    .sort((left, right) => left.index - right.index)
    .map((step) => ({
      ...step,
      statusLabel: workspaceOperationStatusLabel(step)
    }));
}

export function activeWorkspaceOperationStep(steps: readonly WorkspaceOperationStepView[]) {
  return [...steps].reverse().find((step) => step.type !== "step_applied") ?? steps.at(-1) ?? null;
}

export function workspaceOperationRevealPaths(
  events: readonly WorkspaceOperationAnimationEvent[],
  status: WorkspaceOperationAnimationStatus
) {
  if (status !== "applying") return [];

  const activeStep = activeWorkspaceOperationStep(workspaceOperationSteps(events));
  if (!activeStep || activeStep.target !== "file_tree") return [];

  return uniqueStrings(
    [activeStep.path, activeStep.to, activeStep.from].filter((path): path is string => Boolean(path))
  );
}

export function workspaceOperationPlaybackEvents(
  events: readonly WorkspaceOperationAnimationEvent[]
) {
  const startIndex = latestWorkspaceOperationStartIndex(events);

  return startIndex >= 0 ? events.slice(startIndex) : events;
}

export function hasTerminalWorkspaceOperationStep(
  events: readonly WorkspaceOperationAnimationEvent[]
) {
  return events.some(isTerminalWorkspaceOperationStep);
}

export function workspaceOperationPlaybackStartCount(
  events: readonly WorkspaceOperationAnimationEvent[]
) {
  const firstStepIndex = events.findIndex(isWorkspaceOperationStepEvent);
  if (firstStepIndex < 0) return events.length;

  return Math.min(events.length, firstStepIndex + 1);
}

export function workspaceOperationEventSignature(
  events: readonly WorkspaceOperationAnimationEvent[]
) {
  return events.map((event) => {
    if (isWorkspaceOperationStepEvent(event)) {
      return [
        event.type,
        event.index,
        event.action,
        event.target,
        event.path ?? "",
        event.from ?? "",
        event.to ?? "",
        event.error ?? "",
        event.afterContent ?? ""
      ].join(":");
    }

    if (event.type === "operation_started") return `started:${event.totalSteps}`;

    return `completed:${event.count}`;
  }).join("|");
}

export function isWorkspaceOperationStepEvent(
  event: WorkspaceOperationAnimationEvent
): event is WorkspaceOperationStepEvent {
  return event.type === "step_applied" ||
    event.type === "step_failed" ||
    event.type === "step_previewed" ||
    event.type === "step_started";
}

function workspaceOperationStepFromPlanStep(
  event: WorkspacePlanVisualStepEvent
): WorkspaceOperationStepEvent {
  return {
    action: event.action,
    index: event.index,
    label: event.label,
    target: event.target,
    type: event.type,
    ...(event.afterContent ? { afterContent: event.afterContent } : {}),
    ...(event.beforeContent ? { beforeContent: event.beforeContent } : {}),
    ...(event.error ? { error: event.error } : {}),
    ...(event.from ? { from: event.from } : {}),
    ...(event.path ? { path: event.path } : {}),
    ...(event.to ? { to: event.to } : {})
  };
}

function latestWorkspaceOperationStartIndex(events: readonly WorkspaceOperationAnimationEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "operation_started") continue;
    if (events.slice(index).some(isTerminalWorkspaceOperationStep)) return index;
  }

  return -1;
}

function isTerminalWorkspaceOperationStep(event: WorkspaceOperationAnimationEvent) {
  return event.type === "step_applied" || event.type === "step_failed";
}

function workspaceOperationStatusLabel(step: WorkspaceOperationStepEvent) {
  if (step.type === "step_applied") return "Done";
  if (step.type === "step_failed") return "Failed";
  if (step.type === "step_started") return "Working";

  return "Previewing";
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values));
}
