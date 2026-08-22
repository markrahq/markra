import { Tree, type PartialParse } from "@lezer/common";
import { parser, type MarkdownConfig } from "@lezer/markdown";

function markdownNodeType(name: string) {
  const type = parser.nodeSet.types.find((candidate) => candidate.name === name);
  if (!type) throw new Error(`Markdown parser does not define a ${name} node.`);
  return type;
}

const paragraphType = markdownNodeType("Paragraph");

function rewriteSingleCharacterSetextHeadings(tree: Tree) {
  if (tree.type.name !== "Document") return tree;

  let changed = false;
  const children = tree.children.map((child) => {
    if (
      !(child instanceof Tree) ||
      (child.type.name !== "SetextHeading1" &&
        child.type.name !== "SetextHeading2")
    ) {
      return child;
    }

    const headerMark = child.topNode.getChild("HeaderMark");
    if (!headerMark || headerMark.to - headerMark.from !== 1) return child;

    changed = true;
    return new Tree(
      paragraphType,
      child.children,
      child.positions,
      child.length,
      child.propValues,
    );
  });

  return changed
    ? new Tree(tree.type, children, tree.positions, tree.length, tree.propValues)
    : tree;
}

function wrapSetextHeadings(inner: PartialParse): PartialParse {
  return {
    advance() {
      const tree = inner.advance();
      return tree ? rewriteSingleCharacterSetextHeadings(tree) : null;
    },
    get parsedPos() {
      return inner.parsedPos;
    },
    get stoppedAt() {
      return inner.stoppedAt;
    },
    stopAt(position) {
      inner.stopAt(position);
    },
  };
}

export const markraSetextHeading: MarkdownConfig = {
  // Keep Lezer's native Setext parser and block precedence intact. Rewriting
  // only the completed top-level tree avoids turning deindented rules into
  // nested headings while treating single-character underlines as uncommitted.
  wrap: (inner) => wrapSetextHeadings(inner),
};
