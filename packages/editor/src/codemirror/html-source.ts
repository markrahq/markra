import { StateEffect, StateField } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

interface HtmlSourceRange {
  readonly from: number;
  readonly to: number;
}

const openHtmlSource = StateEffect.define<HtmlSourceRange>({
  map: (range, changes) => ({
    from: changes.mapPos(range.from, -1),
    to: changes.mapPos(range.to, 1),
  }),
});

export const htmlSourceEditing = StateField.define<HtmlSourceRange | null>({
  create: () => null,
  update(active, transaction) {
    let range = active;
    if (range && transaction.docChanged) {
      range = {
        from: transaction.changes.mapPos(range.from, -1),
        to: transaction.changes.mapPos(range.to, 1),
      };
    }
    for (const effect of transaction.effects) {
      if (effect.is(openHtmlSource)) range = effect.value;
    }
    if (!range || range.from >= range.to) return null;
    // Opening source is explicit intent. Boundary clicks and blur must not replace
    // the line being hit-tested; leave source only when the selection moves outside.
    const { from, to } = range;
    return transaction.state.selection.ranges.some(selection =>
      selection.from <= to && selection.to >= from,
    ) ? range : null;
  },
});

export function revealHtmlSource(view: EditorView, range: HtmlSourceRange) {
  view.focus();
  view.dispatch({
    effects: openHtmlSource.of(range),
    selection: { anchor: range.from },
    scrollIntoView: true,
  });
}
