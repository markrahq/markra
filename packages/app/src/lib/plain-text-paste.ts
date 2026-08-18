import type { EditorView } from "@codemirror/view";
import { dispatchPlainTextPaste } from "@markra/editor";
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
) {
  if (view.state.readOnly) return false;

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
