import type { EditorView } from "@codemirror/view";
import {
  createPlainTextPasteInserter,
  markNextPlainTextPaste,
  parseMarkdownShortcut,
} from "@markra/editor";
import { getAppRuntime } from "../runtime";

export type ClipboardTextReader = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>;

export function readAppClipboardText() {
  return getAppRuntime().menu.readClipboardText();
}

export function pasteCodeMirrorPlainText(
  view: EditorView,
  readClipboardText: ClipboardTextReader,
  shortcut: string,
  options: {
    preferNativePaste?: boolean;
    suppressNextNativePaste?: boolean;
    target?: EventTarget | null;
  } = {},
) {
  if (view.state.readOnly) return false;

  const parsedShortcut = parseMarkdownShortcut(shortcut);
  const usesNativePlainTextPasteChord = parsedShortcut?.mod &&
    parsedShortcut.shift &&
    !parsedShortcut.alt &&
    parsedShortcut.key.toLowerCase() === "v";
  const preferNativePaste = options.preferNativePaste ??
    !getAppRuntime().events.isAvailable();
  if (preferNativePaste && usesNativePlainTextPasteChord) {
    markNextPlainTextPaste(view.contentDOM, "use-native-text");
    return false;
  }

  if (
    options.suppressNextNativePaste !== false &&
    usesNativePlainTextPasteChord
  ) {
    // WebKit still dispatches the native paste event after this keydown. Mark that event instead
    // so the asynchronous text read cannot race with rich conversion or produce a duplicate paste.
    markNextPlainTextPaste(view.contentDOM);
  }

  const requestedTarget = options.target instanceof HTMLElement &&
    view.contentDOM.contains(options.target)
    ? options.target
    : view.contentDOM;
  // Clipboard reads resolve after native menus or WebKit may have moved the DOM selection.
  // Capture embedded input/table destinations now so the result cannot drift to the editor root.
  const insertPlainText = createPlainTextPasteInserter(requestedTarget);

  try {
    Promise.resolve(readClipboardText()).then((text) => {
      // Clipboard reads resolve asynchronously; only mutate the editor that initiated the shortcut.
      if (
        !text ||
        !view.contentDOM.isConnected ||
        !requestedTarget.isConnected ||
        view.state.readOnly
      ) return;

      insertPlainText?.(text);
    }).catch(() => {});
  } catch {
    // Consume the shortcut so a failed text read cannot fall through to rich paste.
  }

  return true;
}
