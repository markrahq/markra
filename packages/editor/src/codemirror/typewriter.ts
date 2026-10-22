import type { Extension } from "@codemirror/state";
import {
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
        });
    if (this.scrollContainer) this.resizeObserver?.observe(this.scrollContainer);
  }

  update(update: ViewUpdate) {
    if (update.geometryChanged) this.updatePadding();
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
    queueMicrotask(() => this.scheduleCenter());
  }

  destroy() {
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
    typewriterView,
  ];
}
