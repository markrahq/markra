import { ParserReady, parserCtx } from "@milkdown/kit/core";
import { Fragment, Slice, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $proseAsync } from "@milkdown/kit/utils";

const markdownSourcePasteKey = new PluginKey("markraMarkdownSourcePaste");

const markdownSourcePatterns = [
  /(^|\n)\s{0,3}#{1,6}\s+\S/u,
  /(^|\n)\s{0,3}(?:[-+*]|\d+[.)])\s+\S/u,
  /(^|\n)\s{0,3}>\s+\S/u,
  /(^|\n)\s{0,3}(?:```|~~~)/u,
  /(^|\n)\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*($|\n)/u,
  /(^|\n)\s{0,3}\|.+\|\s*\n\s{0,3}\|(?:\s*:?-+:?\s*\|)+/u,
  /!\[[^\]\n]*\]\([^)]+\)/u,
  /(^|[\s([{])\[[^\]\n]+\]\([^)]+\)/u,
  /(^|[\s([{])\*\*[^*\n]+?\*\*/u,
  /(^|[\s([{])__[^_\n]+?__/u,
  /(^|[\s([{])`[^`\n]+?`(?!`)/u
];

function clipboardPlainText(event: ClipboardEvent) {
  return event.clipboardData?.getData("text/plain") ?? "";
}

function clipboardHasFiles(event: ClipboardEvent) {
  return Boolean(event.clipboardData?.files?.length);
}

function isStandaloneUrl(text: string) {
  return /^https?:\/\/\S+$/u.test(text.trim());
}

function looksLikeMarkdownSource(text: string) {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  const trimmedText = normalizedText.trim();
  if (!trimmedText || isStandaloneUrl(trimmedText)) return false;

  return markdownSourcePatterns.some((pattern) => pattern.test(normalizedText));
}

function inlineWhitespace(text: string) {
  return {
    leading: text.match(/^[ \t]+/u)?.[0] ?? "",
    trailing: text.match(/[ \t]+$/u)?.[0] ?? ""
  };
}

function fragmentNodes(fragment: Fragment) {
  const nodes: ProseNode[] = [];
  fragment.forEach((node) => {
    nodes.push(node);
  });
  return nodes;
}

function inlineParagraphSlice(view: EditorView, parsedDocument: ProseNode, sourceText: string) {
  const { selection } = view.state;
  if (!(selection instanceof TextSelection)) return null;
  if (!selection.$from.sameParent(selection.$to)) return null;
  if (!selection.$from.parent.inlineContent) return null;
  if (parsedDocument.childCount !== 1) return null;

  const child = parsedDocument.firstChild;
  if (!child || child.type.name !== "paragraph") return null;

  const { leading, trailing } = inlineWhitespace(sourceText);
  if (!leading && !trailing) return new Slice(child.content, 0, 0);

  const nodes = fragmentNodes(child.content);
  if (leading) nodes.unshift(view.state.schema.text(leading));
  if (trailing) nodes.push(view.state.schema.text(trailing));

  return new Slice(Fragment.fromArray(nodes), 0, 0);
}

export const markraMarkdownSourcePastePlugin = $proseAsync(async (ctx) => {
  await ctx.wait(ParserReady);
  const parseMarkdown = ctx.get(parserCtx);

  return new Plugin({
    key: markdownSourcePasteKey,
    props: {
      handlePaste(view, event) {
        if (!view.editable) return false;
        if (view.state.selection.$from.parent.type.spec.code) return false;
        if (clipboardHasFiles(event)) return false;

        const text = clipboardPlainText(event);
        if (!looksLikeMarkdownSource(text)) return false;

        let parsedDocument: ProseNode;
        try {
          parsedDocument = parseMarkdown(text);
        } catch {
          return false;
        }

        const slice = inlineParagraphSlice(view, parsedDocument, text) ?? new Slice(parsedDocument.content, 0, 0);
        event.preventDefault();
        view.dispatch(
          view.state.tr
            .replaceSelection(slice)
            .scrollIntoView()
            .setMeta("paste", true)
            .setMeta("uiEvent", "paste")
        );
        return true;
      }
    }
  });
});
