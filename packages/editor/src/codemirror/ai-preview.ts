import {
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  type Transaction,
  type ChangeDesc,
  type Extension,
} from "@codemirror/state";
import { invertedEffects } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  EditorView,
  WidgetType,
  ViewPlugin,
  type DecorationSet,
  type EditorView as CodeMirrorView,
} from "@codemirror/view";
import type { AiDiffResult } from "@markra/ai";
import {
  AI_EDITOR_PREVIEW_ACTION_EVENT,
  AI_EDITOR_PREVIEW_APPLIED_EVENT,
  AI_EDITOR_PREVIEW_RESTORE_EVENT,
  type AiEditorPreviewAction,
  type AiEditorPreviewActionDetail,
  type AiEditorPreviewAppliedDetail,
  type AiEditorPreviewLabels,
  type AiEditorPreviewRestoreDetail,
  type AiTextDiffResult,
} from "../ai-preview-events.ts";

export interface CodeMirrorAiPreviewOptions {
  previewId?: string;
}

export interface CodeMirrorAiApplyOptions extends CodeMirrorAiPreviewOptions {
  mode?: "append" | "replace";
}

interface CodeMirrorAiPreviewSnapshot {
  readonly id: string;
  readonly labels?: AiEditorPreviewLabels;
  readonly result: AiTextDiffResult;
  readonly sequence: number;
}

interface CodeMirrorAiPreviewState {
  readonly applied: CodeMirrorAppliedPreviewSnapshot | null;
  readonly dismissed: readonly CodeMirrorAiPreviewSnapshot[];
  readonly nextSequence: number;
  readonly pending: readonly CodeMirrorAiPreviewSnapshot[];
}

interface CodeMirrorAppliedPreviewSnapshot {
  readonly from: number;
  readonly inserted: string;
  readonly removed: string;
  readonly resultFromOffset: number;
  readonly resultToOffset: number;
  readonly snapshot: CodeMirrorAiPreviewSnapshot;
  readonly to: number;
}

interface ShowPreviewEffect {
  readonly labels?: AiEditorPreviewLabels;
  readonly previewId?: string;
  readonly result: AiTextDiffResult;
}

interface ClearPreviewEffect {
  readonly previewId?: string;
  readonly result?: AiTextDiffResult;
}

interface PreviewResultEffect {
  readonly previewId?: string;
  readonly result: AiTextDiffResult;
}

interface ApplyPreviewEffect extends PreviewResultEffect {
  readonly from: number;
  readonly inserted: string;
  readonly removed: string;
}

const showPreviewEffect = StateEffect.define<ShowPreviewEffect>();
const clearPreviewEffect = StateEffect.define<ClearPreviewEffect>();
const applyPreviewEffect = StateEffect.define<ApplyPreviewEffect>();
const confirmPreviewEffect = StateEffect.define<PreviewResultEffect>();
const restorePreviewEffect = StateEffect.define<null>();

const emptyPreviewState: CodeMirrorAiPreviewState = {
  applied: null,
  dismissed: [],
  nextSequence: 0,
  pending: [],
};

const defaultLabels: AiEditorPreviewLabels = {
  append: "Append",
  apply: "Apply",
  chars: "chars",
  copied: "Copied",
  copy: "Copy",
  insertScope: "Insert",
  reject: "Reject",
  replaceDocumentScope: "Replace entire document",
  replaceRegionScope: "Replace region",
  replaceSelectionScope: "Replace selection",
};

function isTextDiffResult(result: AiDiffResult): result is AiTextDiffResult {
  return result.type === "insert" || result.type === "replace";
}

function resultSignature(result: AiTextDiffResult) {
  return [
    result.type,
    result.from ?? "",
    result.to ?? "",
    result.original,
    result.replacement,
  ].join("\u001f");
}

function sameResult(left: AiTextDiffResult, right: AiTextDiffResult) {
  return resultSignature(left) === resultSignature(right);
}

function targetSignature(target: AiTextDiffResult["target"]) {
  if (!target) return "";
  return [
    target.kind,
    target.id ?? "",
    target.title ?? "",
    target.from ?? "",
    target.to ?? "",
  ].join("\u001e");
}

function previewIdFor(result: AiTextDiffResult) {
  // The replacement changes while a model streams, but the target slot stays stable.
  return [
    result.type,
    result.from ?? "",
    result.to ?? "",
    result.original,
    targetSignature(result.target),
  ].join("\u001f");
}

function sortSnapshots(snapshots: readonly CodeMirrorAiPreviewSnapshot[]) {
  return [...snapshots].sort((left, right) => {
    const leftFrom = left.result.from ?? 0;
    const rightFrom = right.result.from ?? 0;
    if (leftFrom !== rightFrom) return leftFrom - rightFrom;
    const leftTo = left.result.to ?? leftFrom;
    const rightTo = right.result.to ?? rightFrom;
    if (leftTo !== rightTo) return leftTo - rightTo;
    return left.sequence - right.sequence;
  });
}

function mapResult(
  result: AiTextDiffResult,
  changes: ChangeDesc,
  transaction: Transaction,
): AiTextDiffResult {
  if (result.from === undefined || result.to === undefined) return result;
  const from = changes.mapPos(result.from, result.type === "insert" ? 1 : -1);
  const to = changes.mapPos(result.to, 1);
  const target = result.target
    ? {
        ...result.target,
        from:
          result.target.from === undefined
            ? undefined
            : changes.mapPos(result.target.from, -1),
        to:
          result.target.to === undefined
            ? undefined
            : changes.mapPos(result.target.to, 1),
      }
    : undefined;
  return {
    ...result,
    from,
    original:
      result.type === "replace"
        ? transaction.newDoc.sliceString(from, to)
        : "",
    ...(target ? { target } : {}),
    to,
  };
}

function mapSnapshots(
  snapshots: readonly CodeMirrorAiPreviewSnapshot[],
  transaction: Transaction,
) {
  if (transaction.changes.empty) return snapshots;
  return sortSnapshots(snapshots.map((snapshot) => ({
    ...snapshot,
    result: mapResult(snapshot.result, transaction.changes, transaction),
  })));
}

function previewResultsConflict(
  left: AiTextDiffResult,
  right: AiTextDiffResult,
) {
  if (left.type === "insert" && right.type === "insert") return false;

  const leftStart = left.from ?? 0;
  const leftEnd = left.type === "insert" ? leftStart : (left.to ?? leftStart);
  const rightStart = right.from ?? 0;
  const rightEnd = right.type === "insert" ? rightStart : (right.to ?? rightStart);

  if (left.type === "insert") {
    return leftStart >= rightStart && leftStart <= rightEnd;
  }
  if (right.type === "insert") {
    return rightStart >= leftStart && rightStart <= leftEnd;
  }
  return Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd);
}

function snapshotMatches(
  snapshot: CodeMirrorAiPreviewSnapshot,
  previewId: string | undefined,
  result: AiTextDiffResult | undefined,
) {
  if (previewId) return snapshot.id === previewId;
  return result ? sameResult(snapshot.result, result) : true;
}

function normalizeResultRange(
  state: EditorState,
  result: AiTextDiffResult,
) {
  const fallback = state.selection.main;
  const from = Math.max(0, Math.min(state.doc.length, result.from ?? fallback.from));
  const to = Math.max(from, Math.min(state.doc.length, result.to ?? fallback.to));
  return { from, to };
}

function edgeLineBreakCount(text: string, edge: "leading" | "trailing") {
  const sample = edge === "leading" ? text.slice(0, 2) : text.slice(-2);
  const match = edge === "leading" ? /^\n*/u.exec(sample) : /\n*$/u.exec(sample);
  return match?.[0].length ?? 0;
}

function appendTargetPosition(state: EditorState, to: number) {
  if (to >= state.doc.length) return state.doc.length;

  let node = syntaxTree(state).resolveInner(to, to === 0 ? 1 : -1);
  while (node.parent && node.parent.name !== "Document") node = node.parent;
  if (node.name !== "Document" && node.to >= to) return node.to;
  return state.doc.lineAt(to).to;
}

function appendAiResultChange(
  state: EditorState,
  replacement: string,
  to: number,
) {
  if (!replacement) return { cursor: to, from: to, insert: "", to };

  const position = appendTargetPosition(state, to);
  // Treat append as a structural Markdown operation. The original block stays
  // byte-for-byte intact while the AI result receives block boundaries on
  // both sides without removing authored blank lines.
  const leadingBreaks = edgeLineBreakCount(
    state.sliceDoc(Math.max(0, position - 2), position),
    "trailing",
  ) + edgeLineBreakCount(replacement, "leading");
  const trailingBreaks = edgeLineBreakCount(replacement, "trailing") +
    edgeLineBreakCount(
      state.sliceDoc(position, Math.min(state.doc.length, position + 2)),
      "leading",
    );
  const prefix = "\n".repeat(Math.max(0, 2 - leadingBreaks));
  const suffix = position < state.doc.length
    ? "\n".repeat(Math.max(0, 2 - trailingBreaks))
    : "";
  const insert = `${prefix}${replacement}${suffix}`;
  return {
    cursor: position + prefix.length + replacement.length,
    from: position,
    insert,
    to: position,
  };
}

function previewStateUpdate(
  value: CodeMirrorAiPreviewState,
  transaction: Transaction,
) {
  let pending = mapSnapshots(value.pending, transaction);
  let dismissed = mapSnapshots(value.dismissed, transaction);
  let applied = value.applied;
  let nextSequence = value.nextSequence;

  if (transaction.docChanged && applied) {
    const { inserted, removed, resultFromOffset, resultToOffset } = applied;
    const nextFrom = transaction.changes.mapPos(applied.from, -1);
    const previousStillApplied = transaction.startState.sliceDoc(
      applied.from,
      applied.to,
    ) === inserted;
    const nextInserted = transaction.newDoc.sliceString(
      nextFrom,
      nextFrom + inserted.length,
    );
    const nextRemoved = transaction.newDoc.sliceString(
      nextFrom,
      nextFrom + removed.length,
    );
    // Append removes no source text, so only a history undo can distinguish
    // reverting that insertion from the user editing the appended result.
    const revertedToRemoved = removed.length > 0
      ? nextRemoved === removed
      : transaction.isUserEvent("undo");

    if (
      previousStillApplied &&
      nextInserted !== inserted &&
      revertedToRemoved
    ) {
      const from = Math.max(0, nextFrom + resultFromOffset);
      const to = Math.max(from, nextFrom + resultToOffset);
      pending = sortSnapshots([
        ...pending,
        {
          ...applied.snapshot,
          result: {
            ...applied.snapshot.result,
            from,
            original: transaction.newDoc.sliceString(from, to),
            to,
          },
        },
      ]);
      applied = null;
    } else if (nextInserted === inserted) {
      applied = {
        ...applied,
        from: nextFrom,
        to: nextFrom + inserted.length,
      };
    } else {
      // Once the applied replacement itself is edited into a third value, an
      // ordinary later undo must not resurrect a stale AI comparison.
      applied = null;
    }
  }

  for (const effect of transaction.effects) {
    if (effect.is(showPreviewEffect)) {
      const id = effect.value.previewId ?? previewIdFor(effect.value.result);
      const existing = pending.find((snapshot) => snapshot.id === id);
      const snapshot: CodeMirrorAiPreviewSnapshot = {
        id,
        labels: effect.value.labels,
        result: effect.value.result,
        sequence: existing?.sequence ?? nextSequence,
      };
      pending = existing
        ? sortSnapshots(
            pending.map((candidate) => candidate.id === id ? snapshot : candidate),
          )
        : sortSnapshots([...pending, snapshot]);
      dismissed = dismissed.filter((candidate) => candidate.id !== id);
      if (!existing) nextSequence += 1;
      continue;
    }

    if (effect.is(clearPreviewEffect)) {
      const removed = pending.filter((snapshot) =>
        snapshotMatches(snapshot, effect.value.previewId, effect.value.result),
      );
      pending = pending.filter((snapshot) => !removed.includes(snapshot));
      dismissed = sortSnapshots([...dismissed, ...removed]);
      continue;
    }

    if (effect.is(applyPreviewEffect)) {
      const conflictingIds = new Set(
        value.pending
          .filter(
            (snapshot) =>
              !snapshotMatches(
                snapshot,
                effect.value.previewId,
                effect.value.result,
              ) && previewResultsConflict(snapshot.result, effect.value.result),
          )
          .map((snapshot) => snapshot.id),
      );
      const removed = pending.filter((snapshot) =>
        snapshotMatches(snapshot, effect.value.previewId, effect.value.result),
      );
      pending = pending.filter(
        (snapshot) =>
          !removed.includes(snapshot) && !conflictingIds.has(snapshot.id),
      );
      const snapshot = removed[0];
      const resultFrom = effect.value.result.from;
      const resultTo = effect.value.result.to;
      if (snapshot && resultFrom !== undefined && resultTo !== undefined) {
        applied = {
          from: effect.value.from,
          inserted: effect.value.inserted,
          removed: effect.value.removed,
          resultFromOffset: resultFrom - effect.value.from,
          resultToOffset: resultTo - effect.value.from,
          snapshot: {
            ...snapshot,
            result: effect.value.result,
          },
          to: effect.value.from + effect.value.inserted.length,
        };
      }
      continue;
    }

    if (effect.is(confirmPreviewEffect)) {
      dismissed = dismissed.filter((snapshot) =>
        !snapshotMatches(snapshot, effect.value.previewId, effect.value.result),
      );
      if (
        applied &&
        snapshotMatches(
          applied.snapshot,
          effect.value.previewId,
          effect.value.result,
        )
      ) {
        applied = null;
      }
      continue;
    }

    if (effect.is(restorePreviewEffect) && dismissed.length > 0) {
      pending = sortSnapshots([...pending, ...dismissed]);
      dismissed = [];
    }
  }

  return { applied, dismissed, nextSequence, pending };
}

function dispatchAction(
  view: CodeMirrorView,
  snapshot: CodeMirrorAiPreviewSnapshot,
  action: AiEditorPreviewAction,
) {
  view.dom.ownerDocument.defaultView?.dispatchEvent(
    new CustomEvent<AiEditorPreviewActionDetail>(AI_EDITOR_PREVIEW_ACTION_EVENT, {
      detail: {
        action,
        previewId: snapshot.id,
        result: snapshot.result,
      },
    }),
  );
}

interface PreviewScopeContext {
  readonly docSize: number;
  readonly from: number;
  readonly to: number;
}

function formatPreviewTarget(target: AiTextDiffResult["target"]) {
  if (!target) return null;
  const title = target.title?.trim() || target.id?.trim();
  return title ? `${target.kind}: ${title}` : target.kind;
}

function withPreviewTarget(scope: string, targetText: string | null) {
  return targetText ? `${scope} - ${targetText}` : scope;
}

function formatPreviewScope(
  result: AiTextDiffResult,
  labels: AiEditorPreviewLabels,
  { docSize, from, to }: PreviewScopeContext,
) {
  const affectedLength = result.type === "insert"
    ? result.replacement.length
    : result.original.length;
  const affectedText = `${affectedLength} ${labels.chars ?? defaultLabels.chars}`;
  const targetText = formatPreviewTarget(result.target);

  if (result.type === "insert") {
    const scope = withPreviewTarget(
      labels.insertScope ?? defaultLabels.insertScope ?? "Insert",
      targetText,
    );
    return `${scope} | ${affectedText} | pos ${from}`;
  }
  if (from === 0 && to >= docSize) {
    const scope = withPreviewTarget(
      labels.replaceDocumentScope ??
        defaultLabels.replaceDocumentScope ??
        "Replace entire document",
      targetText,
    );
    return `${scope} | ${affectedText}`;
  }
  if (from < to) {
    const scope = withPreviewTarget(
      labels.replaceSelectionScope ??
        defaultLabels.replaceSelectionScope ??
        "Replace selection",
      targetText,
    );
    return `${scope} | ${affectedText} | ${from}-${to}`;
  }
  const scope = withPreviewTarget(
    labels.replaceRegionScope ?? defaultLabels.replaceRegionScope ?? "Replace region",
    targetText,
  );
  return `${scope} | ${affectedText}`;
}

function isBlockReplacement(result: AiTextDiffResult) {
  if (result.target?.kind === "table") return true;
  const trimmed = result.replacement.trimStart();
  return result.replacement.includes("\n") ||
    /^(#{1,6}\s|>\s?|[-*+]\s+|\d+\.\s+|```|~~~|\|)/.test(trimmed);
}

function previewAppendPosition(
  state: EditorState,
  result: AiTextDiffResult,
) {
  const { from, to } = normalizeResultRange(state, result);
  if (!isBlockReplacement(result)) return to;

  // Table source lines after the first one are hidden by the visual table
  // renderer. Anchoring block previews to the first line keeps the AI result
  // visible beside that renderer instead of placing it in hidden source DOM.
  return state.doc.lineAt(from).to;
}

function createActionIcon(document: Document, action: AiEditorPreviewAction) {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  icon.classList.add("markra-ai-preview-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("fill", "none");
  icon.setAttribute("height", "15");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "15");

  const pathsByAction: Record<AiEditorPreviewAction, string[]> = {
    append: ["M12 5v14", "M5 12h14"],
    apply: ["M20 6 9 17l-5-5"],
    copy: [
      "M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2",
      "M8 4H6a2 2 0 0 0-2 2v10h10a2 2 0 0 0 2-2V4Z",
    ],
    reject: ["M18 6 6 18", "m6 6 12 12"],
  };
  for (const pathData of pathsByAction[action]) {
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", pathData);
    icon.append(path);
  }
  return icon;
}

function createLoadingIcon(document: Document) {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  const circle = document.createElementNS(svgNamespace, "circle");
  icon.classList.add("markra-ai-preview-icon", "markra-ai-preview-spinner");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("fill", "none");
  icon.setAttribute("height", "15");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "15");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "8");
  circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-linecap", "round");
  circle.setAttribute("stroke-width", "2.4");
  circle.setAttribute("stroke-dasharray", "32");
  circle.setAttribute("stroke-dashoffset", "12");
  icon.append(circle);
  return icon;
}

function markActionButtonBusy(document: Document, button: HTMLButtonElement) {
  button.dataset.applying = "true";
  button.disabled = true;
  button.classList.add("markra-ai-preview-applying");
  button.setAttribute("aria-busy", "true");
  button.replaceChildren(createLoadingIcon(document));
}

function showCopySuccessFeedback(
  document: Document,
  button: HTMLButtonElement,
  copiedLabel: string,
  copyLabel: string,
) {
  button.dataset.copied = "true";
  button.classList.add("markra-ai-preview-copied");
  button.ariaLabel = copiedLabel;
  button.title = copiedLabel;
  button.replaceChildren(createActionIcon(document, "apply"));
  document.defaultView?.setTimeout(() => {
    delete button.dataset.copied;
    button.classList.remove("markra-ai-preview-copied");
    button.ariaLabel = copyLabel;
    button.title = copyLabel;
    button.replaceChildren(createActionIcon(document, "copy"));
  }, 1200);
}

function createActionButton(
  document: Document,
  action: AiEditorPreviewAction,
  label: string,
  onAction: () => unknown,
  copiedLabel?: string,
) {
  const button = document.createElement("button");
  let pointerHandled = false;
  button.type = "button";
  button.className = `markra-ai-preview-action markra-ai-preview-${action}`;
  button.ariaLabel = label;
  button.title = label;
  button.append(createActionIcon(document, action));

  const triggerAction = () => {
    if (button.dataset.applying === "true") return;
    if (action === "apply" || action === "append") {
      markActionButtonBusy(document, button);
    }
    onAction();
    if (action === "copy" && copiedLabel) {
      showCopySuccessFeedback(document, button, copiedLabel, label);
    }
  };

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    pointerHandled = true;
    triggerAction();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (pointerHandled) {
      pointerHandled = false;
      return;
    }
    triggerAction();
  });
  return button;
}

class AiPreviewWidget extends WidgetType {
  constructor(readonly snapshot: CodeMirrorAiPreviewSnapshot) {
    super();
  }

  eq(other: AiPreviewWidget) {
    return (
      other.snapshot.id === this.snapshot.id &&
      sameResult(other.snapshot.result, this.snapshot.result) &&
      JSON.stringify(other.snapshot.labels) === JSON.stringify(this.snapshot.labels)
    );
  }

  ignoreEvent() {
    return false;
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const labels = { ...defaultLabels, ...this.snapshot.labels };
    const { from, to } = normalizeResultRange(view.state, this.snapshot.result);
    const widget = document.createElement("span");
    const insertion = document.createElement("span");
    const actions = document.createElement("span");
    const scope = document.createElement("span");

    widget.className = isBlockReplacement(this.snapshot.result)
      ? "markra-ai-preview-widget markra-ai-preview-widget-block"
      : "markra-ai-preview-widget";
    widget.contentEditable = "false";
    widget.dataset.markraAiPreviewId = this.snapshot.id;
    insertion.className = "markra-ai-preview-insert";
    insertion.textContent = this.snapshot.result.replacement;
    actions.className = "markra-ai-preview-actions markra-ai-preview-actions-quiet";
    actions.contentEditable = "false";
    scope.className = "markra-ai-preview-scope";
    scope.textContent = formatPreviewScope(this.snapshot.result, labels, {
      docSize: view.state.doc.length,
      from,
      to,
    });

    const copy = createActionButton(
      document,
      "copy",
      labels.copy,
      () => dispatchAction(view, this.snapshot, "copy"),
      labels.copied,
    );
    const reject = createActionButton(
      document,
      "reject",
      labels.reject,
      () => dispatchAction(view, this.snapshot, "reject"),
    );
    const apply = createActionButton(
      document,
      "apply",
      labels.apply,
      () => dispatchAction(view, this.snapshot, "apply"),
    );
    actions.append(scope, copy, reject);
    if (this.snapshot.result.type === "replace") {
      actions.append(createActionButton(
        document,
        "append",
        labels.append ?? defaultLabels.append ?? "Append",
        () => dispatchAction(view, this.snapshot, "append"),
      ));
    }
    actions.append(apply);
    widget.append(insertion, actions);
    return widget;
  }
}

function buildPreviewDecorations(state: EditorState) {
  const previewState = state.field(aiPreviewStateField);
  const ranges: Array<ReturnType<Decoration["range"]>> = [];

  for (const snapshot of previewState.pending) {
    const { from, to } = normalizeResultRange(state, snapshot.result);
    if (from < to) {
      ranges.push(
        Decoration.mark({ class: "markra-ai-preview-delete" }).range(from, to),
      );
    }
    ranges.push(
      Decoration.widget({
        side: 1,
        widget: new AiPreviewWidget(snapshot),
      }).range(previewAppendPosition(state, snapshot.result)),
    );
  }
  return Decoration.set(ranges, true);
}

const aiPreviewStateField = StateField.define<CodeMirrorAiPreviewState>({
  create() {
    return emptyPreviewState;
  },
  update: previewStateUpdate,
  provide: (field) => EditorView.decorations.compute([field], buildPreviewDecorations),
});

const aiPreviewHistoryEffects = invertedEffects.of((transaction) => {
  const previewState = transaction.startState.field(aiPreviewStateField);
  const inverses: StateEffect<unknown>[] = [];
  for (const effect of transaction.effects) {
    if (!effect.is(clearPreviewEffect)) continue;
    const removed = previewState.pending.filter((snapshot) =>
      snapshotMatches(
        snapshot,
        effect.value.previewId,
        effect.value.result,
      ));
    for (const snapshot of removed) {
      inverses.push(showPreviewEffect.of({
        labels: snapshot.labels,
        previewId: snapshot.id,
        result: snapshot.result,
      }));
    }
  }
  return inverses;
});

const aiPreviewRestoreEvents = ViewPlugin.fromClass(class {
  update(update: import("@codemirror/view").ViewUpdate) {
    const previous = update.startState.field(aiPreviewStateField);
    const next = update.state.field(aiPreviewStateField);
    if (!previous.applied || next.applied) return;
    const restored = next.pending.find(
      (snapshot) => snapshot.id === previous.applied?.snapshot.id,
    );
    if (!restored) return;
    update.view.dom.ownerDocument.defaultView?.dispatchEvent(
      new CustomEvent<AiEditorPreviewRestoreDetail>(AI_EDITOR_PREVIEW_RESTORE_EVENT, {
        detail: {
          previewId: restored.id,
          previews: next.pending.map((snapshot) => snapshot.result),
          result: restored.result,
        },
      }),
    );
  }
});

const aiPreviewTheme = EditorView.baseTheme({
  ".markra-ai-preview-delete": {
    background: "color-mix(in srgb, #d73a49 12%, transparent)",
    textDecoration: "line-through",
    textDecorationColor: "#d73a49",
  },
  ".markra-ai-preview-widget": {
    display: "inline-flex",
    position: "relative",
    margin: "0 0.2em",
    maxWidth: "100%",
    verticalAlign: "baseline",
  },
  ".markra-ai-preview-widget-block": {
    display: "flex",
    margin: "1em 0",
    width: "100%",
  },
  ".markra-ai-preview-insert": {
    background: "color-mix(in srgb, #2da44e 12%, transparent)",
    borderRadius: "0.25em",
    whiteSpace: "pre-wrap",
  },
  ".markra-ai-preview-actions": {
    alignItems: "center",
    background: "Canvas",
    border: "1px solid color-mix(in srgb, currentColor 18%, transparent)",
    borderRadius: "0.375em",
    display: "inline-flex",
    gap: "0.25em",
    padding: "0.125em",
  },
  ".markra-ai-preview-scope": {
    fontSize: "0.75em",
    opacity: "0.7",
    padding: "0 0.25em",
    whiteSpace: "nowrap",
  },
  ".markra-ai-preview-action": {
    alignItems: "center",
    background: "transparent",
    border: "0",
    cursor: "pointer",
    display: "inline-flex",
    justifyContent: "center",
    padding: "0.2em",
  },
  ".markra-ai-preview-action:disabled": {
    cursor: "default",
  },
  ".markra-ai-preview-spinner": {
    opacity: "0.7",
  },
});

export function codeMirrorAiPreviewPlugin(): Extension {
  return [
    aiPreviewStateField,
    aiPreviewHistoryEffects,
    aiPreviewRestoreEvents,
    aiPreviewTheme,
  ];
}

export function showCodeMirrorAiPreview(
  view: CodeMirrorView,
  result: AiDiffResult,
  labels?: AiEditorPreviewLabels,
  options: CodeMirrorAiPreviewOptions = {},
) {
  if (!isTextDiffResult(result)) {
    clearCodeMirrorAiPreview(view);
    return false;
  }
  const { from, to } = normalizeResultRange(view.state, result);
  view.dispatch({
    effects: showPreviewEffect.of({
      labels,
      previewId: options.previewId,
      result: { ...result, from, to },
    }),
  });
  return true;
}

export function clearCodeMirrorAiPreview(
  view: CodeMirrorView,
  result?: AiDiffResult,
  options: CodeMirrorAiPreviewOptions = {},
) {
  view.dispatch({
    effects: clearPreviewEffect.of({
      previewId: options.previewId,
      result: result && isTextDiffResult(result) ? result : undefined,
    }),
  });
}

export function restoreCodeMirrorAiPreviews(view: CodeMirrorView) {
  const before = view.state.field(aiPreviewStateField).dismissed;
  if (before.length === 0) return false;
  view.dispatch({ effects: restorePreviewEffect.of(null) });
  const previews = view.state.field(aiPreviewStateField).pending;
  const first = previews[0];
  if (first) {
    view.dom.ownerDocument.defaultView?.dispatchEvent(
      new CustomEvent<AiEditorPreviewRestoreDetail>(AI_EDITOR_PREVIEW_RESTORE_EVENT, {
        detail: {
          previewId: first.id,
          previews: previews.map((snapshot) => snapshot.result),
          result: first.result,
        },
      }),
    );
  }
  return true;
}

export function listCodeMirrorAiPreviewResults(view: CodeMirrorView) {
  return view.state.field(aiPreviewStateField).pending.map((snapshot) => snapshot.result);
}

export function applyCodeMirrorAiResult(
  view: CodeMirrorView,
  result: AiDiffResult,
  options: CodeMirrorAiApplyOptions = {},
) {
  if (view.state.readOnly || !isTextDiffResult(result)) return false;
  const { from, to } = normalizeResultRange(view.state, result);
  const appliedResult = { ...result, from, to };
  const pending = view.state.field(aiPreviewStateField).pending;
  const previewId = options.previewId ?? pending.find((snapshot) =>
    sameResult(snapshot.result, appliedResult)
  )?.id;

  const change = options.mode === "append"
    ? appendAiResultChange(view.state, result.replacement, to)
    : {
        cursor: from + result.replacement.length,
        from,
        insert: result.replacement,
        to,
      };

  view.dispatch({
    changes: { from: change.from, insert: change.insert, to: change.to },
    effects: applyPreviewEffect.of({
      from: change.from,
      inserted: change.insert,
      previewId,
      removed: view.state.sliceDoc(change.from, change.to),
      result: appliedResult,
    }),
    scrollIntoView: true,
    selection: EditorSelection.cursor(change.cursor),
  });
  view.focus();

  const remaining = view.state.field(aiPreviewStateField).pending;
  view.dom.ownerDocument.defaultView?.dispatchEvent(
    new CustomEvent<AiEditorPreviewAppliedDetail>(AI_EDITOR_PREVIEW_APPLIED_EVENT, {
      detail: {
        previewId,
        previews: remaining.map((snapshot) => snapshot.result),
        result: appliedResult,
      },
    }),
  );
  return true;
}

export function confirmCodeMirrorAiResultApplied(
  view: CodeMirrorView,
  result: AiDiffResult,
  options: CodeMirrorAiPreviewOptions = {},
) {
  if (!isTextDiffResult(result)) return false;
  view.dispatch({
    effects: confirmPreviewEffect.of({
      previewId: options.previewId,
      result,
    }),
  });
  return true;
}

export function scrollCodeMirrorAiPreviewIntoView(
  view: CodeMirrorView,
  result?: AiDiffResult,
  options: CodeMirrorAiPreviewOptions = {},
) {
  const preview = view.state.field(aiPreviewStateField).pending.find((snapshot) =>
    snapshotMatches(
      snapshot,
      options.previewId,
      result && isTextDiffResult(result) ? result : undefined,
    ),
  );
  if (!preview) return false;
  const position = previewAppendPosition(view.state, preview.result);
  view.dispatch({ effects: EditorView.scrollIntoView(position, { y: "center" }) });
  const widget = Array.from(
    view.dom.querySelectorAll<HTMLElement>(".markra-ai-preview-widget"),
  ).find((element) => element.dataset.markraAiPreviewId === preview.id);
  widget?.scrollIntoView({ block: "center", inline: "nearest" });
  return true;
}
