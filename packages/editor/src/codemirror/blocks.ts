import {
  EditorSelection,
  EditorState,
  type ChangeSpec,
  type SelectionRange,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { insertCodeMirrorMarkdownTable } from "./controller.ts";
import {
  defineMarkraPlugin,
  type MarkraCommand,
  type MarkraCommandContext,
  type MarkraUiContribution,
} from "./plugin.ts";
import { headingLevelControlExtension } from "./heading-level.ts";

export type BlockCommandId =
  | "block.paragraph"
  | "block.heading.1"
  | "block.heading.2"
  | "block.heading.3"
  | "block.heading.4"
  | "block.heading.5"
  | "block.heading.6"
  | "block.bullet-list"
  | "block.task-list"
  | "block.ordered-list"
  | "block.quote"
  | "block.callout"
  | "block.code"
  | "block.table";

export type BlockLabels = Record<BlockCommandId, string>;

export interface BlocksPluginOptions {
  callout?: boolean;
  headingLevelLabel?: string;
  keybindings?: boolean;
  labels?: Partial<BlockLabels>;
}

interface BlockSpec {
  id: BlockCommandId;
  icon: string;
  key?: string;
  keywords: readonly string[];
  order: number;
}

interface SelectedLine {
  from: number;
  number: number;
  text: string;
  to: number;
}

const defaultBlockLabels: BlockLabels = {
  "block.paragraph": "Paragraph",
  "block.heading.1": "Heading 1",
  "block.heading.2": "Heading 2",
  "block.heading.3": "Heading 3",
  "block.heading.4": "Heading 4",
  "block.heading.5": "Heading 5",
  "block.heading.6": "Heading 6",
  "block.bullet-list": "Bullet list",
  "block.task-list": "Task list",
  "block.ordered-list": "Numbered list",
  "block.quote": "Quote",
  "block.callout": "Callout",
  "block.code": "Code block",
  "block.table": "Table",
};

const blockSpecs: readonly BlockSpec[] = [
  {
    id: "block.paragraph",
    icon: "pilcrow",
    key: "Mod-Alt-0",
    keywords: ["paragraph", "text", "正文", "段落"],
    order: 10,
  },
  {
    id: "block.heading.1",
    icon: "heading-1",
    key: "Mod-Alt-1",
    keywords: ["heading", "title", "h1", "标题", "一级标题"],
    order: 20,
  },
  {
    id: "block.heading.2",
    icon: "heading-2",
    key: "Mod-Alt-2",
    keywords: ["heading", "subtitle", "h2", "标题", "二级标题"],
    order: 30,
  },
  {
    id: "block.heading.3",
    icon: "heading-3",
    key: "Mod-Alt-3",
    keywords: ["heading", "subtitle", "h3", "标题", "三级标题"],
    order: 40,
  },
  {
    id: "block.heading.4",
    icon: "heading-4",
    key: "Mod-Alt-4",
    keywords: ["heading", "subtitle", "h4", "标题", "四级标题"],
    order: 50,
  },
  {
    id: "block.heading.5",
    icon: "heading-5",
    key: "Mod-Alt-5",
    keywords: ["heading", "subtitle", "h5", "标题", "五级标题"],
    order: 60,
  },
  {
    id: "block.heading.6",
    icon: "heading-6",
    key: "Mod-Alt-6",
    keywords: ["heading", "subtitle", "h6", "标题", "六级标题"],
    order: 70,
  },
  {
    id: "block.bullet-list",
    icon: "list",
    key: "Mod-Shift-8",
    keywords: ["bullet", "unordered", "list", "项目符号", "列表"],
    order: 80,
  },
  {
    id: "block.task-list",
    icon: "list-checks",
    keywords: [
      "task",
      "todo",
      "checkbox",
      "checklist",
      "任务",
      "待办",
      "复选框",
    ],
    order: 90,
  },
  {
    id: "block.ordered-list",
    icon: "list-ordered",
    key: "Mod-Shift-7",
    keywords: ["numbered", "ordered", "list", "编号", "有序列表"],
    order: 100,
  },
  {
    id: "block.quote",
    icon: "text-quote",
    key: "Mod-Shift-b",
    keywords: ["quote", "blockquote", "引用"],
    order: 110,
  },
  {
    id: "block.callout",
    icon: "message-square-warning",
    keywords: [
      "alert",
      "note",
      "info",
      "tip",
      "warning",
      "caution",
      "danger",
      "important",
      "提示",
      "警告",
    ],
    order: 115,
  },
  {
    id: "block.code",
    icon: "square-code",
    key: "Mod-Alt-c",
    keywords: ["code", "fence", "代码", "代码块"],
    order: 120,
  },
  {
    id: "block.table",
    icon: "table-2",
    keywords: ["table", "grid", "表格"],
    order: 130,
  },
];

const headingPattern = /^([\t ]{0,3})#{1,6}[\t ]+/;
const taskPattern = /^([\t ]*)[-+*][\t ]+\[[ xX]\](?:[\t ]+|$)/;
const bulletPattern =
  /^([\t ]*)[-+*][\t ]+(?!\[[ xX]\](?:[\t ]+|$))/;
const orderedPattern = /^([\t ]*)\d+[.)][\t ]+/;
const listPattern =
  /^([\t ]*)(?:[-+*][\t ]+\[[ xX]\](?:[\t ]+|$)|[-+*][\t ]+|\d+[.)][\t ]+)/;
const quotePattern = /^([\t ]*)>[\t ]?/;
const openingFencePattern = /^[\t ]*```[^`]*$/;
const closingFencePattern = /^[\t ]*```[\t ]*$/;

function isEditable(view: EditorView) {
  return !view.state.facet(EditorState.readOnly);
}

function selectionEnd(state: EditorState, range: SelectionRange) {
  if (range.empty) return range.to;
  const endLine = state.doc.lineAt(range.to);
  // A selection ending at the next line's start visually belongs to the
  // preceding lines; including that next line would unexpectedly reformat it.
  return endLine.from === range.to ? range.to - 1 : range.to;
}

function selectedLines(state: EditorState): SelectedLine[] {
  const numbers = new Set<number>();

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(selectionEnd(state, range)).number;
    for (let number = first; number <= last; number += 1) numbers.add(number);
  }

  return [...numbers]
    .sort((left, right) => left - right)
    .map((number) => state.doc.line(number));
}

function dispatchLineChanges(view: EditorView, changes: readonly ChangeSpec[]) {
  if (changes.length === 0) return false;

  const { state } = view;
  const changeSet = state.changes(changes);
  const selection = EditorSelection.create(
    state.selection.ranges.map((range) => {
      // Map the leading edge after inserted Markdown markers and the trailing
      // edge before them so the user's content—not syntax—stays selected.
      const from = changeSet.mapPos(range.from, 1);
      const to = changeSet.mapPos(range.to, range.empty ? 1 : -1);
      return mappedSelectionRange(range, from, to);
    }),
    state.selection.mainIndex,
  );
  view.dispatch({
    changes: changeSet,
    selection,
    userEvent: "input",
  });
  return true;
}

function markerChange(
  line: SelectedLine,
  pattern: RegExp,
  marker: string,
): ChangeSpec {
  const match = pattern.exec(line.text);
  const indent = match?.[1] ?? /^([\t ]*)/.exec(line.text)?.[1] ?? "";
  const markerFrom = line.from + indent.length;
  const markerTo = match ? line.from + match[0].length : markerFrom;
  return { from: markerFrom, to: markerTo, insert: marker };
}

function everyLineMatches(view: EditorView, pattern: RegExp) {
  const lines = selectedLines(view.state);
  return lines.length > 0 && lines.every((line) => pattern.test(line.text));
}

function setHeading(view: EditorView, level: 1 | 2 | 3 | 4 | 5 | 6) {
  if (!isEditable(view)) return false;
  const lines = selectedLines(view.state);
  const exactPattern = new RegExp(`^[\\t ]{0,3}#{${level}}[\\t ]+`);
  const removeHeading = lines.every((line) => exactPattern.test(line.text));
  const changes = lines.map((line) => {
    const match = headingPattern.exec(line.text);
    const indent = match?.[1] ?? /^[\t ]{0,3}/.exec(line.text)?.[0] ?? "";
    return {
      from: line.from,
      to: match ? line.from + match[0].length : line.from + indent.length,
      insert: removeHeading ? indent : `${indent}${"#".repeat(level)} `,
    };
  });
  return dispatchLineChanges(view, changes);
}

function setParagraph(view: EditorView) {
  if (!isEditable(view)) return false;
  const changes: ChangeSpec[] = [];

  for (const line of selectedLines(view.state)) {
    const match = headingPattern.exec(line.text);
    if (!match) continue;
    changes.push({
      from: line.from,
      to: line.from + match[0].length,
      insert: match[1],
    });
  }

  return dispatchLineChanges(view, changes);
}

function toggleQuote(view: EditorView) {
  if (!isEditable(view)) return false;
  const lines = selectedLines(view.state);
  const remove = lines.every((line) => quotePattern.test(line.text));
  const changes = lines.flatMap((line) => {
    const match = quotePattern.exec(line.text);
    if (remove && match) {
      return [
        {
          from: line.from + (match[1]?.length ?? 0),
          to: line.from + match[0].length,
        },
      ];
    }
    if (match) return [];
    return [markerChange(line, quotePattern, "> ")];
  });
  return dispatchLineChanges(view, changes);
}

function toggleList(view: EditorView, ordered: boolean) {
  if (!isEditable(view)) return false;
  const lines = selectedLines(view.state);
  const targetPattern = ordered ? orderedPattern : bulletPattern;
  const remove = lines.every((line) => targetPattern.test(line.text));
  const changes = lines.map((line, index) => {
    if (remove) return markerChange(line, targetPattern, "");
    return markerChange(line, listPattern, ordered ? `${index + 1}. ` : "- ");
  });
  return dispatchLineChanges(view, changes);
}

function toggleTaskList(view: EditorView) {
  if (!isEditable(view)) return false;
  const lines = selectedLines(view.state);
  const remove = lines.every((line) => taskPattern.test(line.text));
  const changes = lines.map((line) =>
    markerChange(
      line,
      remove ? taskPattern : listPattern,
      remove ? "" : "- [ ] ",
    ),
  );
  return dispatchLineChanges(view, changes);
}

function codeBlockBounds(view: EditorView) {
  if (view.state.selection.ranges.length !== 1) return undefined;
  const range = view.state.selection.main;
  const first = view.state.doc.lineAt(range.from);
  const last = view.state.doc.lineAt(selectionEnd(view.state, range));
  return { first, last, range };
}

function isCodeBlockActive(view: EditorView) {
  const bounds = codeBlockBounds(view);
  if (!bounds || bounds.first.number === 1) return false;
  if (bounds.last.number === view.state.doc.lines) return false;
  return (
    openingFencePattern.test(
      view.state.doc.line(bounds.first.number - 1).text,
    ) &&
    closingFencePattern.test(
      view.state.doc.line(bounds.last.number + 1).text,
    )
  );
}

function mappedSelectionRange(
  range: SelectionRange,
  from: number,
  to: number,
) {
  return range.anchor <= range.head
    ? EditorSelection.range(from, to)
    : EditorSelection.range(to, from);
}

function toggleCodeBlock(view: EditorView) {
  if (!isEditable(view)) return false;
  const bounds = codeBlockBounds(view);
  if (!bounds) return false;

  const active = isCodeBlockActive(view);
  const changes: ChangeSpec[] = active
    ? [
        {
          from: view.state.doc.line(bounds.first.number - 1).from,
          to: bounds.first.from,
        },
        {
          from: bounds.last.to,
          to: view.state.doc.line(bounds.last.number + 1).to,
        },
      ]
    : [
        { from: bounds.first.from, insert: "```\n" },
        { from: bounds.last.to, insert: "\n```" },
      ];
  const changeSet = view.state.changes(changes);
  const from = changeSet.mapPos(bounds.range.from, active ? -1 : 1);
  const to = changeSet.mapPos(bounds.range.to, active ? 1 : -1);
  const selection = mappedSelectionRange(bounds.range, from, to);

  view.dispatch({ changes: changeSet, selection, userEvent: "input" });
  return true;
}

function calloutTypeFromQuery(query = "") {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return "NOTE";
  if ("tip".startsWith(normalized)) return "TIP";
  if ("warning".startsWith(normalized) || normalized.startsWith("warn")) {
    return "WARNING";
  }
  if ("caution".startsWith(normalized) || "danger".startsWith(normalized)) {
    return "CAUTION";
  }
  if ("important".startsWith(normalized)) return "IMPORTANT";
  return "NOTE";
}

function insertCalloutBlock(
  view: EditorView,
  context?: MarkraCommandContext,
) {
  if (!isEditable(view) || view.state.selection.ranges.length !== 1) {
    return false;
  }

  const { from, to } = view.state.selection.main;
  const markdown = `> [!${calloutTypeFromQuery(context?.query)}]\n> `;
  view.dispatch({
    changes: { from, insert: markdown, to },
    scrollIntoView: true,
    selection: EditorSelection.cursor(from + markdown.length),
    userEvent: "input",
  });
  view.focus();
  return true;
}

function blockCommand(
  spec: BlockSpec,
  labels: BlockLabels,
  keybindings: boolean,
): MarkraCommand {
  const shared = {
    id: spec.id,
    isEnabled: isEditable,
    keybindings: keybindings && spec.key
      ? [{ key: spec.key, preventDefault: true }]
      : undefined,
    label: labels[spec.id],
  };

  switch (spec.id) {
    case "block.paragraph":
      return {
        ...shared,
        isActive: (view) => !everyLineMatches(view, headingPattern),
        run: setParagraph,
      };
    case "block.heading.1":
      return {
        ...shared,
        isActive: (view) => everyLineMatches(view, /^[\t ]{0,3}#[\t ]+/),
        run: (view) => setHeading(view, 1),
      };
    case "block.heading.2":
      return {
        ...shared,
        isActive: (view) => everyLineMatches(view, /^[\t ]{0,3}##[\t ]+/),
        run: (view) => setHeading(view, 2),
      };
    case "block.heading.3":
      return {
        ...shared,
        isActive: (view) => everyLineMatches(view, /^[\t ]{0,3}###[\t ]+/),
        run: (view) => setHeading(view, 3),
      };
    case "block.heading.4":
      return {
        ...shared,
        isActive: (view) => everyLineMatches(view, /^[\t ]{0,3}####[\t ]+/),
        run: (view) => setHeading(view, 4),
      };
    case "block.heading.5":
      return {
        ...shared,
        isActive: (view) => everyLineMatches(view, /^[\t ]{0,3}#####[\t ]+/),
        run: (view) => setHeading(view, 5),
      };
    case "block.heading.6":
      return {
        ...shared,
        isActive: (view) => everyLineMatches(view, /^[\t ]{0,3}######[\t ]+/),
        run: (view) => setHeading(view, 6),
      };
    case "block.bullet-list":
      return {
        ...shared,
        isActive: (view) => everyLineMatches(view, bulletPattern),
        run: (view) => toggleList(view, false),
      };
    case "block.task-list":
      return {
        ...shared,
        isActive: (view) => everyLineMatches(view, taskPattern),
        run: toggleTaskList,
      };
    case "block.ordered-list":
      return {
        ...shared,
        isActive: (view) => everyLineMatches(view, orderedPattern),
        run: (view) => toggleList(view, true),
      };
    case "block.quote":
      return {
        ...shared,
        isActive: (view) => everyLineMatches(view, quotePattern),
        run: toggleQuote,
      };
    case "block.callout":
      return {
        ...shared,
        isEnabled: (view) =>
          isEditable(view) && view.state.selection.ranges.length === 1,
        run: insertCalloutBlock,
      };
    case "block.code":
      return {
        ...shared,
        isActive: isCodeBlockActive,
        isEnabled: (view) => isEditable(view) && view.state.selection.ranges.length === 1,
        run: toggleCodeBlock,
      };
    case "block.table":
      return {
        ...shared,
        isEnabled: (view) =>
          isEditable(view) && view.state.selection.ranges.length === 1,
        run: insertCodeMirrorMarkdownTable,
      };
  }
}

function blockUi(spec: BlockSpec): MarkraUiContribution {
  return {
    command: spec.id,
    group: "block",
    icon: spec.icon,
    keywords: spec.keywords,
    order: spec.order,
    placement: "slash-menu",
  };
}

export function blocksPlugin(options: BlocksPluginOptions = {}) {
  const labels = { ...defaultBlockLabels, ...options.labels };
  const keybindings = options.keybindings ?? true;
  const specs = blockSpecs.filter(
    (spec) => spec.id !== "block.callout" || (options.callout ?? true),
  );

  return defineMarkraPlugin({
    id: "markra.blocks",
    extension: headingLevelControlExtension(
      labels,
      options.headingLevelLabel ?? "Heading level",
    ),
    commands: specs.map((spec) =>
      blockCommand(spec, labels, keybindings)),
    ui: specs.map(blockUi),
  });
}
