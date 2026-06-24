import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check, MousePointer2 } from "lucide-react";
import {
  activeWorkspaceOperationStep,
  hasTerminalWorkspaceOperationStep,
  workspaceOperationEventSignature,
  workspaceOperationPlaybackEvents,
  workspaceOperationPlaybackStartCount,
  workspaceOperationSteps,
  type WorkspaceOperationAnimationEvent,
  type WorkspaceOperationAnimationStatus,
  type WorkspaceOperationStepView,
  type WorkspaceOperationTarget
} from "../lib/workspace-operation-animation";

type WorkspaceOperationOverlayProps = {
  enabled?: boolean;
  events: readonly WorkspaceOperationAnimationEvent[];
  playbackDelayMs?: number;
  status?: WorkspaceOperationAnimationStatus;
};

type WorkspaceOperationPosition = {
  height: number;
  left: number;
  status: WorkspaceOperationStepView["type"];
  target: WorkspaceOperationTarget;
  targetLeft: number;
  targetTop: number;
  top: number;
  width: number;
};

const defaultPlaybackDelayMs = 420;
const completedPlaybackDismissDelayMs = 1000;
const editorTargetSelector = "[data-ai-workspace-editor='true'], .editor-content-slot";
const editorSurfaceSelector = ".markdown-paper, .markdown-source-paper, .markdown-source-editor, [role='textbox']";
const fileTreeFallbackSelectors = [
  "[data-ai-workspace-file-tree='true']",
  ".markdown-file-tree-files",
  ".markdown-file-tree-body",
  ".markdown-file-tree-slot"
] as const;

export function WorkspaceOperationOverlay({
  enabled = true,
  events,
  playbackDelayMs = defaultPlaybackDelayMs,
  status = "idle"
}: WorkspaceOperationOverlayProps) {
  const [playbackState, setPlaybackState] = useState({
    signature: "",
    visibleEventCount: 0
  });
  const [dismissedPlaybackSignature, setDismissedPlaybackSignature] = useState("");
  const [position, setPosition] = useState<WorkspaceOperationPosition | null>(null);
  const playbackEvents = workspaceOperationPlaybackEvents(events);
  const playbackEnabled =
    enabled &&
    (status === "applied" || status === "error") &&
    hasTerminalWorkspaceOperationStep(playbackEvents);
  const playbackSignature = workspaceOperationEventSignature(playbackEvents);
  const playbackStartCount = workspaceOperationPlaybackStartCount(playbackEvents);
  const currentPlaybackCount =
    playbackEnabled && playbackState.signature === playbackSignature
      ? playbackState.visibleEventCount
      : playbackStartCount;
  const visibleEvents = playbackEnabled
    ? playbackEvents.slice(0, Math.min(currentPlaybackCount, playbackEvents.length))
    : events;
  const visibleEventSignature = workspaceOperationEventSignature(visibleEvents);
  const visibleSteps = useMemo(
    () => workspaceOperationSteps(visibleEvents),
    [visibleEventSignature]
  );
  const activeStep = useMemo(
    () => activeWorkspaceOperationStep(visibleSteps),
    [visibleSteps]
  );
  const activeStepPositionKey = activeStep ? workspaceStepPositionKey(activeStep) : "";
  const completedPlayback =
    playbackEnabled &&
    status === "applied" &&
    playbackState.signature === playbackSignature &&
    playbackState.visibleEventCount >= playbackEvents.length &&
    playbackEvents.length > 0;
  const playbackDismissed =
    playbackEnabled &&
    dismissedPlaybackSignature === playbackSignature;

  useEffect(() => {
    if (!enabled || !playbackEnabled) return;

    if (playbackState.signature !== playbackSignature) {
      setPlaybackState({
        signature: playbackSignature,
        visibleEventCount: playbackStartCount
      });
      return;
    }

    if (playbackState.visibleEventCount >= playbackEvents.length) return;

    const timeoutId = window.setTimeout(() => {
      setPlaybackState((currentState) => {
        if (currentState.signature !== playbackSignature) return currentState;

        return {
          ...currentState,
          visibleEventCount: Math.min(currentState.visibleEventCount + 1, playbackEvents.length)
        };
      });
    }, playbackDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    playbackDelayMs,
    enabled,
    playbackEnabled,
    playbackEvents.length,
    playbackSignature,
    playbackStartCount,
    playbackState.signature,
    playbackState.visibleEventCount
  ]);

  useEffect(() => {
    if (!completedPlayback || playbackDismissed) return;

    const timeoutId = window.setTimeout(() => {
      setDismissedPlaybackSignature(playbackSignature);
    }, completedPlaybackDismissDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    completedPlayback,
    playbackDismissed,
    playbackSignature
  ]);

  useEffect(() => {
    if (!enabled || status === "idle" || !activeStep) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      setPosition(positionForWorkspaceStep(activeStep));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const observer = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(updatePosition);
    observer?.observe(document.body, {
      attributeFilter: [
        "data-ai-workspace-editor",
        "data-ai-workspace-file-path",
        "data-ai-workspace-file-label-path",
        "data-ai-workspace-file-label-relative-path",
        "data-ai-workspace-file-relative-path",
        "data-ai-workspace-file-tree",
        "data-ai-workspace-folder-label-path",
        "data-ai-workspace-folder-label-relative-path",
        "data-ai-workspace-folder-path",
        "data-ai-workspace-folder-relative-path",
        "data-file-tree-path"
      ],
      attributes: true,
      childList: true,
      subtree: true
    });

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      observer?.disconnect();
    };
  }, [activeStep, activeStepPositionKey, enabled, status]);

  if (!enabled || status === "idle" || !position || playbackDismissed) return null;

  const targetStyle: CSSProperties = {
    height: `${position.height}px`,
    transform: translate3d(position.targetLeft, position.targetTop),
    width: `${position.width}px`
  };
  const cursorStyle: CSSProperties = {
    transform: translate3d(position.left, position.top)
  };

  return (
    <div
      aria-hidden="true"
      className="workspace-operation-overlay pointer-events-none fixed inset-0 z-[60]"
      data-ai-workspace-operation-overlay="true"
    >
      <div
        className="absolute left-0 top-0 rounded-md border border-[color-mix(in_srgb,var(--accent)_42%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] opacity-90 shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent),0_10px_32px_color-mix(in_srgb,var(--accent)_12%,transparent)] transition-[transform,width,height,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
        data-testid="workspace-operation-target"
        style={targetStyle}
      />
      <div
        className="absolute left-0 top-0 size-0 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none"
        data-ai-workspace-target={position.target}
        data-testid="workspace-operation-cursor"
        style={cursorStyle}
      >
        <MousePointer2
          aria-hidden="true"
          className="absolute -left-0.5 -top-0.5 text-(--accent) drop-shadow-[0_1px_1px_color-mix(in_srgb,var(--bg-primary)_90%,transparent)]"
          data-ai-workspace-cursor-tip="true"
          data-testid="workspace-operation-cursor-pointer"
          size={16}
        />
        <div
          className="absolute left-0 top-0 inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_38%,var(--border-default))] bg-(--bg-primary)/95 px-2 py-1 text-[10px] leading-4 font-[620] text-(--text-heading) shadow-(--ai-command-popover-shadow) backdrop-blur"
          data-testid="workspace-operation-cursor-bubble"
          style={{ transform: translate3d(18, 9) }}
        >
          {position.status === "step_applied" ? (
            <Check aria-hidden="true" className="text-(--accent)" size={12} />
          ) : (
            <MousePointer2 aria-hidden="true" className="text-(--accent)" size={12} />
          )}
          <span className="max-w-40 truncate">{operationCursorLabel(position)}</span>
        </div>
      </div>
    </div>
  );
}

function positionForWorkspaceStep(step: WorkspaceOperationStepView) {
  const elements = elementsForWorkspaceStep(step);
  if (!elements) return null;

  const targetRect = elements.target.getBoundingClientRect();
  const cursorRect = (elements.cursor ?? elements.target).getBoundingClientRect();
  const cursorPoint = cursorPointForWorkspaceStep(step, cursorRect, elements.cursor !== undefined);

  return {
    height: Math.round(targetRect.height),
    left: Math.round(cursorPoint.left),
    status: step.type,
    target: step.target,
    targetLeft: Math.round(targetRect.left),
    targetTop: Math.round(targetRect.top),
    top: Math.round(cursorPoint.top),
    width: Math.round(targetRect.width)
  } satisfies WorkspaceOperationPosition;
}

function elementsForWorkspaceStep(step: WorkspaceOperationStepView) {
  if (step.target === "editor") {
    const editor = document.querySelector<HTMLElement>(editorTargetSelector);
    if (!editor) return null;

    const editorSurface = editor.querySelector<HTMLElement>(editorSurfaceSelector);
    return {
      target: editorSurface ?? editor
    };
  }

  const fileElement = fileElementForWorkspaceStep(step);
  if (fileElement) {
    return {
      cursor: fileLabelElementForWorkspaceStep(step) ?? fileElement,
      target: fileElement
    };
  }

  const folderElement = folderElementForWorkspaceStep(step);
  if (folderElement) {
    return {
      cursor: folderLabelElementForWorkspaceStep(step) ?? folderElement,
      target: folderElement
    };
  }

  const fallback = fileTreeFallbackElement();
  return fallback ? { target: fallback } : null;
}

function fileElementForWorkspaceStep(step: WorkspaceOperationStepView) {
  for (const path of workspaceStepPaths(step)) {
    const target = document.querySelector<HTMLElement>(
      [
        attributeSelector("data-ai-workspace-file-relative-path", path),
        attributeSelector("data-ai-workspace-file-path", path),
        attributeSelector("data-file-tree-path", path)
      ].join(", ")
    );
    if (target) return target;
  }

  return null;
}

function fileLabelElementForWorkspaceStep(step: WorkspaceOperationStepView) {
  for (const path of workspaceStepPaths(step)) {
    const target = document.querySelector<HTMLElement>(
      [
        attributeSelector("data-ai-workspace-file-label-relative-path", path),
        attributeSelector("data-ai-workspace-file-label-path", path)
      ].join(", ")
    );
    if (target) return target;
  }

  return null;
}

function folderElementForWorkspaceStep(step: WorkspaceOperationStepView) {
  for (const path of workspaceStepParentFolderPaths(step)) {
    const target = document.querySelector<HTMLElement>(
      [
        attributeSelector("data-ai-workspace-folder-relative-path", path),
        attributeSelector("data-ai-workspace-folder-path", path)
      ].join(", ")
    );
    if (target) return target;
  }

  return null;
}

function folderLabelElementForWorkspaceStep(step: WorkspaceOperationStepView) {
  for (const path of workspaceStepParentFolderPaths(step)) {
    const target = document.querySelector<HTMLElement>(
      [
        attributeSelector("data-ai-workspace-folder-label-relative-path", path),
        attributeSelector("data-ai-workspace-folder-label-path", path)
      ].join(", ")
    );
    if (target) return target;
  }

  return null;
}

function fileTreeFallbackElement() {
  for (const selector of fileTreeFallbackSelectors) {
    const target = document.querySelector<HTMLElement>(selector);
    if (target) return target;
  }

  return null;
}

function cursorPointForWorkspaceStep(
  step: WorkspaceOperationStepView,
  rect: DOMRect,
  preciseFileLabel: boolean
) {
  if (step.target === "file_tree") {
    return {
      left: rect.left + (preciseFileLabel ? 2 : 24),
      top: rect.top + (preciseFileLabel ? rect.height / 2 : Math.min(48, Math.max(24, rect.height * 0.2)))
    };
  }

  return {
    left: rect.left + Math.min(96, Math.max(32, rect.width * 0.12)),
    top: rect.top + Math.min(96, Math.max(48, rect.height * 0.18))
  };
}

function workspaceStepPaths(step: WorkspaceOperationStepView) {
  return [step.path, step.to, step.from].filter((path): path is string => Boolean(path));
}

function workspaceStepParentFolderPaths(step: WorkspaceOperationStepView) {
  const parentPaths: string[] = [];

  for (const path of workspaceStepPaths(step)) {
    parentPaths.push(...parentFolderPathCandidates(path));
  }

  return uniqueStrings(parentPaths);
}

function parentFolderPathCandidates(path: string) {
  const normalizedPath = path.replace(/\\/gu, "/").replace(/\/+$/u, "");
  const parts = normalizedPath.split("/").filter(Boolean);
  const absolutePrefix = normalizedPath.startsWith("/") ? "/" : "";
  if (parts.length <= 1) return [];

  const folders: string[] = [];
  for (let count = parts.length - 1; count > 0; count -= 1) {
    folders.push(`${absolutePrefix}${parts.slice(0, count).join("/")}`);
  }

  return folders;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function attributeSelector(attribute: string, value: string) {
  return `[${attribute}="${cssAttributeValue(value)}"]`;
}

function cssAttributeValue(value: string) {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"");
}

function translate3d(left: number, top: number) {
  return `translate3d(${left}px, ${top}px, 0)`;
}

function operationCursorLabel(position: WorkspaceOperationPosition) {
  if (position.status === "step_applied") return "Done";
  if (position.status === "step_failed") return "Failed";
  if (position.status === "step_previewed") return "Preview";

  return "Working";
}

function workspaceStepPositionKey(step: WorkspaceOperationStepView) {
  return [
    step.type,
    step.index,
    step.target,
    step.path ?? "",
    step.from ?? "",
    step.to ?? "",
    step.label
  ].join(":");
}
