import { StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

export const locationCueDurationMs = 1200;

type LocationCue = {
  position: number;
};

type LocationCueState = {
  decorations: DecorationSet;
  sequence: number;
};

const showLocationCueEffect = StateEffect.define<LocationCue>();
const clearLocationCueEffect = StateEffect.define<null>();

const locationCueField = StateField.define<LocationCueState>({
  create: () => ({ decorations: Decoration.none, sequence: 0 }),
  provide: (field) => EditorView.decorations.from(
    field,
    (cue) => cue.decorations,
  ),
  update(cue, transaction) {
    const showEffect = [...transaction.effects]
      .reverse()
      .find((effect) => effect.is(showLocationCueEffect));
    if (showEffect?.is(showLocationCueEffect)) {
      const position = Math.max(
        0,
        Math.min(transaction.state.doc.length, showEffect.value.position),
      );
      const line = transaction.state.doc.lineAt(position);
      const sequence = cue.sequence + 1;
      // Alternating animation names restarts the cue when repeated mode switches
      // target the same CodeMirror line before the previous animation finishes.
      const animationClass = sequence % 2 === 0
        ? "cm-markra-location-cue-even"
        : "cm-markra-location-cue-odd";
      return {
        decorations: Decoration.set([
          Decoration.line({
            class: `cm-markra-location-cue ${animationClass}`,
          }).range(line.from),
        ]),
        sequence,
      };
    }

    if (
      transaction.docChanged ||
      transaction.selection !== undefined ||
      transaction.effects.some((effect) => effect.is(clearLocationCueEffect))
    ) {
      return { decorations: Decoration.none, sequence: cue.sequence };
    }

    return {
      decorations: cue.decorations.map(transaction.changes),
      sequence: cue.sequence,
    };
  },
});

class LocationCueTimer {
  private clearTimer: number | null = null;

  constructor(private readonly view: EditorView) {}

  update(update: ViewUpdate) {
    const shown = update.transactions.some((transaction) =>
      transaction.effects.some((effect) => effect.is(showLocationCueEffect)),
    );
    if (!shown) {
      const cue = update.state.field(locationCueField, false);
      if (!cue || cue.decorations.size === 0) this.cancelTimer();
      return;
    }

    this.cancelTimer();
    this.clearTimer = window.setTimeout(() => {
      this.clearTimer = null;
      clearCodeMirrorLocationCue(this.view);
    }, locationCueDurationMs);
  }

  destroy() {
    this.cancelTimer();
  }

  private cancelTimer() {
    if (this.clearTimer === null) return;

    window.clearTimeout(this.clearTimer);
    this.clearTimer = null;
  }
}

const locationCueTimer = ViewPlugin.fromClass(LocationCueTimer);

const locationCueBoxShadow =
  "inset 0 0 0 9999px color-mix(in srgb, var(--accent) 14%, transparent), inset 2px 0 0 color-mix(in srgb, var(--accent) 72%, transparent)";
const clearedLocationCueBoxShadow =
  "inset 0 0 0 9999px transparent, inset 2px 0 0 transparent";
const locationCueKeyframes = {
  "0%, 34%": { boxShadow: locationCueBoxShadow },
  to: { boxShadow: clearedLocationCueBoxShadow },
};

const locationCueTheme = EditorView.baseTheme({
  ".cm-line.cm-markra-location-cue-even": {
    animation:
      `markra-codemirror-location-cue-even ${locationCueDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
  },
  ".cm-line.cm-markra-location-cue-odd": {
    animation:
      `markra-codemirror-location-cue-odd ${locationCueDurationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
  },
  "@keyframes markra-codemirror-location-cue-even": locationCueKeyframes,
  "@keyframes markra-codemirror-location-cue-odd": locationCueKeyframes,
  "@media (prefers-reduced-motion: reduce)": {
    ".cm-line.cm-markra-location-cue": {
      animationDuration: "1ms",
      boxShadow: locationCueBoxShadow,
    },
  },
});

export function codeMirrorLocationCue(): Extension {
  return [
    locationCueField,
    locationCueTimer,
    locationCueTheme,
    EditorView.domEventHandlers({
      pointerdown(_event, view) {
        clearCodeMirrorLocationCue(view);
        return false;
      },
    }),
  ];
}

export function showCodeMirrorLocationCue(view: EditorView, position: number) {
  if (!Number.isFinite(position)) return;

  view.dispatch({
    effects: showLocationCueEffect.of({
      position,
    }),
  });
}

export function clearCodeMirrorLocationCue(view: EditorView) {
  const cue = view.state.field(locationCueField, false);
  if (!cue || cue.decorations.size === 0) return;

  view.dispatch({ effects: clearLocationCueEffect.of(null) });
}
