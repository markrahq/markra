import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

export interface CodeMirrorExternalScrollOptions {
  getScrollContainer: (view: EditorView) => HTMLElement | null;
}

interface ScrollSnapshot {
  container: HTMLElement;
  left: number;
  top: number;
}

function keyMayEditDocument(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && !event.altKey) {
    const key = event.key.toLowerCase();
    return key === "v" || key === "x";
  }

  return event.key.length === 1 || [
    "Backspace",
    "Delete",
    "Enter",
    "Tab",
  ].includes(event.key);
}

function revealExternalCursor(view: EditorView, container: HTMLElement) {
  const selection = view.state.selection.main;
  const cursor = view.coordsAtPos(selection.head, selection.assoc || undefined);
  if (!cursor) return;

  const viewport = container.getBoundingClientRect();
  const measuredScale = viewport.height / (container.offsetHeight || container.clientHeight);
  const scaleY = Number.isFinite(measuredScale) && measuredScale > 0 ? measuredScale : 1;
  const viewportTop = viewport.top + container.clientTop * scaleY;
  const viewportBottom = viewportTop + container.clientHeight * scaleY;
  const margin = 5;
  const delta = cursor.top < viewportTop + margin
    ? cursor.top - viewportTop - margin
    : cursor.bottom > viewportBottom - margin
      ? cursor.bottom - viewportBottom + margin
      : 0;
  if (delta === 0) return;

  const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.max(
    0,
    Math.min(maximum, container.scrollTop + delta / scaleY),
  );
}

class CodeMirrorExternalScrollView {
  private animationFrame: number | null = null;
  private microtaskQueued = false;
  private snapshot: ScrollSnapshot | null = null;
  private observedScroll: ScrollSnapshot | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly getScrollContainer: (view: EditorView) => HTMLElement | null,
  ) {
    this.observeScroll();
  }

  private readScroll(): ScrollSnapshot | null {
    const container = this.getScrollContainer(this.view);
    if (!container || container === this.view.scrollDOM) return null;
    return { container, left: container.scrollLeft, top: container.scrollTop };
  }

  observeScroll() {
    if (!this.snapshot) this.observedScroll = this.readScroll();
  }

  capture(replace = false) {
    if (this.view.dom.dataset.typewriterMode === "true") return;
    if (
      this.snapshot &&
      (!replace || this.microtaskQueued || this.animationFrame !== null)
    ) {
      return;
    }

    this.snapshot = this.readScroll();
  }

  clearUnusedCapture() {
    if (!this.microtaskQueued && this.animationFrame === null) {
      this.snapshot = null;
    }
  }

  update(update: ViewUpdate) {
    if (!update.docChanged) {
      if (update.selectionSet) this.cancelRestore();
      return;
    }
    if (this.view.dom.dataset.typewriterMode === "true") {
      this.cancelRestore();
      return;
    }

    const editing = update.transactions.some((transaction) =>
      transaction.isUserEvent("input") || transaction.isUserEvent("delete"),
    );
    if (!editing || !this.view.hasFocus) {
      this.cancelRestore();
      return;
    }
    // Native text replacement can move the scroller before delivering input
    // events. Reading scrollTop here would remember the jump, not the viewport
    // the user chose, so fall back to the last observed scroll position.
    this.snapshot ??= this.observedScroll ?? this.readScroll();
    if (!this.snapshot || this.microtaskQueued) return;
    this.microtaskQueued = true;
    queueMicrotask(() => {
      this.microtaskQueued = false;
      if (!this.snapshot) return;
      if (this.animationFrame !== null) {
        window.cancelAnimationFrame(this.animationFrame);
      }
      this.animationFrame = window.requestAnimationFrame(() => {
        this.animationFrame = null;
        const snapshot = this.snapshot;
        this.snapshot = null;
        if (!snapshot) return;
        if (!snapshot.container.isConnected) return;
        if (!this.view.hasFocus || this.view.dom.dataset.typewriterMode === "true") return;

        // Run after the input's measurement frame. New scroll/selection intent
        // cancels this restoration, so it cannot pull navigation back.
        snapshot.container.scrollTop = snapshot.top;
        snapshot.container.scrollLeft = snapshot.left;
        revealExternalCursor(this.view, snapshot.container);
        this.observeScroll();
      });
    });
  }

  cancelRestore() {
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.snapshot = null;
  }

  destroy() {
    this.cancelRestore();
    this.observedScroll = null;
  }
}

export function codeMirrorExternalScroll(
  options: CodeMirrorExternalScrollOptions,
): Extension {
  let externalScrollView: ViewPlugin<CodeMirrorExternalScrollView>;
  externalScrollView = ViewPlugin.define<CodeMirrorExternalScrollView>(
    (view) => new CodeMirrorExternalScrollView(
      view,
      options.getScrollContainer,
    ),
    {
      eventObservers: {
        scroll(_event, view) {
          view.plugin(externalScrollView)?.observeScroll();
        },
        wheel(_event, view) {
          view.plugin(externalScrollView)?.cancelRestore();
        },
        pointerdown(_event, view) {
          view.plugin(externalScrollView)?.cancelRestore();
        },
        touchstart(_event, view) {
          view.plugin(externalScrollView)?.cancelRestore();
        },
        blur(_event, view) {
          view.plugin(externalScrollView)?.cancelRestore();
        },
        beforeinput(_event, view) {
          view.plugin(externalScrollView)?.capture();
        },
        compositionstart(_event, view) {
          view.plugin(externalScrollView)?.capture(true);
        },
        keydown(event, view) {
          if (keyMayEditDocument(event)) {
            view.plugin(externalScrollView)?.capture(true);
          }
        },
        keyup(_event, view) {
          view.plugin(externalScrollView)?.clearUnusedCapture();
        },
      },
    },
  );

  return externalScrollView.extension;
}
