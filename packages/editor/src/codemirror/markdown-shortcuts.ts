import { EditorView, keymap } from "@codemirror/view";
import {
  keyboardShortcutActions,
  matchesKeyboardShortcutEvent,
  normalizeKeyboardShortcuts,
  parseKeyboardShortcut,
  type KeyboardShortcutAction,
  type KeyboardShortcutMap,
} from "@markra/shared";
import {
  insertCodeMirrorMarkdownImage,
  insertCodeMirrorMarkdownLink,
  insertCodeMirrorMarkdownTable,
} from "./controller.ts";
import { toggleAllCodeMirrorFolds } from "./folding.ts";
import { defineMarkraPlugin, runMarkraCommand } from "./plugin.ts";
import {
  handlePendingPlainTextPasteEvent,
  isPlainTextPaste,
} from "../plain-text-paste.ts";

export interface MarkdownShortcutsPluginOptions {
  actions?: readonly KeyboardShortcutAction[];
  openSpellcheckSuggestions?: (view: EditorView) => boolean;
  pastePlainText?: (view: EditorView, shortcut: string) => boolean;
  shortcuts?: KeyboardShortcutMap;
  toggleAllFolds?: (view: EditorView) => boolean;
}

const commandByAction: Partial<Record<KeyboardShortcutAction, string>> = {
  bold: "format.bold",
  bulletList: "block.bullet-list",
  codeBlock: "block.code",
  heading1: "block.heading.1",
  heading2: "block.heading.2",
  heading3: "block.heading.3",
  inlineCode: "format.code",
  italic: "format.italic",
  orderedList: "block.ordered-list",
  paragraph: "block.paragraph",
  quote: "block.quote",
  strikethrough: "format.strikethrough",
};

function runShortcutAction(
  view: EditorView,
  action: KeyboardShortcutAction,
  options: MarkdownShortcutsPluginOptions,
  shortcut: string,
) {
  const command = commandByAction[action];
  if (command) return runMarkraCommand(view, command);

  switch (action) {
    case "image":
      return insertCodeMirrorMarkdownImage(view);
    case "link":
      return insertCodeMirrorMarkdownLink(view);
    case "pastePlainText":
      return options.pastePlainText?.(view, shortcut) ?? false;
    case "table":
      return insertCodeMirrorMarkdownTable(view);
    case "toggleAllFolds":
      return options.toggleAllFolds?.(view) ?? toggleAllCodeMirrorFolds(view);
    case "openSpellcheckSuggestions":
      return options.openSpellcheckSuggestions?.(view) ?? false;
    default:
      return false;
  }
}

function codeMirrorShortcut(shortcut: string) {
  const parts = shortcut.split("+");
  const key = parts.at(-1);
  if (key && /^[A-Z]$/u.test(key)) parts[parts.length - 1] = key.toLocaleLowerCase();
  return parts.join("-");
}

export function markdownShortcutsPlugin(
  options: MarkdownShortcutsPluginOptions = {},
) {
  const shortcuts = normalizeKeyboardShortcuts(options.shortcuts);
  const actions = options.actions ?? keyboardShortcutActions;
  const pastePlainTextEnabled = actions.includes("pastePlainText");
  const keymapActions = actions.filter((action) => action !== "pastePlainText");
  const altOnlyActions = keymapActions.filter(
    (action) => parseKeyboardShortcut(shortcuts[action])?.mod === false,
  );
  return defineMarkraPlugin({
    id: "markra.markdown-shortcuts",
    extension: [
      // macOS reports Option-modified digits and letters as generated symbols.
      // Match Alt-only shortcuts by physical code before CodeMirror's character keymap.
      EditorView.domEventHandlers({
        keydown: (event, view) => {
          if (
            pastePlainTextEnabled &&
            matchesKeyboardShortcutEvent(event, shortcuts.pastePlainText)
          ) {
            return runShortcutAction(
              view,
              "pastePlainText",
              options,
              shortcuts.pastePlainText,
            );
          }

          const action = altOnlyActions.find((candidate) =>
            matchesKeyboardShortcutEvent(event, shortcuts[candidate])
          );
          return action
            ? runShortcutAction(view, action, options, shortcuts[action])
            : false;
        },
        paste: (event, view) => {
          if (isPlainTextPaste(event)) return false;
          return handlePendingPlainTextPasteEvent(event, view.contentDOM);
        },
      }),
      keymap.of(
        keymapActions.map((action) => ({
          key: codeMirrorShortcut(shortcuts[action]),
          run: (view) =>
            runShortcutAction(view, action, options, shortcuts[action]),
        })),
      ),
    ],
  });
}
