import {
  Prec,
  StateEffect,
  type Compartment,
} from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import type { CodeMirror } from "@replit/codemirror-vim";

export interface CodeMirrorVimLabels {
  insertHint: string;
  normalHint: string;
  previousSearchFound: string;
  previousSearchMissing: string;
  visualHint: string;
}

const defaultCodeMirrorVimLabels: CodeMirrorVimLabels = {
  insertHint: "Esc return to Normal",
  normalHint: "i/a insert · # previous match",
  previousSearchFound: "Jumped to previous “{query}” · Press i to edit",
  previousSearchMissing: "No previous “{query}” · Press i to edit",
  visualHint: "y copy · d delete",
};

let vimModulePromise:
  | Promise<typeof import("@replit/codemirror-vim")>
  | null = null;

export const codeMirrorVimModeChangedEffect = StateEffect.define<boolean>();

function isVimWordCharacter(character: string) {
  return /[\p{L}\p{N}_]/u.test(character);
}

function readVimWordAtCursor(cm: CodeMirror) {
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line);
  let from = Math.min(cursor.ch, line.length);

  // Vim's # command seeks right from punctuation (including a Markdown
  // heading marker) before choosing the word under the cursor.
  while (
    from < line.length &&
    !isVimWordCharacter(line.slice(from, from + 1))
  ) {
    from += 1;
  }

  if (from < line.length) {
    let to = from;
    while (from > 0 && isVimWordCharacter(line.slice(from - 1, from))) {
      from -= 1;
    }
    while (to < line.length && isVimWordCharacter(line.slice(to, to + 1))) {
      to += 1;
    }
    return line.slice(from, to);
  }

  from = Math.min(cursor.ch, line.length);
  while (from < line.length && /\s/u.test(line.slice(from, from + 1))) {
    from += 1;
  }
  let to = from;
  while (to < line.length && !/\s/u.test(line.slice(to, to + 1))) {
    to += 1;
  }

  return line.slice(from, to);
}

function formatVimLabel(template: string, query: string) {
  return template.replaceAll("{query}", query);
}

function createCodeMirrorVimExperience(
  getCM: (view: EditorView) => CodeMirror | null,
  labels: CodeMirrorVimLabels,
) {
  return ViewPlugin.fromClass(
    class {
      private readonly cm: CodeMirror | null;
      private destroyed = false;
      private previousSearch:
        | {
            from: number;
            query: string;
          }
        | undefined;

      constructor(view: EditorView) {
        this.cm = getCM(view);
        this.cm?.on("inputEvent", this.handleInputEvent);
        this.cm?.on("vim-keypress", this.handleKeypress);
        this.cm?.on("vim-mode-change", this.scheduleHintUpdate);
        this.cm?.on("vim-command-done", this.scheduleHintUpdate);
        this.cm?.on("dialog", this.scheduleHintUpdate);
        this.scheduleHintUpdate();
      }

      update() {
        this.scheduleHintUpdate();
      }

      destroy() {
        this.destroyed = true;
        this.cm?.off("inputEvent", this.handleInputEvent);
        this.cm?.off("vim-keypress", this.handleKeypress);
        this.cm?.off("vim-mode-change", this.scheduleHintUpdate);
        this.cm?.off("vim-command-done", this.scheduleHintUpdate);
        this.cm?.off("dialog", this.scheduleHintUpdate);
      }

      private readonly handleInputEvent = (event: {
        key?: string;
        type?: string;
      }) => {
        const cm = this.cm;
        const vimState = cm?.state.vim;
        if (
          !cm ||
          event.type !== "handleKey" ||
          event.key !== "#" ||
          !vimState ||
          vimState.insertMode ||
          vimState.visualMode
        ) {
          return;
        }

        this.previousSearch = {
          from: cm.indexFromPos(cm.getCursor()),
          query: readVimWordAtCursor(cm),
        };
      };

      private readonly handleKeypress = (key: string) => {
        const cm = this.cm;
        const previousSearch = this.previousSearch;
        this.previousSearch = undefined;

        if (cm && key === "#" && previousSearch) {
          const found =
            cm.indexFromPos(cm.getCursor()) !== previousSearch.from;
          const message = document.createElement("div");
          message.className = "cm-vim-message markra-vim-feedback";
          message.setAttribute("role", "status");
          message.textContent = formatVimLabel(
            found
              ? labels.previousSearchFound
              : labels.previousSearchMissing,
            previousSearch.query,
          );

          // This runs after Vim has completed the search, so opening our
          // notification also replaces its raw regular-expression error.
          cm.openNotification(message, {
            bottom: true,
            duration: 4_000,
          });
        }

        this.scheduleHintUpdate();
      };

      private readonly scheduleHintUpdate = () => {
        queueMicrotask(() => {
          if (this.destroyed) return;
          this.updateHint();
        });
      };

      private updateHint() {
        const cm = this.cm;
        const statusbar = cm?.state.statusbar;
        const vimState = cm?.state.vim;
        if (!cm || !statusbar || !vimState) return;

        statusbar.querySelector(".markra-vim-hint")?.remove();
        if (cm.state.dialog) return;

        const hint = document.createElement("span");
        hint.className = "markra-vim-hint";
        hint.textContent = vimState.insertMode
          ? labels.insertHint
          : vimState.visualMode
            ? labels.visualHint
            : labels.normalHint;

        statusbar.insertBefore(hint, statusbar.children.item(1));
      }
    },
  );
}

async function loadCodeMirrorVimExtension(labels: CodeMirrorVimLabels) {
  vimModulePromise ??= import("@replit/codemirror-vim");
  const { getCM, vim } = await vimModulePromise;

  return Prec.highest([
    vim({ status: true }),
    createCodeMirrorVimExperience(getCM, labels),
  ]);
}

export function codeMirrorVimNormalModeActive(view: EditorView) {
  return view.scrollDOM.classList.contains("cm-vimMode");
}

function notifyCodeMirrorVimModeChanged(view: EditorView) {
  // Vim applies its Normal-mode class while the compartment settles. Preview
  // plugins need a follow-up transaction so they read the final mode.
  view.dispatch({
    effects: codeMirrorVimModeChangedEffect.of(
      codeMirrorVimNormalModeActive(view),
    ),
  });
}

export function reconfigureCodeMirrorVimMode(
  view: EditorView,
  compartment: Compartment,
  enabled: boolean,
  labels: CodeMirrorVimLabels = defaultCodeMirrorVimLabels,
) {
  let active = true;

  if (!enabled) {
    view.dispatch({
      effects: compartment.reconfigure([]),
    });
    notifyCodeMirrorVimModeChanged(view);

    return () => {
      active = false;
    };
  }

  loadCodeMirrorVimExtension(labels)
    .then((extension) => {
      // The lazy import can finish after the preference or editor instance
      // changed.
      if (!active) return;

      view.dispatch({
        effects: compartment.reconfigure(extension),
      });
      notifyCodeMirrorVimModeChanged(view);
    })
    .catch((error: unknown) => {
      if (!active) return;
      console.error("Failed to load CodeMirror Vim mode.", error);
    });

  return () => {
    active = false;
  };
}
