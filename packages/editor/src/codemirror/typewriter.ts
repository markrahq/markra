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
  private readonly originalPaddingBottom: string;
  private readonly originalPaddingTop: string;
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

    this.scheduleCenter();
  }

  centerAfterComposition() {
    queueMicrotask(() => this.scheduleCenter());
  }

  destroy() {
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    if (this.paddingFrame !== null) {
      window.cancelAnimationFrame(this.paddingFrame);
      this.paddingFrame = null;
    }
    this.resizeObserver?.disconnect();
    this.view.contentDOM.style.paddingBottom = this.originalPaddingBottom;
    this.view.contentDOM.style.paddingTop = this.originalPaddingTop;
  }

  private scheduleCenter() {
    // Split panes mirror document updates into an unfocused editor. Restrict
    // recentering to the active view so the two scroll positions cannot fight.
    if (!this.view.hasFocus || this.view.composing) return;
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
    }

    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationFrame = null;
      if (!this.view.hasFocus || this.view.composing) return;

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
