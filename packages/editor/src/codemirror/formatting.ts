import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  EditorState,
  type ChangeSpec,
  type SelectionRange,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  defineMarkraPlugin,
  type MarkraCommand,
  type MarkraUiContribution,
} from "./plugin.ts";

export type FormattingCommandId =
  | "format.bold"
  | "format.italic"
  | "format.strikethrough"
  | "format.code"
  | "format.highlight";

export type FormattingLabels = Record<FormattingCommandId, string>;

export interface FormattingPluginOptions {
  keybindings?: boolean;
  labels?: Partial<FormattingLabels>;
}

interface FormattingSpec {
  id: FormattingCommandId;
  icon: string;
  key: string;
  marker: string;
  markerNode: string;
  node: string;
  order: number;
}

const defaultFormattingLabels: FormattingLabels = {
  "format.bold": "Bold",
  "format.italic": "Italic",
  "format.strikethrough": "Strikethrough",
  "format.code": "Inline code",
  "format.highlight": "Highlight",
};

const formattingSpecs: readonly FormattingSpec[] = [
  {
    id: "format.bold",
    icon: "bold",
    key: "Mod-b",
    marker: "**",
    markerNode: "EmphasisMark",
    node: "StrongEmphasis",
    order: 10,
  },
  {
    id: "format.italic",
    icon: "italic",
    key: "Mod-i",
    marker: "*",
    markerNode: "EmphasisMark",
    node: "Emphasis",
    order: 20,
  },
  {
    id: "format.strikethrough",
    icon: "strikethrough",
    key: "Mod-Shift-x",
    marker: "~~",
    markerNode: "StrikethroughMark",
    node: "Strikethrough",
    order: 30,
  },
  {
    id: "format.code",
    icon: "code",
    key: "Mod-e",
    marker: "`",
    markerNode: "CodeMark",
    node: "InlineCode",
    order: 40,
  },
  {
    id: "format.highlight",
    icon: "highlighter",
    key: "Mod-Shift-h",
    marker: "==",
    markerNode: "HighlightMark",
    node: "Highlight",
    order: 50,
  },
];

const clearableInlineMarkers = ["**", "~~", "==", "`", "*"] as const;

type SyntaxTreeNode = ReturnType<typeof syntaxTree>["topNode"];

function formattingMarkers(node: SyntaxTreeNode, spec: FormattingSpec) {
  const markers: Array<{ from: number; to: number }> = [];
  let child = node.firstChild;
  while (child) {
    if (child.name === spec.markerNode) {
      markers.push({ from: child.from, to: child.to });
    }
    child = child.nextSibling;
  }
  return markers;
}

function visitFormattingNodes(
  state: EditorState,
  spec: FormattingSpec,
  from: number,
  to: number,
  visit: (node: SyntaxTreeNode) => unknown,
) {
  const walk = (node: SyntaxTreeNode) => {
    if (node.to <= from || node.from >= to) return;
    if (node.name === spec.node) visit(node);

    let child = node.firstChild;
    while (child) {
      walk(child);
      child = child.nextSibling;
    }
  };

  walk(syntaxTree(state).topNode);
}

function rangeHasMarker(
  state: EditorState,
  range: SelectionRange,
  spec: FormattingSpec,
) {
  const { marker } = spec;
  if (range.from < marker.length) return false;
  if (range.to + marker.length > state.doc.length) return false;
  const hasMarker = (
    state.sliceDoc(range.from - marker.length, range.from) === marker &&
    state.sliceDoc(range.to, range.to + marker.length) === marker
  );
  if (!hasMarker) return false;

  let contained = false;
  visitFormattingNodes(state, spec, range.from, range.to, (node) => {
    if (node.from <= range.from && node.to >= range.to) contained = true;
  });
  return contained;
}

function selectionCanBeFormatted(view: EditorView) {
  return (
    !view.state.facet(EditorState.readOnly) &&
    view.state.selection.ranges.every((range) => !range.empty)
  );
}

function selectionHasMarker(view: EditorView, spec: FormattingSpec) {
  const { state } = view;
  return (
    state.selection.ranges.length > 0 &&
    state.selection.ranges.every((range) => rangeHasMarker(state, range, spec))
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

function formattingNormalization(
  state: EditorState,
  range: SelectionRange,
  spec: FormattingSpec,
) {
  const changes: ChangeSpec[] = [];
  let from = range.from;
  let to = range.to;
  visitFormattingNodes(state, spec, range.from, range.to, (node) => {
    const markers = formattingMarkers(node, spec);
    const opening = markers[0];
    const closing = markers.at(-1);
    if (
      opening &&
      closing &&
      opening.to <= range.to &&
      closing.from >= range.from
    ) {
      from = Math.min(from, node.from);
      to = Math.max(to, node.to);
      changes.push(
        { from: opening.from, to: opening.to },
        { from: closing.from, to: closing.to },
      );
    }
  });

  return { changes, from, to };
}

function toggleMarker(view: EditorView, spec: FormattingSpec) {
  if (!selectionCanBeFormatted(view)) return false;

  const { state } = view;
  const { marker } = spec;
  const removeMarker = selectionHasMarker(view, spec);
  const changes: ChangeSpec[] = [];

  for (const range of state.selection.ranges) {
    if (removeMarker) {
      changes.push(
        { from: range.from - marker.length, to: range.from },
        { from: range.to, to: range.to + marker.length },
      );
    } else if (!rangeHasMarker(state, range, spec)) {
      const normalization = formattingNormalization(state, range, spec);
      // Mixed selections must first collapse same-format spans. Otherwise the
      // new outer wrapper only gets removed on the next toggle and the original
      // formatting survives. Syntax nodes keep literal marker text untouched.
      changes.push(
        { from: normalization.from, insert: marker },
        ...normalization.changes,
        { from: normalization.to, insert: marker },
      );
    }
  }

  const changeSet = state.changes(changes);
  const selection = EditorSelection.create(
    state.selection.ranges.map((range) =>
      mappedSelectionRange(
        range,
        changeSet.mapPos(range.from, 1),
        changeSet.mapPos(range.to, -1),
      ),
    ),
    state.selection.mainIndex,
  );

  view.dispatch({ changes: changeSet, selection, userEvent: "input" });
  return true;
}

function formattingCommand(
  spec: FormattingSpec,
  labels: FormattingLabels,
  keybindings: boolean,
): MarkraCommand {
  return {
    id: spec.id,
    label: labels[spec.id],
    keybindings: keybindings
      ? [{ key: spec.key, preventDefault: true }]
      : undefined,
    isActive: (view) => selectionHasMarker(view, spec),
    isEnabled: selectionCanBeFormatted,
    run: (view) => toggleMarker(view, spec),
  };
}

function formattingUi(spec: FormattingSpec): MarkraUiContribution {
  return {
    command: spec.id,
    group: "format",
    icon: spec.icon,
    order: spec.order,
    placement: "selection-toolbar",
  };
}

export function formattingPlugin(options: FormattingPluginOptions = {}) {
  const labels = { ...defaultFormattingLabels, ...options.labels };
  const keybindings = options.keybindings ?? true;

  return defineMarkraPlugin({
    id: "markra.formatting",
    commands: formattingSpecs.map((spec) =>
      formattingCommand(spec, labels, keybindings)),
    ui: formattingSpecs.map(formattingUi),
  });
}

function enclosingLinkLabel(
  state: EditorState,
  from: number,
  to: number,
) {
  let node: ReturnType<typeof syntaxTree>["topNode"] | null =
    syntaxTree(state).resolveInner(from, 1);
  while (node) {
    if (node.name === "Link" && node.from <= from && node.to >= to) {
      const marks: Array<{ from: number; to: number }> = [];
      let child = node.firstChild;
      while (child) {
        if (child.name === "LinkMark") {
          marks.push({ from: child.from, to: child.to });
        }
        child = child.nextSibling;
      }
      if (marks.length >= 2) {
        return {
          from: marks[0]?.to ?? node.from,
          linkFrom: node.from,
          linkTo: node.to,
          to: marks[1]?.from ?? node.to,
        };
      }
    }
    node = node.parent;
  }
  return null;
}

/**
 * Removes source markers that exactly wrap the current selections. Walking
 * outwards is important: nested Markdown such as `**==text==**` cannot be
 * cleared correctly by inspecting only the markers immediately beside text.
 */
export function clearCodeMirrorSelectionFormatting(view: EditorView) {
  if (!selectionCanBeFormatted(view)) return false;

  const { state } = view;
  const changes: ChangeSpec[] = [];
  const seenChanges = new Set<string>();
  const addChange = (from: number, to: number) => {
    const key = `${from}:${to}`;
    if (from >= to || seenChanges.has(key)) return;
    seenChanges.add(key);
    changes.push({ from, to });
  };

  for (const range of state.selection.ranges) {
    let outerFrom = range.from;
    let outerTo = range.to;
    let foundMarker = true;

    while (foundMarker) {
      foundMarker = false;
      for (const marker of clearableInlineMarkers) {
        const markerLength = marker.length;
        if (
          outerFrom >= markerLength &&
          outerTo + markerLength <= state.doc.length &&
          state.sliceDoc(outerFrom - markerLength, outerFrom) === marker &&
          state.sliceDoc(outerTo, outerTo + markerLength) === marker
        ) {
          addChange(outerFrom - markerLength, outerFrom);
          addChange(outerTo, outerTo + markerLength);
          outerFrom -= markerLength;
          outerTo += markerLength;
          foundMarker = true;
          break;
        }
      }
    }

    const link = enclosingLinkLabel(state, outerFrom, outerTo);
    if (link && link.from === outerFrom && link.to === outerTo) {
      addChange(link.linkFrom, link.from);
      addChange(link.to, link.linkTo);
    }
  }

  if (changes.length === 0) return false;
  const changeSet = state.changes(
    changes.sort((left, right) => {
      const leftFrom = "from" in left ? left.from : 0;
      const rightFrom = "from" in right ? right.from : 0;
      return leftFrom - rightFrom;
    }),
  );
  const selection = EditorSelection.create(
    state.selection.ranges.map((range) =>
      mappedSelectionRange(
        range,
        changeSet.mapPos(range.from, -1),
        changeSet.mapPos(range.to, 1),
      ),
    ),
    state.selection.mainIndex,
  );

  view.dispatch({
    changes: changeSet,
    scrollIntoView: true,
    selection,
    userEvent: "input",
  });
  view.focus();
  return true;
}
