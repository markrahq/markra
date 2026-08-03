import { syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { readCodeMirrorFrontmatter } from "./frontmatter-preview.ts";

const PREFORMATTED_BLOCKS = new Set([
  "BlockMath",
  "CodeBlock",
  "FencedCode",
  "Frontmatter",
  "HTMLBlock",
]);
const frontmatterCache = new WeakMap<
  EditorState,
  ReturnType<typeof readCodeMirrorFrontmatter>
>();

function mayStartWithFrontmatter(state: EditorState) {
  const prefix = state.sliceDoc(0, 4);
  const sourceStart = prefix.charCodeAt(0) === 0xfeff
    ? prefix.slice(1)
    : prefix;
  return sourceStart.startsWith("---") ||
    sourceStart.startsWith("+++") ||
    sourceStart.startsWith("{");
}

export function isInsidePreformattedBlock(
  state: EditorState,
  position: number,
) {
  let frontmatter = frontmatterCache.get(state);
  if (frontmatter === undefined) {
    // Most documents have no frontmatter. Avoid materializing the full source
    // on every EditorState while blank-line layout is rebuilt during typing.
    frontmatter = mayStartWithFrontmatter(state)
      ? readCodeMirrorFrontmatter(state.doc.toString())
      : null;
    frontmatterCache.set(state, frontmatter);
  }
  if (
    frontmatter &&
    position >= frontmatter.contentFrom &&
    position <= frontmatter.contentTo
  ) {
    return true;
  }

  let node: ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]> | null =
    syntaxTree(state).resolveInner(position, 1);
  while (node) {
    if (PREFORMATTED_BLOCKS.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

export function moveToEditableLine(view: EditorView, position: number) {
  const boundedPosition = Math.max(0, Math.min(position, view.state.doc.length));
  view.dispatch({
    selection: EditorSelection.cursor(boundedPosition, 1),
  });
}
