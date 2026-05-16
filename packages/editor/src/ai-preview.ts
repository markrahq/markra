import { DOMSerializer, Slice, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import type { AiDiffResult } from "@markra/ai";
import { clampNumber, debug } from "@markra/shared";

export const AI_EDITOR_PREVIEW_ACTION_EVENT = "markra-ai-preview-action";
export const AI_EDITOR_PREVIEW_APPLIED_EVENT = "markra-ai-preview-applied";
export const AI_EDITOR_PREVIEW_RESTORE_EVENT = "markra-ai-preview-restore";
export type AiEditorPreviewAction = "apply" | "copy" | "reject";
export type AiEditorPreviewAppliedDetail = {
  previewId?: string;
  previews: AiTextDiffResult[];
  result: AiTextDiffResult;
};
export type AiEditorPreviewActionDetail = {
  action: AiEditorPreviewAction;
  previewId?: string;
  result: AiTextDiffResult;
};
export type AiEditorPreviewRestoreDetail = {
  previewId?: string;
  previews: AiTextDiffResult[];
  result: AiTextDiffResult;
};

export type AiEditorPreviewLabels = {
  apply: string;
  chars?: string;
  copied: string;
  copy: string;
  insertScope?: string;
  reject: string;
  replaceDocumentScope?: string;
  replaceRegionScope?: string;
  replaceSelectionScope?: string;
};

type AiEditorPreviewMeta =
  | {
      kind: "apply";
      previewId?: string;
      previews: AiEditorPreviewSnapshot[];
      result: AiDiffResult;
    }
  | {
      kind: "confirm_apply";
      previewId?: string;
      result: AiDiffResult;
    }
  | {
      kind: "clear";
      previewId?: string;
      result?: AiDiffResult;
    }
  | {
      kind: "restore";
    }
  | {
      kind: "show";
      labels?: AiEditorPreviewLabels;
      previewId?: string;
      renderedReplacementHtml?: string;
      result: AiDiffResult;
    };

type AiTextDiffResult = Extract<AiDiffResult, { type: "insert" | "replace" }>;

type ApplyAiEditorResultOptions = {
  parseMarkdown?: (markdown: string) => ProseNode;
  previewId?: string;
};

type ShowAiEditorPreviewOptions = {
  parseMarkdown?: (markdown: string) => ProseNode;
  previewId?: string;
};

type ScrollAiEditorPreviewOptions = {
  previewId?: string;
};

type AppliedTransactionResult = {
  appliedResult: AiTextDiffResult;
  cursor: number;
  transaction: Transaction;
};

type AiEditorPreviewSnapshot = {
  id: string;
  labels?: AiEditorPreviewLabels;
  sequence: number;
  renderedReplacementHtml?: string;
  result: AiTextDiffResult;
};

type AiEditorPreviewState = {
  applied?: AiEditorPreviewSnapshot;
  decorations: DecorationSet;
  dismissed?: AiEditorPreviewSnapshot[];
  nextSequence: number;
  pending: AiEditorPreviewSnapshot[];
};

const aiEditorPreviewKey = new PluginKey<AiEditorPreviewState>("markra-ai-editor-preview");
const emptyPreviewState: AiEditorPreviewState = {
  decorations: DecorationSet.empty,
  nextSequence: 0,
  pending: []
};

export function showAiEditorPreview(
  view: EditorView,
  result: AiDiffResult,
  labels?: AiEditorPreviewLabels,
  options: ShowAiEditorPreviewOptions = {}
) {
  const renderedReplacementHtml = isTextDiffResult(result)
    ? renderMarkdownPreviewHtml(result.replacement, options.parseMarkdown)
    : undefined;
  const appendPosition = findPreviewAppendPositionForResult(view.state.doc, result);
  const transaction = view.state.tr.setMeta(aiEditorPreviewKey, {
    kind: "show",
    labels,
    previewId: options.previewId,
    renderedReplacementHtml,
    result
  } satisfies AiEditorPreviewMeta);

  if (appendPosition !== null) {
    // Keep the native selection from visually covering the diff preview.
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(appendPosition), 1));
  }

  view.dispatch(transaction);
}

export function scrollAiEditorPreviewIntoView(
  view: EditorView,
  result?: AiDiffResult,
  options: ScrollAiEditorPreviewOptions = {}
) {
  const previewState = aiEditorPreviewKey.getState(view.state);
  const preview = findAiEditorPreviewSnapshot(previewState?.pending ?? [], result, options.previewId);
  if (!preview) return false;

  const appendPosition = findPreviewAppendPositionForResult(view.state.doc, preview.result);
  if (appendPosition === null) return false;

  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.near(view.state.doc.resolve(appendPosition), 1))
      .scrollIntoView()
  );
  scrollAiPreviewWidgetElementIntoView(view, preview.id);

  return true;
}

export function clearAiEditorPreview(view: EditorView, result?: AiDiffResult, options: { previewId?: string } = {}) {
  view.dispatch(view.state.tr.setMeta(aiEditorPreviewKey, {
    kind: "clear",
    previewId: options.previewId ?? (result && isTextDiffResult(result) ? previewSlotSignature(result) : undefined),
    result
  } satisfies AiEditorPreviewMeta));
}

export function confirmAiEditorResultApplied(
  view: EditorView,
  result: AiDiffResult,
  options: { previewId?: string } = {}
) {
  if (!isTextDiffResult(result)) return;

  view.dispatch(view.state.tr.setMeta(aiEditorPreviewKey, {
    kind: "confirm_apply",
    previewId: options.previewId,
    result
  } satisfies AiEditorPreviewMeta));
}

export function listAiEditorPreviewResults(view: EditorView) {
  return (aiEditorPreviewKey.getState(view.state)?.pending ?? []).map((snapshot) => snapshot.result);
}

export function applyAiEditorResult(view: EditorView, result: AiDiffResult, options: ApplyAiEditorResultOptions = {}) {
  if (!isTextDiffResult(result)) {
    console.warn("[markra-ai-preview] apply skipped: non-text result", result);
    return false;
  }

  const docSize = view.state.doc.content.size;
  const fallbackSelection = view.state.selection;
  const from = clampNumber(result.from ?? fallbackSelection.from, 0, docSize);
  const to = clampNumber(result.to ?? fallbackSelection.to, 0, docSize);
  if (from === null || to === null) {
    console.warn("[markra-ai-preview] apply skipped: invalid range", {
      docSize,
      fallbackSelection: {
        from: fallbackSelection.from,
        to: fallbackSelection.to
      },
      from,
      result,
      to
    });
    return false;
  }

  debug(() => ["[markra-ai-preview] apply start", {
    docSize,
    from,
    hasParseMarkdown: typeof options.parseMarkdown === "function",
    replacementLength: result.replacement.length,
    to,
    treatAsBlockMarkdown: shouldTreatReplacementAsBlockMarkdown(result.replacement),
    type: result.type
  }]);

  const appliedResult = shouldTreatReplacementAsBlockMarkdown(result.replacement) && options.parseMarkdown
    ? applyParsedMarkdownReplacement(view, result, from, to, options.parseMarkdown)
    : applyPlainTextReplacement(view, result, from, to);
  const { appliedResult: nextAppliedResult, cursor, transaction } = appliedResult;
  const previewState = aiEditorPreviewKey.getState(view.state) ?? emptyPreviewState;
  const appliedPreviewId =
    options.previewId ??
    previewState.pending.find((snapshot) => samePreviewResult(snapshot.result, result))?.id;
  const remainingPreviews = rebaseRemainingPreviews(previewState.pending, nextAppliedResult, transaction, appliedPreviewId);

  transaction
    .setMeta(aiEditorPreviewKey, {
      kind: "apply",
      previewId: appliedPreviewId,
      previews: remainingPreviews,
      result: nextAppliedResult
    } satisfies AiEditorPreviewMeta)
    .setSelection(TextSelection.near(transaction.doc.resolve(cursor), -1))
    .scrollIntoView();
  view.dispatch(transaction);
  view.focus();

  debug(() => ["[markra-ai-preview] apply success", {
    cursor,
    nextDocSize: transaction.doc.content.size
  }]);

  return true;
}

export const markraAiEditorPreviewPlugin = $prose(() => {
  return new Plugin<AiEditorPreviewState>({
    key: aiEditorPreviewKey,
    view() {
      return {
        update(view, previousState) {
          const previousPreviewState = aiEditorPreviewKey.getState(previousState);
          const nextPreviewState = aiEditorPreviewKey.getState(view.state);
          const previousAppliedSignature = previousPreviewState?.applied ? previewSnapshotSignature(previousPreviewState.applied) : null;
          const nextAppliedSignature = nextPreviewState?.applied ? previewSnapshotSignature(nextPreviewState.applied) : null;

          if (nextPreviewState?.applied && nextAppliedSignature && nextAppliedSignature !== previousAppliedSignature) {
            window.dispatchEvent(
              new CustomEvent<AiEditorPreviewAppliedDetail>(AI_EDITOR_PREVIEW_APPLIED_EVENT, {
                detail: {
                  previewId: nextPreviewState.applied.id,
                  previews: nextPreviewState.pending.map((snapshot) => snapshot.result),
                  result: nextPreviewState.applied.result
                }
              })
            );
          }

          if (
            previousPreviewState &&
            previousPreviewState.pending.length === 0 &&
            nextPreviewState?.pending.length &&
            (previousPreviewState.applied || previousPreviewState.dismissed?.length)
          ) {
            window.dispatchEvent(
              new CustomEvent<AiEditorPreviewRestoreDetail>(AI_EDITOR_PREVIEW_RESTORE_EVENT, {
                detail: {
                  previewId: nextPreviewState.pending[0]?.id,
                  previews: nextPreviewState.pending.map((snapshot) => snapshot.result),
                  result: nextPreviewState.pending[0]!.result
                }
              })
            );
          }
        }
      };
    },
    props: {
      decorations(state) {
        return aiEditorPreviewKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
      handleKeyDown(view, event) {
        const previewState = aiEditorPreviewKey.getState(view.state);
        if (!previewState?.dismissed || !isUndoShortcut(event)) return false;

        event.preventDefault();
        view.dispatch(view.state.tr.setMeta(aiEditorPreviewKey, { kind: "restore" } satisfies AiEditorPreviewMeta));
        view.focus();

        return true;
      }
    },
    state: {
      apply(transaction, previewState) {
        const meta = transaction.getMeta(aiEditorPreviewKey) as AiEditorPreviewMeta | undefined;

        if (meta?.kind === "clear") {
          const textResult = meta.result && isTextDiffResult(meta.result) ? meta.result : null;
          const nextPending = meta.previewId
            ? previewState.pending.filter((snapshot) => snapshot.id !== meta.previewId)
            : textResult
              ? previewState.pending.filter((snapshot) => !samePreviewResult(snapshot.result, textResult))
              : [];
          const dismissed = meta.previewId
            ? previewState.pending.filter((snapshot) => snapshot.id === meta.previewId)
            : textResult
              ? previewState.pending.filter((snapshot) => samePreviewResult(snapshot.result, textResult))
              : previewState.pending;

          debug(() => ["[markra-ai-preview] plugin clear meta", {
            clearedPreviewId: meta.previewId,
            clearedResult: textResult ? previewDebugSummary(textResult) : null,
            dismissedCount: dismissed.length,
            nextPendingCount: nextPending.length,
            previousState: previewStateDebugSummary(previewState)
          }]);

          return nextPending.length > 0
            ? {
                decorations: buildAiPreviewDecorations(transaction.doc, nextPending),
                dismissed,
                nextSequence: previewState.nextSequence,
                pending: nextPending
              }
            : {
                ...emptyPreviewState,
                dismissed,
                nextSequence: previewState.nextSequence
              };
        }
        if (meta?.kind === "restore") {
          if (!previewState.dismissed?.length) return previewState;

          const restoredPending = sortPreviewSnapshots([...previewState.pending, ...previewState.dismissed]);
          debug(() => ["[markra-ai-preview] plugin restore meta", {
            previousState: previewStateDebugSummary(previewState),
            restoredPendingCount: restoredPending.length,
            restoredPreviews: restoredPending.map(previewDebugSnapshotSummary)
          }]);
          return {
            decorations: buildAiPreviewDecorations(transaction.doc, restoredPending),
            nextSequence: previewState.nextSequence,
            pending: restoredPending
          };
        }
        if (meta?.result.type === "error") return emptyPreviewState;
        if (meta?.kind === "show" && isTextDiffResult(meta.result)) {
          const previewId = meta.previewId ?? previewSlotSignature(meta.result);
          const existingPreview = previewState.pending.find((snapshot) => snapshot.id === previewId);
          const nextPreview: AiEditorPreviewSnapshot = {
            id: previewId,
            labels: meta.labels,
            renderedReplacementHtml: meta.renderedReplacementHtml,
            result: meta.result,
            sequence: existingPreview?.sequence ?? previewState.nextSequence
          };
          const nextPending = sortPreviewSnapshots(existingPreview
            ? previewState.pending.map((snapshot) => (snapshot.id === previewId ? nextPreview : snapshot))
            : [...previewState.pending, nextPreview]);

          debug(() => ["[markra-ai-preview] plugin show meta", {
            nextPendingCount: nextPending.length,
            preview: previewDebugSnapshotSummary(nextPreview),
            previousState: previewStateDebugSummary(previewState),
            replacedExisting: Boolean(existingPreview)
          }]);

          return {
            decorations: buildAiPreviewDecorations(transaction.doc, nextPending),
            nextSequence: existingPreview ? previewState.nextSequence : previewState.nextSequence + 1,
            pending: nextPending
          };
        }
        if (meta?.kind === "apply" && isTextDiffResult(meta.result)) {
          const nextPending = sortPreviewSnapshots(meta.previews);
          const textResult = meta.result;
          const appliedPreview =
            (meta.previewId ? previewState.pending.find((snapshot) => snapshot.id === meta.previewId) : undefined) ??
            previewState.pending.find((snapshot) => samePreviewResult(snapshot.result, textResult));
          debug(() => ["[markra-ai-preview] plugin apply meta", {
            appliedPreview: appliedPreview ? previewDebugSnapshotSummary(appliedPreview) : null,
            appliedPreviewId: meta.previewId,
            appliedResult: previewDebugSummary(textResult),
            nextPendingCount: nextPending.length,
            nextPendingPreviews: nextPending.map(previewDebugSnapshotSummary),
            pendingCount: nextPending.length,
            previousState: previewStateDebugSummary(previewState)
          }]);
          return {
            applied: appliedPreview
              ? {
                  id: appliedPreview.id,
                  labels: appliedPreview.labels,
                  renderedReplacementHtml: appliedPreview.renderedReplacementHtml,
                  result: textResult,
                  sequence: appliedPreview.sequence
                }
              : previewState.applied,
            decorations: buildAiPreviewDecorations(transaction.doc, nextPending),
            nextSequence: previewState.nextSequence,
            pending: nextPending
          };
        }
        if (meta?.kind === "confirm_apply" && isTextDiffResult(meta.result)) {
          const textResult = meta.result;
          const snapshot =
            previewState.applied ??
            (meta.previewId ? previewState.pending.find((item) => item.id === meta.previewId) : undefined) ??
            previewState.pending.find((item) => samePreviewResult(item.result, textResult));
          const remainingPending = meta.previewId
            ? previewState.pending.filter((item) => item.id !== meta.previewId)
            : previewState.pending.filter((item) => !samePreviewResult(item.result, textResult));

          debug(() => ["[markra-ai-preview] plugin confirm apply meta", {
            confirmedPreview: snapshot ? previewDebugSnapshotSummary(snapshot) : null,
            confirmedPreviewId: meta.previewId,
            confirmedResult: previewDebugSummary(textResult),
            previousState: previewStateDebugSummary(previewState),
            remainingPendingCount: remainingPending.length,
            remainingPreviews: remainingPending.map(previewDebugSnapshotSummary)
          }]);

          return {
            applied: snapshot
              ? {
                  id: snapshot.id,
                  labels: snapshot.labels,
                  renderedReplacementHtml: snapshot.renderedReplacementHtml,
                  result: textResult,
                  sequence: snapshot.sequence
                }
              : previewState.applied,
            decorations: buildAiPreviewDecorations(
              transaction.doc,
              remainingPending
            ),
            nextSequence: previewState.nextSequence,
            pending: remainingPending
          };
        }
        if (transaction.docChanged) {
          if (previewState.dismissed?.length) {
            return {
              ...previewState,
              decorations: previewState.decorations.map(transaction.mapping, transaction.doc)
            };
          }

          if (previewState.applied && resultMatchesOriginal(transaction.doc, previewState.applied.result)) {
            const appliedPreview = previewState.applied;
            if (!resultStillLooksApplied(transaction.doc, previewState.applied.result)) {
              const restoredPending = sortPreviewSnapshots([
                appliedPreview,
                ...rebasePreviewSnapshots(previewState.pending, transaction)
              ]);

              debug(() => ["[markra-ai-preview] plugin doc change restored applied preview", {
                appliedPreview: previewDebugSnapshotSummary(appliedPreview),
                docSize: transaction.doc.content.size,
                previousState: previewStateDebugSummary(previewState),
                restoredPendingCount: restoredPending.length,
                restoredPreviews: restoredPending.map(previewDebugSnapshotSummary)
              }]);

              return {
                decorations: buildAiPreviewDecorations(transaction.doc, restoredPending),
                nextSequence: previewState.nextSequence,
                pending: restoredPending
              };
            }

            const rebasedPending = rebasePreviewSnapshots(previewState.pending, transaction);
            debug(() => ["[markra-ai-preview] plugin doc change kept applied preview", {
              appliedPreview: previewDebugSnapshotSummary(appliedPreview),
              docSize: transaction.doc.content.size,
              previousState: previewStateDebugSummary(previewState),
              rebasedPendingCount: rebasedPending.length,
              rebasedPreviews: rebasedPending.map(previewDebugSnapshotSummary)
            }]);
            return {
              ...previewState,
              decorations: buildAiPreviewDecorations(transaction.doc, rebasedPending),
              pending: rebasedPending
            };
          }

          const appliedPending = previewState.pending.find((snapshot) => resultMatchesReplacement(transaction.doc, snapshot.result));
          if (appliedPending) {
            const remainingPending = previewState.pending.filter((snapshot) => !samePreviewResult(snapshot.result, appliedPending.result));
            debug(() => ["[markra-ai-preview] plugin doc change detected applied pending preview", {
              appliedPreview: previewDebugSnapshotSummary(appliedPending),
              docSize: transaction.doc.content.size,
              previousState: previewStateDebugSummary(previewState),
              remainingPendingCount: remainingPending.length,
              remainingPreviews: remainingPending.map(previewDebugSnapshotSummary)
            }]);
            return {
              applied: appliedPending,
              decorations: buildAiPreviewDecorations(
                transaction.doc,
                remainingPending
              ),
              nextSequence: previewState.nextSequence,
              pending: remainingPending
            };
          }

          const rebasedPending = rebasePreviewSnapshots(previewState.pending, transaction);
          debug(() => ["[markra-ai-preview] plugin doc change rebased pending previews", {
            docSize: transaction.doc.content.size,
            previousState: previewStateDebugSummary(previewState),
            rebasedPendingCount: rebasedPending.length,
            rebasedPreviews: rebasedPending.map(previewDebugSnapshotSummary)
          }]);
          return {
            ...previewState,
            decorations: buildAiPreviewDecorations(transaction.doc, rebasedPending),
            pending: rebasedPending
          };
        }

        return previewState;
      },
      init() {
        return emptyPreviewState;
      }
    }
  });
});

function buildAiPreviewDecorations(
  doc: ProseNode,
  previews: AiEditorPreviewSnapshot[]
) {
  const docSize = doc.content.size;
  const decorations = previews.flatMap((preview) => {
    const from = clampNumber(preview.result.from, 0, docSize);
    const to = clampNumber(preview.result.to, 0, docSize);
    if (from === null || to === null) return [];
    const appendPosition = findPreviewAppendPosition(doc, preview.result, from, to);

    const nextDecorations = [
      Decoration.widget(
        appendPosition,
        () => createPreviewWidget(
          preview.id,
          preview.result,
          preview.labels ?? defaultLabels,
          { docSize, from, to },
          preview.renderedReplacementHtml
        ),
        {
          key: `markra-ai-preview-insert-${preview.sequence}-${from}-${to}-${previewKeySegment(preview.result.replacement)}`,
          stopEvent: (event) => event.target instanceof Node && isPreviewWidgetEventTarget(event.target),
          side: -1
        }
      )
    ];

    if (preview.result.type === "replace" && from < to) {
      nextDecorations.unshift(
        Decoration.inline(from, to, {
          class: "markra-ai-preview-delete"
        })
      );
    }

    return nextDecorations;
  });

  return DecorationSet.create(doc, decorations);
}

function previewKeySegment(text: string) {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return `${text.length}-${hash.toString(36)}`;
}

function previewSnapshotSignature(snapshot: AiEditorPreviewSnapshot) {
  return [
    snapshot.id,
    snapshot.sequence,
    snapshot.result.type,
    snapshot.result.from,
    snapshot.result.to,
    snapshot.result.original,
    snapshot.result.replacement
  ].join("\u001f");
}

function previewSlotSignature(result: AiTextDiffResult) {
  return [
    result.type,
    result.from,
    result.to,
    result.original,
    formatPreviewTarget(result.target)
  ].join("\u001f");
}

function previewDebugSummary(result: AiTextDiffResult) {
  return {
    fingerprint: previewKeySegment(result.replacement),
    from: result.from ?? null,
    originalLength: result.original.length,
    replacementLength: result.replacement.length,
    to: result.to ?? null,
    type: result.type
  };
}

function previewDebugSnapshotSummary(snapshot: AiEditorPreviewSnapshot) {
  return {
    previewId: snapshot.id,
    sequence: snapshot.sequence,
    ...previewDebugSummary(snapshot.result)
  };
}

function previewStateDebugSummary(state: AiEditorPreviewState) {
  return {
    appliedPreviewId: state.applied?.id ?? null,
    dismissedCount: state.dismissed?.length ?? 0,
    nextSequence: state.nextSequence,
    pendingCount: state.pending.length,
    pendingPreviewIds: state.pending.map((snapshot) => snapshot.id)
  };
}

function samePreviewResult(left: AiTextDiffResult, right: AiTextDiffResult) {
  return (
    left.type === right.type &&
    left.from === right.from &&
    left.to === right.to &&
    left.original === right.original &&
    left.replacement === right.replacement
  );
}

function findAiEditorPreviewSnapshot(
  previews: AiEditorPreviewSnapshot[],
  result?: AiDiffResult,
  previewId?: string
) {
  if (previewId) return previews.find((snapshot) => snapshot.id === previewId) ?? null;
  if (result && isTextDiffResult(result)) {
    return previews.find((snapshot) => samePreviewResult(snapshot.result, result)) ?? null;
  }

  return previews.at(-1) ?? null;
}

function findPreviewAppendPositionForResult(doc: ProseNode, result: AiDiffResult) {
  if (!isTextDiffResult(result)) return null;

  const docSize = doc.content.size;
  const from = clampNumber(result.from, 0, docSize);
  const to = clampNumber(result.to, 0, docSize);
  if (from === null || to === null) return null;

  return findPreviewAppendPosition(doc, result, from, to);
}

function sortPreviewSnapshots(previews: AiEditorPreviewSnapshot[]) {
  return [...previews].sort((left, right) => {
    const leftFrom = left.result.from ?? 0;
    const rightFrom = right.result.from ?? 0;
    if (leftFrom !== rightFrom) return leftFrom - rightFrom;
    const leftTo = left.result.to ?? leftFrom;
    const rightTo = right.result.to ?? rightFrom;
    if (leftTo !== rightTo) return leftTo - rightTo;
    return left.sequence - right.sequence;
  });
}

function rebaseRemainingPreviews(
  previews: AiEditorPreviewSnapshot[],
  appliedResult: AiTextDiffResult,
  transaction: Transaction,
  appliedPreviewId?: string
) {
  return sortPreviewSnapshots(
    previews.flatMap((snapshot) => {
      if (appliedPreviewId ? snapshot.id === appliedPreviewId : samePreviewResult(snapshot.result, appliedResult)) return [];
      if (previewResultsConflict(snapshot.result, appliedResult)) return [];

      const rebased = rebasePreviewSnapshot(snapshot, transaction, appliedResult);
      return rebased ? [rebased] : [];
    })
  );
}

function rebasePreviewSnapshots(previews: AiEditorPreviewSnapshot[], transaction: Transaction) {
  return sortPreviewSnapshots(
    previews.flatMap((snapshot) => {
      const rebased = rebasePreviewSnapshot(snapshot, transaction);
      return rebased ? [rebased] : [];
    })
  );
}

function rebasePreviewSnapshot(
  snapshot: AiEditorPreviewSnapshot,
  transaction: Transaction,
  appliedResult?: AiTextDiffResult
) {
  const assoc = previewMappingAssoc(snapshot, appliedResult);
  const currentFrom = snapshot.result.from ?? 0;
  const currentTo = snapshot.result.to ?? currentFrom;
  const mappedFrom = transaction.mapping.map(currentFrom, assoc);
  const mappedTo = transaction.mapping.map(currentTo, assoc);
  if (mappedFrom < 0 || mappedTo < mappedFrom) return null;

  const target = snapshot.result.target
    ? {
        ...snapshot.result.target,
        from:
          snapshot.result.target.from === undefined ? undefined : transaction.mapping.map(snapshot.result.target.from, assoc),
        to: snapshot.result.target.to === undefined ? undefined : transaction.mapping.map(snapshot.result.target.to, assoc)
      }
    : undefined;

  return {
    ...snapshot,
    result: {
      ...snapshot.result,
      from: mappedFrom,
      original: snapshot.result.type === "insert" ? "" : transaction.doc.textBetween(mappedFrom, mappedTo, "\n"),
      replacement: snapshot.result.replacement,
      ...(target ? { target } : {}),
      to: mappedTo
    }
  };
}

function previewMappingAssoc(snapshot: AiEditorPreviewSnapshot, appliedResult?: AiTextDiffResult) {
  if (!appliedResult) return 1;
  if (snapshot.result.type !== "insert") return 1;
  const snapshotFrom = snapshot.result.from ?? 0;
  const appliedFrom = appliedResult.from ?? 0;
  const appliedTo = appliedResult.to ?? appliedFrom;
  const snapshotTo = snapshot.result.to ?? snapshotFrom;
  if (appliedResult.type !== "insert") return snapshotFrom >= appliedFrom ? 1 : -1;
  if (snapshotFrom !== appliedFrom || snapshotTo !== appliedTo) {
    return snapshotFrom >= appliedFrom ? 1 : -1;
  }

  return 1;
}

function previewResultsConflict(left: AiTextDiffResult, right: AiTextDiffResult) {
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

const defaultLabels: AiEditorPreviewLabels = {
  apply: "Apply",
  chars: "chars",
  copied: "Copied",
  copy: "Copy",
  insertScope: "Insert",
  reject: "Reject",
  replaceDocumentScope: "Replace entire document",
  replaceRegionScope: "Replace region",
  replaceSelectionScope: "Replace selection"
};

type PreviewScopeContext = {
  docSize: number;
  from: number;
  to: number;
};

function createPreviewWidget(
  previewId: string,
  result: AiTextDiffResult,
  labels: AiEditorPreviewLabels,
  scopeContext: PreviewScopeContext,
  renderedReplacementHtml?: string
) {
  const preview = document.createElement("span");
  preview.className = shouldTreatReplacementAsBlockMarkdown(result.replacement)
    ? "markra-ai-preview-widget markra-ai-preview-widget-block"
    : "markra-ai-preview-widget";
  preview.contentEditable = "false";
  preview.dataset.markraAiPreviewId = previewId;

  const scope = document.createElement("span");
  scope.className = "markra-ai-preview-scope";
  scope.textContent = formatPreviewScope(result, labels, scopeContext);

  const inserted = document.createElement("span");
  inserted.className = renderedReplacementHtml
    ? "markra-ai-preview-insert markra-ai-preview-insert-rendered"
    : "markra-ai-preview-insert";
  if (renderedReplacementHtml) {
    inserted.innerHTML = renderedReplacementHtml;
  } else {
    inserted.textContent = result.replacement;
  }

  const toolbar = document.createElement("span");
  toolbar.className = "markra-ai-preview-actions markra-ai-preview-actions-quiet";
  toolbar.contentEditable = "false";
  toolbar.append(
    scope,
    createActionButton("copy", labels.copy, previewId, result, labels.copied),
    createActionButton("reject", labels.reject, previewId, result),
    createActionButton("apply", labels.apply, previewId, result)
  );

  preview.append(inserted, toolbar);

  return preview;
}

function formatPreviewScope(
  result: AiTextDiffResult,
  labels: AiEditorPreviewLabels,
  { docSize, from, to }: PreviewScopeContext
) {
  const charLabel = labels.chars ?? defaultLabels.chars ?? "chars";
  const affectedLength = result.type === "insert" ? result.replacement.length : result.original.length;
  const affectedText = `${affectedLength} ${charLabel}`;
  const targetText = formatPreviewTarget(result.target);

  if (result.type === "insert") {
    const scope = withPreviewTarget(labels.insertScope ?? defaultLabels.insertScope ?? "Insert", targetText);

    return `${scope} | ${affectedText} | pos ${from}`;
  }
  if (from === 0 && to >= docSize) {
    const scope = withPreviewTarget(
      labels.replaceDocumentScope ?? defaultLabels.replaceDocumentScope ?? "Replace entire document",
      targetText
    );

    return `${scope} | ${affectedText}`;
  }
  if (from < to) {
    const scope = withPreviewTarget(
      labels.replaceSelectionScope ?? defaultLabels.replaceSelectionScope ?? "Replace selection",
      targetText
    );

    return `${scope} | ${affectedText} | ${from}-${to}`;
  }

  const scope = withPreviewTarget(labels.replaceRegionScope ?? defaultLabels.replaceRegionScope ?? "Replace region", targetText);

  return `${scope} | ${affectedText}`;
}

function formatPreviewTarget(target: AiTextDiffResult["target"]) {
  if (!target) return null;

  const title = target.title?.trim() || target.id?.trim();
  if (!title) return target.kind;

  return `${target.kind}: ${title}`;
}

function withPreviewTarget(scope: string, targetText: string | null) {
  return targetText ? `${scope} - ${targetText}` : scope;
}

function createActionButton(
  action: AiEditorPreviewAction,
  label: string,
  previewId: string,
  result: AiTextDiffResult,
  copiedLabel?: string
) {
  const button = document.createElement("button");
  let copyFeedbackTimer: number | null = null;
  let pointerHandled = false;
  button.className = `markra-ai-preview-action markra-ai-preview-${action}`;
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(createActionIcon(action));
  const triggerAction = () => {
    if (button.dataset.applying === "true") return;
    if (action === "apply") markApplyButtonBusy(button);

    debug(() => ["[markra-ai-preview] dispatch action", {
      action,
      from: result.from,
      replacementLength: result.replacement.length,
      to: result.to,
      type: result.type
    }]);
    window.dispatchEvent(
      new CustomEvent<AiEditorPreviewActionDetail>(AI_EDITOR_PREVIEW_ACTION_EVENT, {
        detail: { action, previewId, result }
      })
    );
    if (action === "copy" && copiedLabel) {
      showCopySuccessFeedback(button, copiedLabel, () => {
        if (copyFeedbackTimer !== null) window.clearTimeout(copyFeedbackTimer);
        copyFeedbackTimer = window.setTimeout(() => {
          restoreCopyButton(button, label);
          copyFeedbackTimer = null;
        }, 1200);
      });
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

function markApplyButtonBusy(button: HTMLButtonElement) {
  button.dataset.applying = "true";
  button.disabled = true;
  button.classList.add("markra-ai-preview-applying");
  button.setAttribute("aria-busy", "true");
  button.replaceChildren(createLoadingIcon());
}

function showCopySuccessFeedback(button: HTMLButtonElement, copiedLabel: string, scheduleRestore: () => unknown) {
  button.dataset.copied = "true";
  button.classList.add("markra-ai-preview-copied");
  button.setAttribute("aria-label", copiedLabel);
  button.title = copiedLabel;
  button.replaceChildren(createActionIcon("apply"));
  scheduleRestore();
}

function restoreCopyButton(button: HTMLButtonElement, copyLabel: string) {
  delete button.dataset.copied;
  button.classList.remove("markra-ai-preview-copied");
  button.setAttribute("aria-label", copyLabel);
  button.title = copyLabel;
  button.replaceChildren(createActionIcon("copy"));
}

function createActionIcon(action: AiEditorPreviewAction) {
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
    apply: ["M20 6 9 17l-5-5"],
    copy: [
      "M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2",
      "M8 4H6a2 2 0 0 0-2 2v10h10a2 2 0 0 0 2-2V4Z"
    ],
    reject: ["M18 6 6 18", "m6 6 12 12"]
  };

  pathsByAction[action].forEach((pathData) => {
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", pathData);
    icon.append(path);
  });

  return icon;
}

function createLoadingIcon() {
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

function isPreviewWidgetEventTarget(target: Node) {
  if (!(target instanceof Element)) return false;

  return target.closest(".markra-ai-preview-widget") !== null;
}

function scrollAiPreviewWidgetElementIntoView(view: EditorView, previewId: string) {
  const preview = Array.from(view.dom.querySelectorAll<HTMLElement>(".markra-ai-preview-widget"))
    .find((element) => element.dataset.markraAiPreviewId === previewId);

  if (!preview || typeof preview.scrollIntoView !== "function") return false;

  preview.scrollIntoView({
    block: "center",
    inline: "nearest"
  });

  return true;
}

function isTextDiffResult(result: AiDiffResult): result is AiTextDiffResult {
  return result.type === "insert" || result.type === "replace";
}

function renderMarkdownPreviewHtml(
  markdown: string,
  parseMarkdown: ((markdown: string) => ProseNode) | undefined
) {
  if (!parseMarkdown || typeof document === "undefined") return undefined;

  try {
    const parsedDocument = parseMarkdown(markdown);
    const serializer = DOMSerializer.fromSchema(parsedDocument.type.schema);
    const fragment = shouldTreatReplacementAsBlockMarkdown(markdown)
      ? parsedDocument.content
      : inlinePreviewContent(parsedDocument);
    const container = document.createElement("span");
    container.append(serializer.serializeFragment(fragment, { document }));

    return container.innerHTML;
  } catch {
    return undefined;
  }
}

function inlinePreviewContent(parsedDocument: ProseNode) {
  if (parsedDocument.childCount === 1) {
    const firstChild = parsedDocument.child(0);
    if (firstChild.type.name === "paragraph") return firstChild.content;
  }

  return parsedDocument.content;
}

function applyParsedMarkdownReplacement(
  view: EditorView,
  result: AiTextDiffResult,
  from: number,
  to: number,
  parseMarkdown: (markdown: string) => ProseNode
) {
  const parsedDocument = parseMarkdown(result.replacement);
  const range = result.type === "replace"
    ? findBlockReplacementRange(view.state.doc, from, to)
    : findBlockInsertRange(view.state.doc, from);
  const original = result.type === "replace" ? view.state.doc.textBetween(range.from, range.to, "\n") : "";
  const slice = new Slice(parsedDocument.content, 0, 0);
  const transaction = view.state.tr.replace(range.from, range.to, slice);
  const cursor = Math.min(transaction.doc.content.size, range.from + slice.content.size);

  return {
    appliedResult: {
      ...result,
      from: range.from,
      original,
      to: range.to
    },
    cursor,
    transaction
  };
}

function applyPlainTextReplacement(
  view: EditorView,
  result: AiTextDiffResult,
  from: number,
  to: number
): AppliedTransactionResult {
  const transaction = view.state.tr.insertText(result.replacement, from, to);
  const cursor = Math.min(transaction.doc.content.size, from + result.replacement.length);

  return {
    appliedResult: {
      ...result,
      from,
      original: result.type === "replace" ? view.state.doc.textBetween(from, to, "\n") : "",
      to
    },
    cursor,
    transaction
  };
}

function shouldTreatReplacementAsBlockMarkdown(markdown: string) {
  const trimmed = markdown.trimStart();

  return markdown.includes("\n") || /^(#{1,6}\s|>\s?|[-*+]\s+|\d+\.\s+|```|~~~|\|)/.test(trimmed);
}

function findPreviewAppendPosition(doc: ProseNode, result: AiTextDiffResult, from: number, to: number) {
  if (!shouldTreatReplacementAsBlockMarkdown(result.replacement)) return findInlineAppendPosition(doc, from, to);

  return findBlockInsertRange(doc, to).from;
}

function findBlockReplacementRange(doc: ProseNode, from: number, to: number) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const $from = doc.resolve(start);
  const $to = doc.resolve(end);

  if ($from.depth > 0 && $from.sameParent($to) && $from.parent.isTextblock) {
    return {
      from: $from.before($from.depth),
      to: $from.after($from.depth)
    };
  }

  return { from: start, to: end };
}

function findBlockInsertRange(doc: ProseNode, position: number) {
  const resolvedPosition = doc.resolve(position);

  for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
    if (resolvedPosition.node(depth).isTextblock) {
      const blockEnd = resolvedPosition.after(depth);

      return { from: blockEnd, to: blockEnd };
    }
  }

  return { from: position, to: position };
}

function isUndoShortcut(event: KeyboardEvent) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "z"
  );
}

function resultMatchesOriginal(doc: ProseNode, result: AiTextDiffResult) {
  const docSize = doc.content.size;
  const from = clampNumber(result.from, 0, docSize);
  if (from === null) return false;

  if (result.type === "insert") {
    const replacementEnd = Math.min(docSize, from + result.replacement.length);
    return doc.textBetween(from, replacementEnd, "\n") !== result.replacement;
  }

  const to = clampNumber(result.to, 0, docSize);
  if (to === null || from > to) return false;

  return doc.textBetween(from, to, "\n") === result.original;
}

function resultMatchesReplacement(doc: ProseNode, result: AiTextDiffResult) {
  const docSize = doc.content.size;
  const from = clampNumber(result.from, 0, docSize);
  if (from === null) return false;

  const replacementEnd = Math.min(docSize, from + result.replacement.length);
  return doc.textBetween(from, replacementEnd, "\n") === result.replacement;
}

function resultStillLooksApplied(doc: ProseNode, result: AiTextDiffResult) {
  if (resultMatchesReplacement(doc, result)) return true;
  if (!shouldTreatReplacementAsBlockMarkdown(result.replacement)) return false;
  if (headingReplacementStillLooksApplied(doc, result)) return true;

  const docSize = doc.content.size;
  const from = clampNumber(result.from, 0, docSize);
  if (from === null) return false;

  const needles = blockMarkdownReplacementNeedles(result);
  if (!needles.length) return false;

  const nearbyEnd = Math.min(docSize, from + Math.max(result.replacement.length * 2, result.original.length + 240));
  const nearbyText = normalizePreviewComparableText(doc.textBetween(from, nearbyEnd, "\n"));

  return needles.every((needle) => nearbyText.includes(needle));
}

function headingReplacementStillLooksApplied(doc: ProseNode, result: AiTextDiffResult) {
  const heading = parseSingleHeadingReplacement(result.replacement);
  if (!heading) return false;

  const docSize = doc.content.size;
  const from = clampNumber(result.from, 0, docSize);
  const to = clampNumber(result.to ?? result.from, 0, docSize);
  if (from === null || to === null) return false;

  let matched = false;
  doc.nodesBetween(from, Math.max(from, to), (node, position) => {
    if (matched || !node.isTextblock) return false;
    if (node.type.name !== "heading") return false;

    matched =
      Number(node.attrs.level ?? 1) === heading.level &&
      normalizePreviewComparableText(node.textContent) === heading.text;

    return false;
  });

  return matched;
}

function parseSingleHeadingReplacement(markdown: string) {
  const lines = markdown.trim().split("\n").filter((line) => line.trim().length > 0);
  if (lines.length !== 1) return null;

  const match = /^(#{1,6})\s+(.+)$/u.exec(lines[0]!.trim());
  if (!match) return null;

  const text = normalizePreviewComparableText(match[2] ?? "");
  if (!text) return null;

  return {
    level: match[1]!.length,
    text
  };
}

function blockMarkdownReplacementNeedles(result: AiTextDiffResult) {
  const normalizedOriginal = normalizePreviewComparableText(result.original);

  return result.replacement
    .split("\n")
    .map(markdownLineToComparableText)
    .filter((line) => line.length > 0 && line !== normalizedOriginal)
    .slice(0, 3);
}

function markdownLineToComparableText(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (/^\|?\s*:?-{3,}:?(\s*\|\s*:?-{3,}:?)*\s*\|?$/u.test(trimmed)) return "";

  return normalizePreviewComparableText(
    trimmed
      .replace(/^#{1,6}\s+/u, "")
      .replace(/^[-*+]\s+/u, "")
      .replace(/^\d+\.\s+/u, "")
      .replace(/^\|/u, "")
      .replace(/\|$/u, "")
      .replace(/\|/gu, " ")
  );
}

function normalizePreviewComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[`"'“”‘’#*()[\]{}:,.!?|<>~_\-：，。！？、；]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function findInlineAppendPosition(doc: ProseNode, from: number, to: number) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  let appendPosition = end;

  doc.nodesBetween(start, end, (node, position) => {
    if (!node.isText || node.nodeSize === 0) return true;

    const textStart = position;
    const textEnd = position + node.nodeSize;
    const visibleEnd = Math.min(end, textEnd);
    if (visibleEnd > textStart) appendPosition = visibleEnd;

    return true;
  });

  return appendPosition;
}
