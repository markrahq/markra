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
  const margin = 5;
  const delta = cursor.top < viewport.top + margin
    ? cursor.top - viewport.top - margin
    : cursor.bottom > viewport.bottom - margin
      ? cursor.bottom - viewport.bottom + margin
      : 0;
  if (delta === 0) return;

  const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = Math.max(
    0,
    Math.min(maximum, container.scrollTop + delta),
  );
}

class CodeMirrorExternalScrollView {
  private animationFrame: number | null = null;
  private microtaskQueued = false;
  private snapshot: ScrollSnapshot | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly getScrollContainer: (view: EditorView) => HTMLElement | null,
  ) {}

  capture(replace = false) {
    if (this.view.dom.dataset.typewriterMode === "true") return;
    if (
      this.snapshot &&
      (!replace || this.microtaskQueued || this.animationFrame !== null)
    ) {
      return;
    }

    const container = this.getScrollContainer(this.view);
    if (!container || container === this.view.scrollDOM) return;
    this.snapshot = {
      container,
      left: container.scrollLeft,
      top: container.scrollTop,
    };
  }

  clearUnusedCapture() {
    if (!this.microtaskQueued && this.animationFrame === null) {
      this.snapshot = null;
    }
  }

  update(update: ViewUpdate) {
    if (!update.docChanged) return;
    if (this.view.dom.dataset.typewriterMode === "true") {
      this.snapshot = null;
      return;
    }

    if (
      !this.snapshot &&
      update.transactions.some((transaction) => transaction.isUserEvent("input"))
    ) {
      this.capture();
    }
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

        snapshot.container.scrollTop = snapshot.top;
        snapshot.container.scrollLeft = snapshot.left;
        revealExternalCursor(this.view, snapshot.container);
      });
    });
  }

  destroy() {
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
    }
    this.snapshot = null;
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
      eventHandlers: {
        beforeinput(_event, view) {
          view.plugin(externalScrollView)?.capture();
          return false;
        },
        compositionstart(_event, view) {
          view.plugin(externalScrollView)?.capture(true);
          return false;
        },
        keydown(event, view) {
          if (keyMayEditDocument(event)) {
            view.plugin(externalScrollView)?.capture(true);
          }
          return false;
        },
        keyup(_event, view) {
          view.plugin(externalScrollView)?.clearUnusedCapture();
          return false;
        },
      },
    },
  );

  return externalScrollView.extension;
}
