import { StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  highlightActiveLine,
  type ViewUpdate,
} from "@codemirror/view";

export interface CodeMirrorTypewriterModeOptions {
  enabled?: boolean;
  getScrollContainer?: (view: EditorView) => HTMLElement | null;
}

function defaultScrollContainer(view: EditorView) {
  return view.dom.closest<HTMLElement>(".paper-scroll");
}

const typewriterActiveLineTheme = EditorView.baseTheme({
  '&[data-typewriter-mode="true"].cm-focused .cm-activeLine': {
    backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
  },
});

const activeLineCenterProperty = "--markra-typewriter-active-line-center";

type ActiveLineBand = {
  center: number;
  from: number;
};

const setActiveLineBands = StateEffect.define<readonly ActiveLineBand[]>();

const activeLineBandField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(bands, transaction) {
    const mapped = bands.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (!effect.is(setActiveLineBands)) continue;

      return Decoration.set(
        effect.value.map(({ center, from }) => {
          const value = `${Math.round(center * 10) / 10}px`;
          return Decoration.line({
            attributes: {
              style: `${activeLineCenterProperty}: ${value}`,
            },
          }).range(from);
        }),
        true,
      );
    }

    return mapped;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function resolveLineHeight(view: EditorView, element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const lineHeight = style.lineHeight.trim();
  const parsed = Number.parseFloat(lineHeight);
  if (Number.isFinite(parsed) && parsed > 0) {
    if (/^[\d.]+$/u.test(lineHeight)) {
      const fontSize = Number.parseFloat(style.fontSize);
      if (Number.isFinite(fontSize) && fontSize > 0) return parsed * fontSize;
    } else {
      return parsed;
    }
  }

  const measured = view.defaultLineHeight;
  if (Number.isFinite(measured) && measured > 0) return measured;

  return 16;
}

function activeLineElementAt(view: EditorView, position: number) {
  const { node } = view.domAtPos(position, 1);
  const element = node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement;

  return element?.closest<HTMLElement>(".cm-line") ?? null;
}

class CodeMirrorTypewriterView {
  private animationFrame: number | null = null;
  private paddingFrame: number | null = null;
  private pointerChangedSelection = false;
  private pointerDown = false;
  private readonly originalPaddingBottom: string;
  private readonly originalPaddingTop: string;
  private removePointerListeners: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private scrollContainer: HTMLElement | null = null;
  private activeLineMeasureScheduled = false;
  private destroyed = false;
  private lastBandSignature = "";

  constructor(
    private readonly view: EditorView,
    private readonly getScrollContainer: (view: EditorView) => HTMLElement | null,
  ) {
    this.originalPaddingBottom = view.contentDOM.style.paddingBottom;
    this.originalPaddingTop = view.contentDOM.style.paddingTop;
    this.updatePadding();
    this.paddingFrame = window.requestAnimationFrame(() => {
      this.paddingFrame = null;
      this.updatePadding();
    });

    this.resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          this.updatePadding();
          this.scheduleCenter();
          this.scheduleActiveLineBandMeasure();
        });
    if (this.scrollContainer) this.resizeObserver?.observe(this.scrollContainer);
    this.scheduleActiveLineBandMeasure();
  }

  update(update: ViewUpdate) {
    if (update.geometryChanged) this.updatePadding();
    if (update.docChanged || update.selectionSet || update.geometryChanged) {
      this.scheduleActiveLineBandMeasure();
    }
    if (!update.docChanged && !update.selectionSet) return;

    if (this.pointerDown) {
      if (update.selectionSet) this.pointerChangedSelection = true;
      this.cancelScheduledCenter();
      return;
    }

    // Range selections are a visual operation. Recentering while their
    // endpoint moves scrolls the document under the pointer, which feeds back
    // into CodeMirror's next pointer-based selection update and makes drag
    // selection run away. Center carets and document edits; collapse the
    // selection to resume centering.
    if (!update.docChanged && !update.state.selection.main.empty) {
      this.cancelScheduledCenter();
      return;
    }

    this.scheduleCenter();
  }

  handlePointerDown(event: PointerEvent) {
    if (event.button !== 0 || this.pointerDown) return;

    this.pointerDown = true;
    this.pointerChangedSelection = false;
    this.cancelScheduledCenter();

    const finish = (finishEvent?: Event) => {
      const buttons = (finishEvent as PointerEvent | undefined)?.buttons ?? 0;
      if (finishEvent?.type === "pointermove" && (buttons & 1) !== 0) return;

      this.finishPointerInteraction();
    };

    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    window.addEventListener("pointermove", finish, true);
    window.addEventListener("blur", finish);
    this.removePointerListeners = () => {
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("pointermove", finish, true);
      window.removeEventListener("blur", finish);
    };
  }

  private finishPointerInteraction() {
    if (!this.pointerDown) return;

    const changedSelection = this.pointerChangedSelection;
    this.pointerDown = false;
    this.pointerChangedSelection = false;
    this.removePointerListeners?.();
    this.removePointerListeners = null;

    // A completed drag keeps its range where it is. Only a click that moved
    // the caret should recenter once the pointer is released.
    if (changedSelection && this.view.state.selection.main.empty) {
      this.scheduleCenter();
    }
  }

  centerAfterComposition() {
    queueMicrotask(() => {
      this.scheduleCenter();
      this.scheduleActiveLineBandMeasure();
    });
  }

  destroy() {
    this.destroyed = true;
    this.cancelScheduledCenter();
    this.removePointerListeners?.();
    this.removePointerListeners = null;
    this.pointerDown = false;
    this.pointerChangedSelection = false;
    if (this.paddingFrame !== null) {
      window.cancelAnimationFrame(this.paddingFrame);
      this.paddingFrame = null;
    }
    this.resizeObserver?.disconnect();
    this.view.contentDOM.style.paddingBottom = this.originalPaddingBottom;
    this.view.contentDOM.style.paddingTop = this.originalPaddingTop;
  }

  private cancelScheduledCenter() {
    if (this.animationFrame === null) return;

    window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
  }

  private scheduleCenter() {
    // Split panes mirror document updates into an unfocused editor. Restrict
    // recentering to the active view so the two scroll positions cannot fight.
    if (!this.view.hasFocus || this.view.composing || this.pointerDown) return;
    this.cancelScheduledCenter();

    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationFrame = null;
      if (!this.view.hasFocus || this.view.composing || this.pointerDown) return;

      this.view.dispatch({
        effects: EditorView.scrollIntoView(
          this.view.state.selection.main.head,
          { y: "center" },
        ),
      });
    });
  }

  private scheduleActiveLineBandMeasure() {
    if (this.destroyed || this.activeLineMeasureScheduled) return;

    this.activeLineMeasureScheduled = true;
    this.view.requestMeasure({
      key: this,
      read: () => {
        if (this.destroyed) return [];
        return this.measureActiveLineBands();
      },
      write: (bands) => {
        this.activeLineMeasureScheduled = false;
        if (this.destroyed) return;

        const signature = bands
          .map(({ center, from }) => `${from}:${Math.round(center * 10) / 10}`)
          .join("|");
        if (signature === this.lastBandSignature) return;
        this.lastBandSignature = signature;

        // CodeMirror owns line attributes; dispatch the measured positions as
        // line decorations instead of mutating line DOM styles directly.
        queueMicrotask(() => {
          if (this.destroyed) return;
          this.view.dispatch({ effects: setActiveLineBands.of(bands) });
        });
      },
    });
  }

  private measureActiveLineBands(): ActiveLineBand[] {
    const view = this.view;
    const bands: ActiveLineBand[] = [];
    const seenLines = new Set<number>();

    for (const range of view.state.selection.ranges) {
      const line = view.state.doc.lineAt(range.head);
      if (seenLines.has(line.from)) continue;
      seenLines.add(line.from);

      const element = activeLineElementAt(view, range.head);
      const caret = view.coordsAtPos(range.head);
      if (!element || !caret) continue;

      const rect = element.getBoundingClientRect();
      const lineHeight = resolveLineHeight(view, element);
      const caretHeight = caret.bottom - caret.top;
      // A caret inside a block widget (image, table, rendered HTML) can report
      // the whole widget rectangle. Fall back to the logical line center so the
      // band does not jump to an arbitrary height.
      const contentHeight = element.clientHeight > 0 ? element.clientHeight : rect.height;
      const center = caretHeight > lineHeight * 2
        ? contentHeight / 2
        : (caret.top + caret.bottom) / 2 - rect.top - element.clientTop;

      if (!Number.isFinite(center)) continue;
      bands.push({ center, from: line.from });
    }

    return bands;
  }

  private updatePadding() {
    const nextScrollContainer = this.getScrollContainer(this.view);
    if (nextScrollContainer !== this.scrollContainer) {
      if (this.scrollContainer) this.resizeObserver?.unobserve(this.scrollContainer);
      this.scrollContainer = nextScrollContainer;
      if (this.scrollContainer) this.resizeObserver?.observe(this.scrollContainer);
    }
    if (!this.scrollContainer) return;

    const scrollRect = this.scrollContainer.getBoundingClientRect();
    const contentRect = this.view.contentDOM.getBoundingClientRect();
    const contentTopOffset = Math.max(
      0,
      contentRect.top - scrollRect.top + this.scrollContainer.scrollTop,
    );
    const measuredLineHeight = this.view.defaultLineHeight;
    const halfLineHeight =
      (Number.isFinite(measuredLineHeight) && measuredLineHeight > 0
        ? measuredLineHeight
        : 16) / 2;
    const halfViewportHeight = this.scrollContainer.clientHeight / 2;
    // CodeMirror is rendered inside Markra's external paper scroller. Real
    // content padding is required so even the first and last lines can center.
    const bottomPadding = Math.max(
      0,
      Math.round(halfViewportHeight - halfLineHeight),
    );
    const topPadding = Math.max(
      0,
      Math.round(halfViewportHeight - halfLineHeight - contentTopOffset),
    );
    const bottomPaddingValue = `${bottomPadding}px`;
    const topPaddingValue = `${topPadding}px`;
    if (
      this.view.contentDOM.style.paddingBottom === bottomPaddingValue &&
      this.view.contentDOM.style.paddingTop === topPaddingValue
    ) {
      return;
    }

    this.view.contentDOM.style.paddingBottom = bottomPaddingValue;
    this.view.contentDOM.style.paddingTop = topPaddingValue;
    this.view.requestMeasure();
  }
}

export function codeMirrorTypewriterMode(
  options: CodeMirrorTypewriterModeOptions = {},
): Extension {
  if (!(options.enabled ?? true)) return [];

  const getScrollContainer =
    options.getScrollContainer ?? defaultScrollContainer;
  const typewriterView = ViewPlugin.fromClass(
    class extends CodeMirrorTypewriterView {
      constructor(view: EditorView) {
        super(view, getScrollContainer);
      }
    },
    {
      eventHandlers: {
        pointerdown(event, view) {
          view.plugin(typewriterView)?.handlePointerDown(event as PointerEvent);
          return false;
        },
        compositionend(_event, view) {
          view.plugin(typewriterView)?.centerAfterComposition();
          return false;
        },
      },
    },
  );

  return [
    EditorView.editorAttributes.of({
      "data-typewriter-mode": "true",
    }),
    highlightActiveLine(),
    typewriterActiveLineTheme,
    activeLineBandField,
    typewriterView,
  ];
}
