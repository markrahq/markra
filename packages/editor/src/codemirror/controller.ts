import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  Transaction,
  type SelectionRange,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type {
  AiDocumentAnchor,
  AiHeadingAnchor,
  AiSelectionContext,
} from "@markra/ai";
import { getMarkdownOutline } from "@markra/markdown";
import {
  normalizedExternalAutolinkUrl,
  type SearchRange,
} from "@markra/shared";
import { findCodeMirrorMathRanges } from "./math-preview.ts";
import {
  focusVisualTableCell,
  tablePreviewEnabled,
} from "./table.ts";

export interface ReplaceCodeMirrorMarkdownOptions {
  addToHistory?: boolean;
  historyBaselineMarkdown?: string;
}

export interface CodeMirrorSearchOptions {
  caseSensitive?: boolean;
}

export interface CodeMirrorMarkdownImageReference {
  alt: string;
  src: string;
}

export interface CodeMirrorMarkdownLinkReference {
  href: string;
  label: string;
}

const aiTextBlockNames = new Set([
  "CodeBlock",
  "FencedCode",
  "Paragraph",
  "TableCell",
  "TableHeader",
]);
const headingNodePattern = /^(?:ATX|Setext)Heading([1-6])$/u;

export function comparableCodeMirrorMarkdown(markdown: string) {
  return markdown
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+$/gmu, "")
    .trim();
}

export function isCodeMirrorMarkdownEquivalent(
  view: EditorView,
  markdown: string,
) {
  return (
    comparableCodeMirrorMarkdown(view.state.doc.toString()) ===
    comparableCodeMirrorMarkdown(markdown)
  );
}

function boundedSelection(
  selection: SelectionRange,
  documentLength: number,
) {
  return EditorSelection.range(
    Math.min(selection.anchor, documentLength),
    Math.min(selection.head, documentLength),
  );
}

function replaceDocument(
  view: EditorView,
  markdown: string,
  addToHistory: boolean,
) {
  view.dispatch({
    annotations: Transaction.addToHistory.of(addToHistory),
    changes: {
      from: 0,
      insert: markdown,
      to: view.state.doc.length,
    },
    scrollIntoView: true,
    selection: boundedSelection(view.state.selection.main, markdown.length),
  });
}

export function replaceCodeMirrorMarkdown(
  view: EditorView,
  markdown: string,
  options: ReplaceCodeMirrorMarkdownOptions = {},
) {
  // Read-only protects user mutations, but the host must still be able to
  // reload or switch the document shown by an already-mounted editor.
  if (isCodeMirrorMarkdownEquivalent(view, markdown)) {
    const baseline = options.historyBaselineMarkdown;
    if (
      options.addToHistory &&
      baseline !== undefined &&
      comparableCodeMirrorMarkdown(baseline) !==
        comparableCodeMirrorMarkdown(markdown)
    ) {
      // Rebuild a missing shared-history step without recording the temporary
      // baseline itself, so one undo returns to the app's previous snapshot.
      replaceDocument(view, baseline, false);
      replaceDocument(view, markdown, true);
    }
    return true;
  }

  replaceDocument(view, markdown, options.addToHistory ?? false);
  return true;
}

function aiBlockRange(state: EditorState, position: number) {
  const tree = syntaxTree(state);
  let node = tree.resolveInner(position, position === 0 ? 1 : -1);

  while (node.parent) {
    if (aiTextBlockNames.has(node.name) || headingNodePattern.test(node.name)) {
      return { from: node.from, to: node.to };
    }
    node = node.parent;
  }

  const line = state.doc.lineAt(position);
  return { from: line.from, to: line.to };
}

export function readCodeMirrorAiSelectionContext(
  view: EditorView,
): AiSelectionContext {
  const { doc, selection } = view.state;
  const { from, to } = selection.main;

  if (from !== to) {
    return {
      cursor: to,
      ...(from === 0 && to === doc.length ? { fullDocument: true } : {}),
      from,
      source: "selection",
      text: doc.sliceString(from, to),
      to,
    };
  }

  const range = aiBlockRange(view.state, from);
  const text = doc.sliceString(range.from, range.to);
  if (!text.trim()) {
    return { cursor: from, from, text: "", to: from };
  }

  return {
    cursor: from,
    from: range.from,
    source: "block",
    text,
    to: range.to,
  };
}

export function codeMirrorSelectionIsInsideFencedCode(state: EditorState) {
  const position = state.selection.main.head;
  let node: ReturnType<typeof syntaxTree>["topNode"] | null =
    syntaxTree(state).resolveInner(position, position === 0 ? 1 : -1);
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") return true;
    node = node.parent;
  }
  return false;
}

function headingTitle(source: string, level: number, setext: boolean) {
  const titleMarkdown = setext
    ? (source.split(/\r?\n/u)[0] ?? "").trim()
    : source
        .replace(/^[ \t]{0,3}#{1,6}(?:[ \t]+|$)/u, "")
        .replace(/[ \t]+#+[ \t]*$/u, "")
        .trim();
  const outline = getMarkdownOutline(
    `${"#".repeat(level)} ${titleMarkdown}`,
  );
  return outline[0]?.title ?? titleMarkdown;
}

export function readCodeMirrorHeadingAnchors(
  state: EditorState,
): AiHeadingAnchor[] {
  const headings: AiHeadingAnchor[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      const match = headingNodePattern.exec(node.name);
      if (!match) return;

      const level = Number(match[1]);
      const source = state.sliceDoc(node.from, node.to);
      headings.push({
        from: node.from,
        level,
        title: headingTitle(source, level, node.name.startsWith("Setext")),
        to: node.to,
      });
    },
  });

  return headings;
}

export function readCodeMirrorSectionAnchors(
  state: EditorState,
): AiDocumentAnchor[] {
  const headings = readCodeMirrorHeadingAnchors(state);

  return headings.map((heading, index) => {
    let sectionEnd = state.doc.length;
    for (let nextIndex = index + 1; nextIndex < headings.length; nextIndex += 1) {
      const nextHeading = headings[nextIndex];
      if (nextHeading && nextHeading.level <= heading.level) {
        sectionEnd = nextHeading.from;
        break;
      }
    }

    return {
      description: `Section ${heading.title}`,
      from: heading.from,
      id: `section:${index}`,
      kind: "section",
      text: state.sliceDoc(heading.from, sectionEnd),
      title: heading.title,
      to: sectionEnd,
    };
  });
}

function splitTableRow(line: string) {
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const character of line.trim().replace(/^\|/u, "").replace(/\|$/u, "")) {
    if (character === "|" && !escaped) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
    escaped = character === "\\" ? !escaped : false;
  }
  cells.push(current.trim());
  return cells;
}

function tableHeaderTitle(tableMarkdown: string) {
  return splitTableRow(tableMarkdown.split(/\r?\n/u)[0] ?? "")
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");
}

export function readCodeMirrorTableAnchors(
  state: EditorState,
): AiDocumentAnchor[] {
  const headings = readCodeMirrorHeadingAnchors(state);
  const anchors: AiDocumentAnchor[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Table") return;

      const tableMarkdown = state.sliceDoc(node.from, node.to);
      const headerTitle = tableHeaderTitle(tableMarkdown);
      const currentHeading = [...headings]
        .reverse()
        .find((heading) => heading.from < node.from);
      const title = currentHeading
        ? `${currentHeading.title} table`
        : `Table: ${headerTitle}`;

      anchors.push({
        description: headerTitle
          ? `Markdown table ${title}: ${headerTitle}`
          : `Markdown table ${title}`,
        from: node.from,
        id: `table:${anchors.length}`,
        kind: "table",
        text: tableMarkdown,
        title,
        to: node.to,
      });
      return false;
    },
  });

  return anchors;
}

function searchTextMatches(
  candidate: string,
  query: string,
  caseSensitive: boolean,
) {
  return caseSensitive
    ? candidate === query
    : candidate.toLocaleLowerCase() === query.toLocaleLowerCase();
}

export function findCodeMirrorSearchMatches(
  state: EditorState,
  query: string,
  options: CodeMirrorSearchOptions = {},
): SearchRange[] {
  if (!query) return [];

  const document = state.doc.toString();
  const hiddenDisplayMath = findCodeMirrorMathRanges(state).filter(
    (range) => range.kind === "display",
  );
  const matches: SearchRange[] = [];
  let position = 0;

  while (position + query.length <= document.length) {
    const candidate = document.slice(position, position + query.length);
    const hidden = hiddenDisplayMath.some(
      (range) => position < range.to && position + query.length > range.from,
    );
    if (
      !hidden &&
      searchTextMatches(candidate, query, options.caseSensitive ?? false)
    ) {
      matches.push({ from: position, to: position + query.length });
      position += query.length;
      continue;
    }
    position += 1;
  }

  return matches;
}

function validSearchRange(
  match: SearchRange | null | undefined,
  documentLength: number,
): match is SearchRange {
  return Boolean(
    match &&
      Number.isInteger(match.from) &&
      Number.isInteger(match.to) &&
      match.from >= 0 &&
      match.from < match.to &&
      match.to <= documentLength,
  );
}

export function replaceCodeMirrorSearchMatch(
  view: EditorView,
  match: SearchRange | null | undefined,
  replacement: string,
) {
  if (
    view.state.facet(EditorState.readOnly) ||
    !validSearchRange(match, view.state.doc.length)
  ) {
    return false;
  }

  view.dispatch({
    changes: { from: match.from, insert: replacement, to: match.to },
    scrollIntoView: true,
  });
  return true;
}

export function replaceAllCodeMirrorSearchMatches(
  view: EditorView,
  matches: readonly SearchRange[],
  replacement: string,
) {
  if (view.state.facet(EditorState.readOnly)) return false;

  const valid = matches
    .filter((match) => validSearchRange(match, view.state.doc.length))
    .sort((left, right) => left.from - right.from);
  if (valid.length === 0) return false;

  const nonOverlapping: SearchRange[] = [];
  for (const match of valid) {
    const previous = nonOverlapping[nonOverlapping.length - 1];
    if (previous && match.from < previous.to) continue;
    nonOverlapping.push(match);
  }

  view.dispatch({
    changes: nonOverlapping.map((match) => ({
      from: match.from,
      insert: replacement,
      to: match.to,
    })),
    scrollIntoView: true,
  });
  return true;
}

export function insertCodeMirrorMarkdownSnippet(
  view: EditorView,
  open: string,
  close: string,
  placeholder: string,
) {
  if (view.state.facet(EditorState.readOnly)) return false;

  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to).replace(/\n/gu, " ");
  const content = selectedText || placeholder;
  const insertedText = `${open}${content}${close}`;
  const cursor = selectedText
    ? from + insertedText.length
    : from + open.length + content.length;

  view.dispatch({
    changes: { from, insert: insertedText, to },
    scrollIntoView: true,
    selection: EditorSelection.cursor(cursor),
  });
  view.focus();
  return true;
}

function escapeMarkdownLabel(label: string) {
  return label.replace(/\\/gu, "\\\\").replace(/\]/gu, "\\]");
}

export function serializeCodeMirrorMarkdownImage(reference: CodeMirrorMarkdownImageReference) {
  return `![${escapeMarkdownLabel(reference.alt || "image")}](${reference.src})`;
}

export function serializeCodeMirrorMarkdownLink(reference: CodeMirrorMarkdownLinkReference) {
  return `[${escapeMarkdownLabel(reference.label || reference.href)}](${reference.href})`;
}

function enclosingLink(state: EditorState, from: number, to: number) {
  let node: ReturnType<typeof syntaxTree>["topNode"] | null =
    syntaxTree(state).resolveInner(from, 1);
  while (node) {
    if (node.name === "Link" && node.from <= from && node.to >= to) {
      const marks = node.getChildren("LinkMark");
      const opening = marks[0];
      const closing = marks[1];
      if (!opening || !closing) return null;
      return {
        from: node.from,
        label: state.sliceDoc(opening.to, closing.from),
        to: node.to,
      };
    }
    node = node.parent;
  }
  return null;
}

export function insertCodeMirrorMarkdownLink(view: EditorView) {
  if (view.state.facet(EditorState.readOnly)) return false;

  const { from, to } = view.state.selection.main;
  const activeLink = enclosingLink(view.state, from, to);
  if (activeLink) {
    view.dispatch({
      changes: {
        from: activeLink.from,
        insert: activeLink.label,
        to: activeLink.to,
      },
      scrollIntoView: true,
      selection: EditorSelection.range(
        activeLink.from,
        activeLink.from + activeLink.label.length,
      ),
    });
    view.focus();
    return true;
  }

  const selectedText = view.state.sliceDoc(from, to);
  const href = normalizedExternalAutolinkUrl(selectedText);
  const label = href ? selectedText.trim() : selectedText || "text";
  const target = href ?? "https://";
  const insertedText = serializeCodeMirrorMarkdownLink({ href: target, label });
  const selection = selectedText
    ? EditorSelection.range(from + 1, from + 1 + label.length)
    : EditorSelection.cursor(from + 1 + label.length);

  view.dispatch({
    changes: { from, insert: insertedText, to },
    scrollIntoView: true,
    selection,
  });
  view.focus();
  return true;
}

export function insertCodeMirrorMarkdownImage(view: EditorView) {
  if (view.state.facet(EditorState.readOnly)) return false;

  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to).replace(/\n/gu, " ");
  const src = "assets/image.png";
  const insertedText = serializeCodeMirrorMarkdownImage({
    alt: selectedText || "alt",
    src,
  });
  const sourceFrom = from + insertedText.lastIndexOf("(") + 1;

  view.dispatch({
    changes: { from, insert: insertedText, to },
    scrollIntoView: true,
    selection: EditorSelection.range(sourceFrom, sourceFrom + src.length),
  });
  view.focus();
  return true;
}

export function insertCodeMirrorMarkdownImages(
  view: EditorView,
  images: readonly CodeMirrorMarkdownImageReference[],
) {
  if (
    images.length === 0 ||
    view.state.facet(EditorState.readOnly)
  ) {
    return false;
  }

  const { from, to } = view.state.selection.main;
  const insertedText = images.map(serializeCodeMirrorMarkdownImage).join("");
  view.dispatch({
    changes: { from, insert: insertedText, to },
    scrollIntoView: true,
    selection: EditorSelection.cursor(from + insertedText.length),
  });
  view.focus();
  return true;
}

export function insertCodeMirrorMarkdownLinks(
  view: EditorView,
  links: readonly CodeMirrorMarkdownLinkReference[],
) {
  if (
    links.length === 0 ||
    view.state.facet(EditorState.readOnly)
  ) {
    return false;
  }

  const { from, to } = view.state.selection.main;
  const insertedText = links.map(serializeCodeMirrorMarkdownLink).join(" ");
  view.dispatch({
    changes: { from, insert: insertedText, to },
    scrollIntoView: true,
    selection: EditorSelection.cursor(from + insertedText.length),
  });
  view.focus();
  return true;
}

const defaultMarkdownTable = [
  "|  |  |",
  "| --- | --- |",
  "|  |  |",
].join("\n");

export function insertCodeMirrorMarkdownTable(view: EditorView) {
  if (view.state.facet(EditorState.readOnly)) return false;

  const { from, to } = view.state.selection.main;
  const visualPreview = tablePreviewEnabled(view.state);
  view.dispatch({
    changes: { from, insert: defaultMarkdownTable, to },
    scrollIntoView: true,
    // A source cursor inside the table reveals the complete Markdown node.
    // Keep it at the boundary while the visual cell owns the editing focus.
    selection: EditorSelection.cursor(
      from + (visualPreview ? defaultMarkdownTable.length : 2),
    ),
  });
  view.focus();
  if (visualPreview) {
    focusVisualTableCell(view, from, -1, 0, true, 0);
  }
  return true;
}
