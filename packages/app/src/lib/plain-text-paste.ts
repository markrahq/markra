import type { EditorView } from "@codemirror/view";
import {
  dispatchPlainTextPaste,
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
) {
  if (view.state.readOnly) return false;

  const parsedShortcut = parseMarkdownShortcut(shortcut);
  if (
    parsedShortcut?.mod &&
    parsedShortcut.shift &&
    !parsedShortcut.alt &&
    parsedShortcut.key.toLowerCase() === "v"
  ) {
    // WebKit still dispatches the native paste event after this keydown. Mark that event instead
    // of racing it with an asynchronous clipboard read, which would allow rich conversion first.
    markNextPlainTextPaste(view.contentDOM);
    return false;
  }

  try {
    Promise.resolve(readClipboardText()).then((text) => {
      // Clipboard reads resolve asynchronously; only mutate the editor that initiated the shortcut.
      if (!text || !view.contentDOM.isConnected || view.state.readOnly) return;

      dispatchPlainTextPaste(view.contentDOM, text);
    }).catch(() => {});
  } catch {
    // Consume the shortcut so a failed text read cannot fall through to rich paste.
  }

  return true;
}
