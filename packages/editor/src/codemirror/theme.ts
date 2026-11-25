import { EditorView } from "@codemirror/view";

export const markraTheme = EditorView.baseTheme({
  "&": {
    "--markra-task-checkbox-size": "1em",
    "--markra-task-checkbox-gap": "0.45em",
  },
  '&[data-markra-composing="true"] .cm-selectionBackground': {
    // IME pre-edit updates temporarily expose their range as a CodeMirror
    // selection. Hiding only that drawn layer prevents it from flashing.
    backgroundColor: "transparent !important",
  },
  ".cm-markra-h1": {
    fontSize: "1.8em",
    fontWeight: "700",
    lineHeight: "1.35",
  },
  ".cm-markra-h2": {
    fontSize: "1.5em",
    fontWeight: "700",
    lineHeight: "1.4",
  },
  ".cm-markra-h3": {
    fontSize: "1.25em",
    fontWeight: "650",
  },
  ".cm-markra-h4, .cm-markra-h5, .cm-markra-h6": {
    fontWeight: "650",
  },
  ".cm-markra-strong": {
    fontWeight: "700",
  },
  ".cm-markra-emphasis": {
    fontStyle: "italic",
  },
  ".cm-markra-inline-code": {
    borderRadius: "0.3em",
    backgroundColor: "color-mix(in srgb, currentColor 9%, transparent)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    padding: "0.08em 0.28em",
  },
  ".cm-markra-strikethrough": {
    textDecoration: "line-through",
  },
  ".cm-markra-link": {
    color: "#2563eb",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, currentColor 45%, transparent)",
    textUnderlineOffset: "0.16em",
  },
  '&[data-markra-link-modifier="true"] .cm-markra-link, &[data-markra-link-modifier="true"] .cm-markra-link-icon': {
    cursor: "pointer",
  },
  ".cm-markra-highlight": {
    backgroundColor: "color-mix(in srgb, #facc15 38%, transparent)",
    borderRadius: "0.16em",
    padding: "0 0.06em",
  },
  ".cm-markra-blockquote": {
    borderLeft: "0.2em solid color-mix(in srgb, currentColor 24%, transparent)",
    color: "color-mix(in srgb, currentColor 72%, transparent)",
    paddingLeft: "0.9em",
  },
  ".cm-markra-task-checkbox": {
    accentColor: "#2563eb",
    cursor: "pointer",
    height: "var(--markra-task-checkbox-size)",
    margin: "0 var(--markra-task-checkbox-gap) 0 0",
    verticalAlign: "-0.08em",
    width: "var(--markra-task-checkbox-size)",
  },
});
