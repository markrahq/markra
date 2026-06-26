import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  type Extension,
  type Range
} from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { keyboardShortcutActions, findSearchRanges, type KeyboardShortcutAction, type SearchRange } from "@markra/shared";
import { minimalSetup } from "codemirror";

export type MarkdownVisualExtensionOptions = {
  label: string;
  onMarkdownChange: (content: string) => unknown;
  readOnly?: boolean;
};

export type MarkdownVisualReconfigureOptions = {
  label: string;
  readOnly?: boolean;
};

export type MarkdownVisualEditorCore = {
  extensions: Extension[];
  reconfigure: (options: MarkdownVisualReconfigureOptions) => Array<StateEffect<unknown>>;
};

export type MarkdownVisualImageReference = {
  alt: string;
  src: string;
};

export type MarkdownVisualInsertionPoint = {
  left: number;
  top: number;
};

export const markdownVisualSelectionHeadingLevels = [1, 2, 3, 4, 5, 6] as const;

export type MarkdownVisualSelectionHeadingLevel = typeof markdownVisualSelectionHeadingLevels[number];

export type MarkdownVisualSelectionFormattingAction =
  | "bold"
  | "bulletList"
  | "heading1"
  | "highlight"
  | "inlineCode"
  | "italic"
  | "link"
  | "orderedList"
  | "paragraph"
  | "quote"
  | "strikethrough";

export type MarkdownVisualSelectionFormattingState = {
  actions: MarkdownVisualSelectionFormattingAction[];
  headingLevel: MarkdownVisualSelectionHeadingLevel | null;
};

export type MarkdownVisualSelectionContext = {
  cursor?: number;
  from: number;
  source?: "block" | "selection";
  text: string;
  to: number;
};

export type MarkdownVisualSelectionAnchor = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type MarkdownVisualShortcutAction = Extract<
  KeyboardShortcutAction,
  | "bold"
  | "bulletList"
  | "codeBlock"
  | "heading1"
  | "heading2"
  | "heading3"
  | "image"
  | "inlineCode"
  | "italic"
  | "link"
  | "orderedList"
  | "paragraph"
  | "quote"
  | "strikethrough"
  | "table"
>;

const markdownVisualShortcutActions = new Set<MarkdownVisualShortcutAction>(
  keyboardShortcutActions.filter((action): action is MarkdownVisualShortcutAction =>
    [
      "bold",
      "bulletList",
      "codeBlock",
      "heading1",
      "heading2",
      "heading3",
      "image",
      "inlineCode",
      "italic",
      "link",
      "orderedList",
      "paragraph",
      "quote",
      "strikethrough",
      "table"
    ].includes(action)
  )
);

type MarkdownStrongRange = {
  contentFrom: number;
  contentTo: number;
  from: number;
  to: number;
};

type MarkdownHeadingRange = {
  contentFrom: number;
  contentTo: number;
  level: MarkdownVisualSelectionHeadingLevel;
  lineFrom: number;
  markerFrom: number;
};

type MarkdownTaskRange = {
  checked: boolean;
  markerFrom: number;
  markerText: string;
  markerTo: number;
  statusFrom: number;
};

function isEscapedMarkdownDelimiter(content: string, index: number) {
  let backslashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && content[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function isStrongDelimiter(content: string, index: number) {
  return (
    content[index] === "*" &&
    content[index + 1] === "*" &&
    content[index - 1] !== "*" &&
    content[index + 2] !== "*" &&
    !isEscapedMarkdownDelimiter(content, index)
  );
}

function findNextStrongDelimiter(content: string, from: number) {
  for (let index = content.indexOf("**", from); index >= 0; index = content.indexOf("**", index + 2)) {
    if (isStrongDelimiter(content, index)) return index;
  }

  return -1;
}

function findMarkdownStrongRanges(content: string) {
  const ranges: MarkdownStrongRange[] = [];

  for (
    let openingMarkerFrom = findNextStrongDelimiter(content, 0);
    openingMarkerFrom >= 0;
    openingMarkerFrom = findNextStrongDelimiter(content, openingMarkerFrom + 2)
  ) {
    const contentFrom = openingMarkerFrom + 2;
    const closingMarkerFrom = findNextStrongDelimiter(content, contentFrom);

    if (closingMarkerFrom < 0) break;

    if (closingMarkerFrom > contentFrom) {
      ranges.push({
        contentFrom,
        contentTo: closingMarkerFrom,
        from: openingMarkerFrom,
        to: closingMarkerFrom + 2
      });
    }

    openingMarkerFrom = closingMarkerFrom;
  }

  return ranges;
}

function selectionTouchesStrongRange(state: EditorState, range: MarkdownStrongRange) {
  return state.selection.ranges.some((selectionRange) => {
    if (selectionRange.empty) return selectionRange.from >= range.from && selectionRange.from <= range.to;

    return selectionRange.from <= range.to && selectionRange.to >= range.from;
  });
}

function selectionTouchesRange(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((selectionRange) => {
    if (selectionRange.empty) return selectionRange.from >= from && selectionRange.from <= to;

    return selectionRange.from <= to && selectionRange.to >= from;
  });
}

function formattingMarkerClass(active: boolean) {
  return active
    ? "markra-cm-formatting-marker markra-cm-formatting-marker-active"
    : "markra-cm-formatting-marker markra-cm-formatting-marker-hidden";
}

function normalizeMarkdownVisualHeadingLevel(value: number): MarkdownVisualSelectionHeadingLevel | null {
  return markdownVisualSelectionHeadingLevels.includes(value as MarkdownVisualSelectionHeadingLevel)
    ? value as MarkdownVisualSelectionHeadingLevel
    : null;
}

function markdownVisualLineHeadingLevel(lineText: string): MarkdownVisualSelectionHeadingLevel | null {
  const match = /^(#{1,6})(?:\s+|$)/u.exec(lineText);
  if (!match) return null;

  return normalizeMarkdownVisualHeadingLevel(match[1].length);
}

function findMarkdownHeadingRanges(state: EditorState) {
  const ranges: MarkdownHeadingRange[] = [];

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const match = /^( {0,3})(#{1,6})([ \t]+|$)/u.exec(line.text);
    if (!match) continue;

    const level = normalizeMarkdownVisualHeadingLevel(match[2].length);
    if (!level) continue;

    const markerFrom = line.from + match[1].length;
    const contentFrom = line.from + match[0].length;

    ranges.push({
      contentFrom,
      contentTo: line.to,
      level,
      lineFrom: line.from,
      markerFrom
    });
  }

  return ranges;
}

function findMarkdownTaskRangeInLine(lineFrom: number, lineText: string): MarkdownTaskRange | null {
  const match = /^( {0,3})([-*+])([ \t]+)\[([ xX])\]/u.exec(lineText);
  if (!match) return null;

  const markerFrom = lineFrom + match[1].length;
  const markerText = `${match[2]}${match[3]}[${match[4]}]`;
  const markerTo = markerFrom + markerText.length;
  const statusFrom = markerTo - 2;

  return {
    checked: match[4].toLowerCase() === "x",
    markerFrom,
    markerText,
    markerTo,
    statusFrom
  };
}

function findMarkdownTaskRanges(state: EditorState) {
  const ranges: MarkdownTaskRange[] = [];

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const range = findMarkdownTaskRangeInLine(line.from, line.text);
    if (range) ranges.push(range);
  }

  return ranges;
}

function findMarkdownTaskRangeAtPosition(state: EditorState, position: number) {
  const line = state.doc.lineAt(Math.max(0, Math.min(state.doc.length, position)));

  return findMarkdownTaskRangeInLine(line.from, line.text);
}

function toggleMarkdownTaskAtPosition(view: EditorView, markerFrom: number) {
  const range = findMarkdownTaskRangeAtPosition(view.state, markerFrom);
  if (!range || range.markerFrom !== markerFrom) return false;

  view.dispatch({
    changes: {
      from: range.statusFrom,
      insert: range.checked ? " " : "x",
      to: range.statusFrom + 1
    },
    selection: EditorSelection.cursor(range.statusFrom + 1)
  });
  view.focus();
  return true;
}

class MarkdownTaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly markerFrom: number,
    private readonly markerText: string
  ) {
    super();
  }

  eq(widget: WidgetType) {
    return widget instanceof MarkdownTaskCheckboxWidget &&
      widget.checked === this.checked &&
      widget.markerFrom === this.markerFrom &&
      widget.markerText === this.markerText;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = "markra-cm-task-marker";

    const checkbox = document.createElement("input");
    checkbox.className = "markra-cm-task-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.setAttribute("aria-label", this.checked ? "Completed task" : "Incomplete task");
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      toggleMarkdownTaskAtPosition(view, this.markerFrom);
    });

    const sourceMarker = document.createElement("span");
    sourceMarker.className = "markra-cm-task-source-marker";
    sourceMarker.setAttribute("aria-hidden", "true");
    sourceMarker.textContent = this.markerText;

    wrapper.append(checkbox, sourceMarker);
    return wrapper;
  }
}

type InlineDelimitedRange = {
  contentFrom: number;
  contentTo: number;
  markerFrom: number;
  to: number;
};

function findInlineDelimitedRanges(content: string, marker: string) {
  const ranges: InlineDelimitedRange[] = [];

  for (let opening = content.indexOf(marker); opening >= 0; opening = content.indexOf(marker, opening + marker.length)) {
    if (isEscapedMarkdownDelimiter(content, opening)) continue;

    const contentFrom = opening + marker.length;
    const closing = content.indexOf(marker, contentFrom);
    if (closing < 0) break;
    if (closing > contentFrom && !isEscapedMarkdownDelimiter(content, closing)) {
      ranges.push({
        contentFrom,
        contentTo: closing,
        markerFrom: opening,
        to: closing + marker.length
      });
    }

    opening = closing;
  }

  return ranges;
}

function findItalicDelimitedRanges(content: string) {
  const ranges: InlineDelimitedRange[] = [];

  for (let opening = content.indexOf("*"); opening >= 0; opening = content.indexOf("*", opening + 1)) {
    if (content[opening - 1] === "*" || content[opening + 1] === "*" || isEscapedMarkdownDelimiter(content, opening)) {
      continue;
    }

    for (let closing = content.indexOf("*", opening + 1); closing >= 0; closing = content.indexOf("*", closing + 1)) {
      if (content[closing - 1] === "*" || content[closing + 1] === "*" || isEscapedMarkdownDelimiter(content, closing)) {
        continue;
      }

      if (closing > opening + 1) {
        ranges.push({
          contentFrom: opening + 1,
          contentTo: closing,
          markerFrom: opening,
          to: closing + 1
        });
      }

      opening = closing;
      break;
    }
  }

  return ranges;
}

function selectionTouchesDelimitedRange(
  state: EditorState,
  range: Pick<InlineDelimitedRange, "contentFrom" | "contentTo" | "markerFrom" | "to">
) {
  return state.selection.ranges.some((selectionRange) => {
    if (selectionRange.empty) {
      return selectionRange.from >= range.contentFrom && selectionRange.from <= range.contentTo;
    }

    return selectionRange.from <= range.to && selectionRange.to >= range.markerFrom;
  });
}

function markdownVisualSelectionInlineActions(state: EditorState) {
  const content = state.doc.toString();
  const actions: MarkdownVisualSelectionFormattingAction[] = [];

  if (findMarkdownStrongRanges(content).some((range) => selectionTouchesStrongRange(state, range))) {
    actions.push("bold");
  }

  if (findItalicDelimitedRanges(content).some((range) => selectionTouchesDelimitedRange(state, range))) {
    actions.push("italic");
  }

  if (findInlineDelimitedRanges(content, "~~").some((range) => selectionTouchesDelimitedRange(state, range))) {
    actions.push("strikethrough");
  }

  if (findInlineDelimitedRanges(content, "`").some((range) => selectionTouchesDelimitedRange(state, range))) {
    actions.push("inlineCode");
  }

  if (findInlineDelimitedRanges(content, "==").some((range) => selectionTouchesDelimitedRange(state, range))) {
    actions.push("highlight");
  }

  return actions;
}

function markdownVisualSelectionLines(state: EditorState) {
  const selection = state.selection.main;
  const fromLine = state.doc.lineAt(selection.from);
  const toLine = state.doc.lineAt(selection.empty ? selection.to : Math.max(selection.from, selection.to - 1));
  const lines = [];

  for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
    lines.push(state.doc.line(lineNumber));
  }

  return lines;
}

function markdownVisualSelectionBlockActions(state: EditorState) {
  const lines = markdownVisualSelectionLines(state);
  const actions: MarkdownVisualSelectionFormattingAction[] = [];

  if (lines.every((line) => markdownVisualLineHeadingLevel(line.text) === 1)) actions.push("heading1");
  if (lines.every((line) => /^\s*>\s?/u.test(line.text))) actions.push("quote");
  if (lines.every((line) => /^\s*[-*+]\s+/u.test(line.text))) actions.push("bulletList");
  if (lines.every((line) => /^\s*\d+[.)]\s+/u.test(line.text))) actions.push("orderedList");

  return actions;
}

function removeMarkdownVisualBlockPrefix(lineText: string) {
  return lineText
    .replace(/^\s{0,3}#{1,6}(?:\s+|$)/u, "")
    .replace(/^\s{0,3}>\s?/u, "")
    .replace(/^\s{0,3}[-*+]\s+/u, "")
    .replace(/^\s{0,3}\d+[.)]\s+/u, "");
}

function replaceMarkdownVisualSelectedLines(view: EditorView, transform: (lineText: string, index: number) => string) {
  const lines = markdownVisualSelectionLines(view.state);
  const changes = lines.map((line, index) => ({
    from: line.from,
    insert: transform(line.text, index),
    to: line.to
  }));

  if (changes.every((change, index) => change.insert === lines[index].text)) return false;

  view.dispatch({
    changes,
    scrollIntoView: true
  });
  view.focus();
  return true;
}

function wrapMarkdownVisualSelection(view: EditorView, marker: string, placeholder: string) {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);
  const content = selectedText || placeholder;
  const insertedText = `${marker}${content}${marker}`;

  dispatchTextInsertion(view, insertedText, {
    from,
    selectionFromOffset: marker.length,
    selectionToOffset: marker.length + content.length,
    to
  });
  return true;
}

function mergeDeletionRanges(ranges: Array<{ from: number; to: number }>) {
  const merged: Array<{ from: number; to: number }> = [];

  for (const range of ranges.sort((left, right) => left.from - right.from)) {
    const previous = merged.at(-1);
    if (previous && previous.to >= range.from) {
      previous.to = Math.max(previous.to, range.to);
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

function buildMarkdownVisualDecorations(view: EditorView): DecorationSet {
  const content = view.state.doc.toString();
  const decorations: Array<Range<Decoration>> = [];

  for (const range of findMarkdownHeadingRanges(view.state)) {
    const markerActive = selectionTouchesRange(view.state, range.markerFrom, range.contentFrom);
    const markerClass = markerActive
      ? "markra-cm-heading-marker markra-cm-heading-marker-active"
      : "markra-cm-heading-marker markra-cm-heading-marker-hidden";

    decorations.push(
      Decoration.line({
        class: `markra-cm-heading-line markra-cm-heading-line-${range.level}`
      }).range(range.lineFrom),
      Decoration.mark({ class: markerClass }).range(range.markerFrom, range.contentFrom)
    );

    if (range.contentFrom < range.contentTo) {
      decorations.push(
        Decoration.mark({
          class: `markra-cm-heading-text markra-cm-heading-text-${range.level}`
        }).range(range.contentFrom, range.contentTo)
      );
    }
  }

  for (const range of findMarkdownTaskRanges(view.state)) {
    decorations.push(
      Decoration.replace({
        widget: new MarkdownTaskCheckboxWidget(range.checked, range.markerFrom, range.markerText)
      }).range(range.markerFrom, range.markerTo)
    );
  }

  for (const range of findMarkdownStrongRanges(content)) {
    const markerClass = formattingMarkerClass(selectionTouchesStrongRange(view.state, range));

    decorations.push(
      Decoration.mark({ class: markerClass }).range(range.from, range.contentFrom),
      Decoration.mark({ class: "markra-cm-strong-text" }).range(range.contentFrom, range.contentTo),
      Decoration.mark({ class: markerClass }).range(range.contentTo, range.to)
    );
  }

  return Decoration.set(decorations, true);
}

type MarkdownSearchDecorationState = {
  activeIndex: number;
  matches: SearchRange[];
};

const setSearchDecorationsEffect = StateEffect.define<MarkdownSearchDecorationState>();

function clampRange(range: SearchRange, documentLength: number): SearchRange {
  const from = Math.max(0, Math.min(documentLength, range.from));
  const to = Math.max(from, Math.min(documentLength, range.to));

  return { from, to };
}

function buildSearchDecorations(state: EditorState, searchState: MarkdownSearchDecorationState) {
  const decorations = searchState.matches.flatMap((match, index) => {
    const { from, to } = clampRange(match, state.doc.length);
    if (to <= from) return [];

    const currentClass = index === searchState.activeIndex
      ? "markra-cm-search-match-current markra-search-match-current"
      : "";

    return Decoration.mark({
      class: `markra-cm-search-match markra-search-match ${currentClass}`
    }).range(from, to);
  });

  return Decoration.set(decorations, true);
}

const markdownSearchDecorations = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    const mappedDecorations = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setSearchDecorationsEffect)) {
        return buildSearchDecorations(transaction.state, effect.value);
      }
    }

    return mappedDecorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

const markdownVisualDecorations = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildMarkdownVisualDecorations(view);
  }

  update(update: ViewUpdate) {
    if (!update.docChanged && !update.selectionSet) return;

    this.decorations = buildMarkdownVisualDecorations(update.view);
  }
}, {
  decorations: (plugin) => plugin.decorations
});

function markdownVisualContentAttributes(label: string, readOnly: boolean): Extension {
  return EditorView.contentAttributes.of({
    "aria-label": label,
    "aria-multiline": "true",
    "aria-readonly": readOnly ? "true" : "false",
    "data-language": "markdown",
    role: "textbox",
    spellcheck: "false"
  });
}

function markdownVisualTheme(): Extension {
  return EditorView.theme({
    "&": {
      backgroundColor: "transparent",
      color: "var(--text-primary)",
      minHeight: "calc(100vh - 176px)"
    },
    "&.cm-editor": {
      height: "auto"
    },
    "&.cm-focused": {
      outline: "none"
    },
    ".cm-activeLine": {
      backgroundColor: "transparent"
    },
    ".cm-content": {
      minHeight: "calc(100vh - 176px)",
      padding: "0",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    },
    ".cm-cursor": {
      borderLeftColor: "currentColor"
    },
    ".cm-line": {
      padding: "0"
    },
    ".cm-scroller": {
      cursor: "text",
      fontFamily: "var(--editor-font-family)",
      lineHeight: "inherit",
      overflow: "visible"
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)"
    },
    ".markra-cm-strong-text": {
      fontWeight: "700"
    },
    ".markra-cm-heading-line": {
      color: "var(--text-primary)"
    },
    ".markra-cm-heading-marker": {
      color: "var(--text-secondary)",
      fontWeight: "500"
    },
    ".markra-cm-heading-marker-active": {
      fontSize: "0.82em",
      opacity: "0.64"
    },
    ".markra-cm-heading-marker-hidden": {
      fontSize: "0",
      letterSpacing: "0",
      opacity: "0"
    },
    ".markra-cm-heading-text": {
      fontWeight: "700",
      lineHeight: "1.35"
    },
    ".markra-cm-heading-text-1": {
      fontSize: "1.75em"
    },
    ".markra-cm-heading-text-2": {
      fontSize: "1.45em"
    },
    ".markra-cm-heading-text-3": {
      fontSize: "1.25em"
    },
    ".markra-cm-heading-text-4, .markra-cm-heading-text-5, .markra-cm-heading-text-6": {
      fontSize: "1.08em"
    },
    ".markra-cm-task-marker": {
      alignItems: "center",
      display: "inline-flex",
      verticalAlign: "-0.12em"
    },
    ".markra-cm-task-checkbox": {
      accentColor: "var(--accent)",
      cursor: "pointer",
      height: "1em",
      margin: "0 0.35em 0 0",
      width: "1em"
    },
    ".markra-cm-task-source-marker": {
      fontSize: "0",
      letterSpacing: "0",
      opacity: "0"
    },
    ".markra-cm-formatting-marker": {
      color: "var(--text-secondary)",
      fontWeight: "400"
    },
    ".markra-cm-formatting-marker-active": {
      fontSize: "0.86em",
      opacity: "0.62"
    },
    ".markra-cm-formatting-marker-hidden": {
      fontSize: "0",
      letterSpacing: "0",
      opacity: "0"
    }
  });
}

export function createMarkdownVisualEditorCore({
  label,
  onMarkdownChange,
  readOnly = false
}: MarkdownVisualExtensionOptions): MarkdownVisualEditorCore {
  const contentAttributesCompartment = new Compartment();
  const editableCompartment = new Compartment();

  return {
    extensions: [
      minimalSetup,
      markdown({
        base: markdownLanguage,
        codeLanguages: []
      }),
      EditorView.lineWrapping,
      markdownVisualDecorations,
      markdownSearchDecorations,
      contentAttributesCompartment.of(markdownVisualContentAttributes(label, readOnly)),
      editableCompartment.of(EditorView.editable.of(!readOnly)),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;

        onMarkdownChange(update.state.doc.toString());
      }),
      markdownVisualTheme()
    ],
    reconfigure(options) {
      const nextReadOnly = options.readOnly ?? false;

      return [
        contentAttributesCompartment.reconfigure(
          markdownVisualContentAttributes(options.label, nextReadOnly)
        ),
        editableCompartment.reconfigure(EditorView.editable.of(!nextReadOnly))
      ];
    }
  };
}

export function markdownVisualExtensions(options: MarkdownVisualExtensionOptions): Extension[] {
  return createMarkdownVisualEditorCore(options).extensions;
}

function comparableMarkdown(markdown: string) {
  return markdown
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+$/gmu, "")
    .trim();
}

function markdownLinkText(selectedText: string) {
  const content = selectedText || "text";

  return {
    insertedText: `[${content}](https://)`,
    selectionFromOffset: `[${content}](`.length,
    selectionToOffset: `[${content}](https://`.length
  };
}

function markdownImageText(alt: string, src = "assets/image.png") {
  const escapedAlt = alt.replace(/\\/gu, "\\\\").replace(/\]/gu, "\\]");

  return {
    insertedText: `![${escapedAlt}](${src})`,
    selectionFromOffset: `![${escapedAlt}](`.length,
    selectionToOffset: `![${escapedAlt}](${src}`.length
  };
}

function dispatchTextInsertion(
  view: EditorView,
  insertedText: string,
  options: {
    from?: number;
    selectionFromOffset?: number;
    selectionToOffset?: number;
    to?: number;
  } = {}
) {
  const selection = view.state.selection.main;
  const from = options.from ?? selection.from;
  const to = options.to ?? selection.to;
  const selectionFrom = options.selectionFromOffset === undefined
    ? from + insertedText.length
    : from + options.selectionFromOffset;
  const selectionTo = options.selectionToOffset === undefined
    ? selectionFrom
    : from + options.selectionToOffset;

  view.dispatch({
    changes: {
      from,
      insert: insertedText,
      to
    },
    scrollIntoView: true,
    selection: EditorSelection.range(selectionFrom, selectionTo)
  });
  view.focus();
}

export function markdownVisualGetMarkdown(view: EditorView) {
  return view.state.doc.toString();
}

export function markdownVisualIsMarkdownEquivalent(view: EditorView, markdown: string) {
  return comparableMarkdown(markdownVisualGetMarkdown(view)) === comparableMarkdown(markdown);
}

export function markdownVisualReplaceMarkdown(view: EditorView, markdown: string) {
  if (markdownVisualIsMarkdownEquivalent(view, markdown)) return true;

  const selectionHead = Math.min(view.state.selection.main.head, markdown.length);

  view.dispatch({
    changes: {
      from: 0,
      insert: markdown,
      to: view.state.doc.length
    },
    scrollIntoView: true,
    selection: EditorSelection.cursor(selectionHead)
  });
  view.focus();
  return true;
}

export function markdownVisualInsertSnippet(
  view: EditorView,
  open: string,
  close: string,
  placeholder: string
) {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);
  const content = selectedText || placeholder;
  const insertedText = `${open}${content}${close}`;
  const cursor = selectedText ? from + insertedText.length : from + open.length + content.length;

  dispatchTextInsertion(view, insertedText, {
    from,
    selectionFromOffset: cursor - from,
    to
  });
}

export function markdownVisualInsertLink(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const selectedText = view.state.sliceDoc(from, to);
  const insertion = markdownLinkText(selectedText);

  dispatchTextInsertion(view, insertion.insertedText, {
    from,
    selectionFromOffset: insertion.selectionFromOffset,
    selectionToOffset: insertion.selectionToOffset,
    to
  });
}

export function markdownVisualInsertImage(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const alt = view.state.sliceDoc(from, to) || "alt";
  const insertion = markdownImageText(alt);

  dispatchTextInsertion(view, insertion.insertedText, {
    from,
    selectionFromOffset: insertion.selectionFromOffset,
    selectionToOffset: insertion.selectionToOffset,
    to
  });
}

export function markdownVisualInsertImages(view: EditorView, images: MarkdownVisualImageReference[]) {
  if (images.length === 0) return false;

  const insertedText = images
    .map((image) => markdownImageText(image.alt || "image", image.src).insertedText)
    .join("\n\n");

  dispatchTextInsertion(view, insertedText);
  return true;
}

export function markdownVisualInsertImagesAtPoint(
  view: EditorView,
  images: MarkdownVisualImageReference[],
  point: MarkdownVisualInsertionPoint
) {
  if (images.length === 0) return false;

  const position = view.posAtCoords({ x: point.left, y: point.top });
  if (position === null) return false;

  view.dispatch({
    selection: EditorSelection.cursor(position)
  });

  return markdownVisualInsertImages(view, images);
}

const defaultMarkdownVisualTable = [
  "|  |  |",
  "| --- | --- |",
  "|  |  |"
].join("\n");

export function markdownVisualInsertTable(view: EditorView) {
  dispatchTextInsertion(view, defaultMarkdownVisualTable);
}

export function markdownVisualGetSelectionContext(view: EditorView): MarkdownVisualSelectionContext | null {
  const selection = view.state.selection.main;

  if (!selection.empty) {
    return {
      from: selection.from,
      source: "selection",
      text: view.state.sliceDoc(selection.from, selection.to),
      to: selection.to
    };
  }

  const line = view.state.doc.lineAt(selection.head);

  return {
    cursor: selection.head,
    from: line.from,
    source: "block",
    text: line.text,
    to: line.to
  };
}

export function markdownVisualGetSelectionAnchor(view: EditorView): MarkdownVisualSelectionAnchor | null {
  const selection = view.state.selection.main;
  if (selection.empty) return null;

  const from = view.coordsAtPos(selection.from);
  const to = view.coordsAtPos(selection.to);
  if (!from && !to) return null;

  const rects = [from, to].filter((rect): rect is DOMRect => rect !== null);

  return {
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
    left: Math.min(...rects.map((rect) => rect.left)),
    right: Math.max(...rects.map((rect) => rect.right)),
    top: Math.min(...rects.map((rect) => rect.top))
  };
}

export function markdownVisualGetSelectionFormattingState(view: EditorView): MarkdownVisualSelectionFormattingState {
  const lines = markdownVisualSelectionLines(view.state);
  const headingLevels = lines.map((line) => markdownVisualLineHeadingLevel(line.text));
  const headingLevel = headingLevels.length > 0 && headingLevels.every((level) => level === headingLevels[0])
    ? headingLevels[0]
    : null;

  return {
    actions: [
      ...markdownVisualSelectionInlineActions(view.state),
      ...markdownVisualSelectionBlockActions(view.state)
    ],
    headingLevel
  };
}

export function markdownVisualSetSelectionHeadingLevel(
  view: EditorView,
  level: MarkdownVisualSelectionHeadingLevel
) {
  return replaceMarkdownVisualSelectedLines(view, (lineText) => {
    const content = removeMarkdownVisualBlockPrefix(lineText);
    return `${"#".repeat(level)} ${content}`;
  });
}

export function markdownVisualToggleSelectionHighlight(view: EditorView) {
  const selection = view.state.selection.main;
  if (selection.empty) return false;

  const content = view.state.doc.toString();
  const activeRange = findInlineDelimitedRanges(content, "==").find((range) =>
    selectionTouchesDelimitedRange(view.state, range)
  );

  if (activeRange) {
    const changes = [
      {
        from: activeRange.markerFrom,
        to: activeRange.markerFrom + 2
      },
      {
        from: activeRange.to - 2,
        to: activeRange.to
      }
    ];

    view.dispatch({
      changes,
      scrollIntoView: true,
      selection: EditorSelection.range(activeRange.contentFrom - 2, activeRange.contentTo - 2)
    });
    view.focus();
    return true;
  }

  wrapMarkdownVisualSelection(view, "==", "text");
  return true;
}

export function markdownVisualClearSelectionFormatting(view: EditorView) {
  const selection = view.state.selection.main;
  if (selection.empty) return false;

  const content = view.state.doc.toString();
  const inlineRanges = [
    ...findMarkdownStrongRanges(content).map((range) => ({
      contentFrom: range.contentFrom,
      contentTo: range.contentTo,
      markerFrom: range.from,
      markerLength: 2,
      to: range.to
    })),
    ...findItalicDelimitedRanges(content).map((range) => ({
      ...range,
      markerLength: 1
    })),
    ...findInlineDelimitedRanges(content, "~~").map((range) => ({
      ...range,
      markerLength: 2
    })),
    ...findInlineDelimitedRanges(content, "`").map((range) => ({
      ...range,
      markerLength: 1
    })),
    ...findInlineDelimitedRanges(content, "==").map((range) => ({
      ...range,
      markerLength: 2
    }))
  ].filter((range) => selectionTouchesDelimitedRange(view.state, range));

  if (inlineRanges.length === 0) return false;

  const deletedMarkers = new Map<number, { from: number; to: number }>();
  for (const range of inlineRanges) {
    deletedMarkers.set(range.markerFrom, {
      from: range.markerFrom,
      to: range.markerFrom + range.markerLength
    });
    deletedMarkers.set(range.to - range.markerLength, {
      from: range.to - range.markerLength,
      to: range.to
    });
  }

  const changes = mergeDeletionRanges(Array.from(deletedMarkers.values()));

  view.dispatch({
    changes,
    scrollIntoView: true
  });
  view.focus();
  return true;
}

export function markdownVisualRunShortcutAction(view: EditorView, action: MarkdownVisualShortcutAction) {
  if (!markdownVisualShortcutActions.has(action)) return false;

  switch (action) {
    case "bold":
      return wrapMarkdownVisualSelection(view, "**", "text");
    case "italic":
      return wrapMarkdownVisualSelection(view, "*", "text");
    case "strikethrough":
      return wrapMarkdownVisualSelection(view, "~~", "text");
    case "inlineCode":
      return wrapMarkdownVisualSelection(view, "`", "code");
    case "link":
      markdownVisualInsertLink(view);
      return true;
    case "image":
      markdownVisualInsertImage(view);
      return true;
    case "table":
      markdownVisualInsertTable(view);
      return true;
    case "heading1":
      return markdownVisualSetSelectionHeadingLevel(view, 1);
    case "heading2":
      return markdownVisualSetSelectionHeadingLevel(view, 2);
    case "heading3":
      return markdownVisualSetSelectionHeadingLevel(view, 3);
    case "paragraph":
      return replaceMarkdownVisualSelectedLines(view, (lineText) => removeMarkdownVisualBlockPrefix(lineText));
    case "quote":
      return replaceMarkdownVisualSelectedLines(view, (lineText) => `> ${removeMarkdownVisualBlockPrefix(lineText)}`);
    case "bulletList":
      return replaceMarkdownVisualSelectedLines(view, (lineText) => `- ${removeMarkdownVisualBlockPrefix(lineText)}`);
    case "orderedList":
      return replaceMarkdownVisualSelectedLines(view, (lineText, index) =>
        `${index + 1}. ${removeMarkdownVisualBlockPrefix(lineText)}`
      );
    case "codeBlock": {
      const { from, to } = view.state.selection.main;
      const selectedText = view.state.sliceDoc(from, to) || "code";
      dispatchTextInsertion(view, `\`\`\`\n${selectedText}\n\`\`\``, {
        from,
        selectionFromOffset: 4,
        selectionToOffset: 4 + selectedText.length,
        to
      });
      return true;
    }
  }
}

export function markdownVisualFindSearchMatches(
  view: EditorView,
  query: string,
  options: { caseSensitive?: boolean } = {}
): SearchRange[] {
  return findSearchRanges(view.state.doc.toString(), query, options);
}

export function markdownVisualShowSearchMatches(
  view: EditorView,
  matches: SearchRange[],
  activeIndex: number
) {
  view.dispatch({
    effects: setSearchDecorationsEffect.of({
      activeIndex,
      matches
    })
  });
}

export function markdownVisualRevealSearchMatch(view: EditorView, match: SearchRange | null | undefined) {
  if (!match) return false;

  const { from, to } = clampRange(match, view.state.doc.length);
  if (to <= from) return false;

  view.dispatch({
    effects: EditorView.scrollIntoView(from, { y: "center" }),
    selection: EditorSelection.range(from, to)
  });
  view.focus();
  return true;
}

export function markdownVisualReplaceSearchMatch(
  view: EditorView,
  match: SearchRange | null | undefined,
  replacement: string
) {
  if (!match) return false;

  const { from, to } = clampRange(match, view.state.doc.length);
  if (to <= from) return false;

  view.dispatch({
    changes: {
      from,
      insert: replacement,
      to
    },
    scrollIntoView: true,
    selection: EditorSelection.cursor(from + replacement.length)
  });
  view.focus();
  return true;
}

export function markdownVisualReplaceAllSearchMatches(
  view: EditorView,
  matches: SearchRange[],
  replacement: string
) {
  const changes = matches
    .map((match) => clampRange(match, view.state.doc.length))
    .filter((match) => match.to > match.from)
    .sort((left, right) => left.from - right.from)
    .map((match) => ({
      from: match.from,
      insert: replacement,
      to: match.to
    }));

  if (changes.length === 0) return false;

  view.dispatch({
    changes,
    scrollIntoView: true
  });
  view.focus();
  return true;
}
