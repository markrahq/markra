import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

const markdownEscape = /\\([!-/:-@[-`{-~])/gu;

export function isSelectionInFencedCodeBody(state: EditorState) {
  const { from, to } = state.selection.main;
  const endLine = state.doc.lineAt(to);
  const tree = ensureSyntaxTree(state, endLine.to) ?? syntaxTree(state);
  let node: SyntaxNode | null = tree.resolve(from, -1);
  while (node && node.name !== "FencedCode") node = node.parent;
  // Empty body lines may have no CodeText node, so use the fence lines as boundaries.
  if (!node || to > node.to || from <= state.doc.lineAt(node.from).to) {
    return false;
  }

  const [, closingFence] = node.getChildren("CodeMark");
  return !closingFence || endLine.number < state.doc.lineAt(closingFence.from).number;
}

export function unescapeMarkdown(value: string) {
  return value.replace(markdownEscape, "$1");
}

export function unquoteMarkdownTitle(value: string) {
  const first = value.at(0);
  const last = value.at(-1);
  if (
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === "(" && last === ")")
  ) {
    return unescapeMarkdown(value.slice(1, -1));
  }
  return unescapeMarkdown(value);
}
