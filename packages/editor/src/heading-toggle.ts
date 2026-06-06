import { headingSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export type HeadingToggleLabels = {
  collapseSection: string;
  expandSection: string;
};

type CollapsedHeadingState = {
  collapsed: readonly number[];
  // Paragraphs inserted from a collapsed heading should stay visible even though Markdown still places them in the section.
  visibleTails: readonly CollapsedHeadingVisibleTail[];
};

type CollapsedHeadingVisibleTail = {
  from: number;
  headingFrom: number;
};

type HeadingToggleMeta =
  | {
      from: number;
      type: "toggle";
    }
  | {
      from: number;
      headingFrom: number;
      type: "show-tail";
    }
  | {
      collapsed: boolean;
      type: "set-all";
    };

type TopLevelBlock = {
  from: number;
  node: ProseNode;
  to: number;
};

type HeadingSection = {
  contentFrom: number;
  from: number;
  level: number;
  node: ProseNode;
  to: number;
};

const defaultHeadingToggleLabels: HeadingToggleLabels = {
  collapseSection: "Collapse section",
  expandSection: "Expand section"
};

const emptyCollapsedHeadingState: CollapsedHeadingState = {
  collapsed: [],
  visibleTails: []
};

const headingToggleKey = new PluginKey<CollapsedHeadingState>("markra-heading-toggle");

function normalizeHeadingToggleLabels(labels: Partial<HeadingToggleLabels> | undefined): HeadingToggleLabels {
  return {
    ...defaultHeadingToggleLabels,
    ...labels
  };
}

function headingLevel(node: ProseNode) {
  const level = Number(node.attrs.level ?? 1);
  if (!Number.isFinite(level)) return 1;

  return Math.max(1, Math.min(6, Math.trunc(level)));
}

function collectTopLevelBlocks(doc: ProseNode) {
  const blocks: TopLevelBlock[] = [];

  doc.forEach((node, offset) => {
    blocks.push({
      from: offset,
      node,
      to: offset + node.nodeSize
    });
  });

  return blocks;
}

function collectHeadingSections(doc: ProseNode, heading: NodeType) {
  const blocks = collectTopLevelBlocks(doc);
  const sections: HeadingSection[] = [];

  for (const [index, block] of blocks.entries()) {
    if (block.node.type !== heading) continue;

    const level = headingLevel(block.node);
    let sectionEnd = doc.content.size;

    for (const nextBlock of blocks.slice(index + 1)) {
      if (nextBlock.node.type !== heading) continue;
      if (headingLevel(nextBlock.node) > level) continue;

      sectionEnd = nextBlock.from;
      break;
    }

    sections.push({
      contentFrom: block.to,
      from: block.from,
      level,
      node: block.node,
      to: sectionEnd
    });
  }

  return sections;
}

function collectFoldableHeadingSections(doc: ProseNode, heading: NodeType) {
  return collectHeadingSections(doc, heading).filter((section) => section.contentFrom < section.to);
}

function findHeadingStartAtPosition(state: EditorState, heading: NodeType, position: number) {
  const safePosition = Math.max(0, Math.min(position, state.doc.content.size));
  const nodeAtPosition = state.doc.nodeAt(safePosition);
  if (nodeAtPosition?.type === heading) return safePosition;

  const $position = state.doc.resolve(safePosition);
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type === heading) return $position.before(depth);
  }

  return null;
}

function normalizeCollapsedPositions(state: EditorState, heading: NodeType, positions: readonly number[]) {
  const collapsed = new Set<number>();

  for (const position of positions) {
    const headingStart = findHeadingStartAtPosition(state, heading, position);
    if (headingStart !== null) collapsed.add(headingStart);
  }

  return Array.from(collapsed).sort((left, right) => left - right);
}

function mapCollapsedPositions(
  transaction: Transaction,
  state: EditorState,
  heading: NodeType,
  positions: readonly number[]
) {
  return normalizeCollapsedPositions(
    state,
    heading,
    positions.map((position) => transaction.mapping.map(position, 1))
  );
}

function normalizeVisibleTails(
  state: EditorState,
  heading: NodeType,
  visibleTails: readonly CollapsedHeadingVisibleTail[]
) {
  const sectionByHeading = new Map(
    collectHeadingSections(state.doc, heading).map((section) => [section.from, section])
  );
  const normalized = new Map<number, number>();

  for (const visibleTail of visibleTails) {
    const headingFrom = findHeadingStartAtPosition(state, heading, visibleTail.headingFrom);
    if (headingFrom === null) continue;

    const section = sectionByHeading.get(headingFrom);
    if (!section) continue;
    if (visibleTail.from <= section.contentFrom || visibleTail.from >= section.to) continue;

    const previousFrom = normalized.get(headingFrom);
    normalized.set(
      headingFrom,
      previousFrom === undefined ? visibleTail.from : Math.min(previousFrom, visibleTail.from)
    );
  }

  return Array.from(normalized.entries())
    .map(([headingFrom, from]) => ({ from, headingFrom }))
    .sort((left, right) => left.headingFrom - right.headingFrom);
}

function mapVisibleTails(
  transaction: Transaction,
  state: EditorState,
  heading: NodeType,
  visibleTails: readonly CollapsedHeadingVisibleTail[]
) {
  return normalizeVisibleTails(
    state,
    heading,
    visibleTails.map((visibleTail) => ({
      from: transaction.mapping.map(visibleTail.from, -1),
      headingFrom: transaction.mapping.map(visibleTail.headingFrom, 1)
    }))
  );
}

function toggleCollapsedPosition(positions: readonly number[], position: number) {
  return positions.includes(position)
    ? positions.filter((collapsedPosition) => collapsedPosition !== position)
    : [...positions, position].sort((left, right) => left - right);
}

function isPlainEnter(event: KeyboardEvent) {
  return event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
}

function visibleTailByHeading(visibleTails: readonly CollapsedHeadingVisibleTail[]) {
  return new Map(visibleTails.map((visibleTail) => [visibleTail.headingFrom, visibleTail.from]));
}

function findCollapsedHeadingEnterTarget(
  state: EditorState,
  heading: NodeType,
  collapsedPositions: readonly number[],
  visibleTails: readonly CollapsedHeadingVisibleTail[]
) {
  const { selection } = state;
  if (!selection.empty) return null;

  const collapsed = new Set(collapsedPositions);
  if (collapsed.size === 0) return null;

  const visibleTailFrom = visibleTailByHeading(visibleTails);
  for (const section of collectHeadingSections(state.doc, heading)) {
    if (!collapsed.has(section.from)) continue;
    if (section.contentFrom >= section.to) continue;

    const headingEnd = section.from + section.node.nodeSize - 1;
    if (selection.from === headingEnd) {
      return {
        headingFrom: section.from,
        insertAt: visibleTailFrom.get(section.from) ?? section.to
      };
    }
  }

  return null;
}

function insertParagraphAfterCollapsedHeading(view: EditorView, heading: NodeType, event: KeyboardEvent) {
  if (!isPlainEnter(event)) return false;

  const pluginState = headingToggleKey.getState(view.state) ?? emptyCollapsedHeadingState;
  const target = findCollapsedHeadingEnterTarget(view.state, heading, pluginState.collapsed, pluginState.visibleTails);
  if (target === null) return false;

  const paragraph = view.state.schema.nodes.paragraph;
  if (!paragraph) return false;

  event.preventDefault();

  const transaction = view.state.tr
    .insert(target.insertAt, paragraph.create())
    .setMeta(headingToggleKey, {
      from: target.insertAt,
      headingFrom: target.headingFrom,
      type: "show-tail"
    } satisfies HeadingToggleMeta);
  view.dispatch(transaction.setSelection(TextSelection.create(transaction.doc, target.insertAt + 1)).scrollIntoView());
  return true;
}

function createHeadingToggleButton(
  view: EditorView,
  getHeadingFrom: () => number,
  collapsed: boolean,
  labels: HeadingToggleLabels
) {
  const button = view.dom.ownerDocument.createElement("button");
  const label = collapsed ? labels.expandSection : labels.collapseSection;

  button.type = "button";
  button.className = "markra-heading-toggle-button";
  button.contentEditable = "false";
  button.draggable = false;
  button.dataset.collapsed = String(collapsed);
  button.ariaExpanded = String(!collapsed);
  button.ariaLabel = label;
  button.title = label;

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    view.dispatch(
      view.state.tr.setMeta(headingToggleKey, {
        from: getHeadingFrom(),
        type: "toggle"
      } satisfies HeadingToggleMeta)
    );
    view.focus();
  });

  return button;
}

function buildHeadingToggleDecorations(
  doc: ProseNode,
  collapsedPositions: readonly number[],
  visibleTails: readonly CollapsedHeadingVisibleTail[],
  heading: NodeType,
  labels: HeadingToggleLabels
) {
  const sections = collectHeadingSections(doc, heading);
  const sectionByHeading = new Map(sections.map((section) => [section.from, section]));
  const collapsed = new Set(collapsedPositions.filter((position) => sectionByHeading.has(position)));
  const visibleTailFrom = visibleTailByHeading(visibleTails);
  const decorations: Decoration[] = [];

  for (const section of sections) {
    if (section.contentFrom >= section.to) continue;

    const sectionIsCollapsed = collapsed.has(section.from);
    decorations.push(
      Decoration.node(section.from, section.from + section.node.nodeSize, {
        class: "markra-heading-toggle-heading",
        "data-heading-collapsed": String(sectionIsCollapsed)
      }),
      Decoration.widget(
        section.from + 1,
        (view, getPos) =>
          createHeadingToggleButton(
            view,
            () => {
              const position = getPos();
              return typeof position === "number" ? Math.max(0, position - 1) : section.from;
            },
            sectionIsCollapsed,
            labels
          ),
        {
          ignoreSelection: true,
          key: `markra-heading-toggle-${section.from}-${sectionIsCollapsed ? "collapsed" : "expanded"}`,
          side: -1
        }
      )
    );
  }

  if (collapsed.size === 0) return DecorationSet.create(doc, decorations);

  for (const block of collectTopLevelBlocks(doc)) {
    const hiddenByCollapsedHeading = sections.some((section) => {
      if (!collapsed.has(section.from) || block.from < section.contentFrom || block.to > section.to) return false;

      const visibleFrom = visibleTailFrom.get(section.from);
      return visibleFrom === undefined || block.from < visibleFrom;
    });
    if (!hiddenByCollapsedHeading) continue;

    decorations.push(
      Decoration.node(block.from, block.to, {
        class: "markra-heading-collapsed-content"
      })
    );
  }

  return DecorationSet.create(doc, decorations);
}

export function headingSectionCollapseInfo(state: EditorState, heading: NodeType) {
  const sections = collectFoldableHeadingSections(state.doc, heading);
  const sectionByStart = new Set(sections.map((section) => section.from));
  const pluginState = headingToggleKey.getState(state) ?? emptyCollapsedHeadingState;
  const collapsed = normalizeCollapsedPositions(state, heading, pluginState.collapsed)
    .filter((position) => sectionByStart.has(position));

  return {
    collapsedCount: collapsed.length,
    totalCount: sections.length
  };
}

export function setAllHeadingSectionsCollapsed(view: EditorView, heading: NodeType, collapsed: boolean) {
  const info = headingSectionCollapseInfo(view.state, heading);
  if (info.totalCount === 0) return false;

  view.dispatch(
    view.state.tr.setMeta(headingToggleKey, {
      collapsed,
      type: "set-all"
    } satisfies HeadingToggleMeta)
  );
  view.focus();

  return true;
}

export function createHeadingTogglePlugin(heading: NodeType, labels?: Partial<HeadingToggleLabels>) {
  const resolvedLabels = normalizeHeadingToggleLabels(labels);

  return new Plugin<CollapsedHeadingState>({
    key: headingToggleKey,
    state: {
      init: () => emptyCollapsedHeadingState,
      apply(transaction, value, _oldState, newState) {
        const meta = transaction.getMeta(headingToggleKey) as HeadingToggleMeta | undefined;
        const mappedCollapsed = transaction.docChanged
          ? mapCollapsedPositions(transaction, newState, heading, value.collapsed)
          : value.collapsed;
        const mappedVisibleTails = transaction.docChanged
          ? mapVisibleTails(transaction, newState, heading, value.visibleTails)
          : value.visibleTails;

        if (!meta) {
          return mappedCollapsed === value.collapsed && mappedVisibleTails === value.visibleTails
            ? value
            : { collapsed: mappedCollapsed, visibleTails: mappedVisibleTails };
        }

        if (meta.type === "show-tail") {
          const visibleTails = normalizeVisibleTails(newState, heading, [
            ...mappedVisibleTails,
            {
              from: meta.from,
              headingFrom: meta.headingFrom
            }
          ]);

          return {
            collapsed: mappedCollapsed,
            visibleTails
          };
        }

        if (meta.type === "set-all") {
          return {
            collapsed: meta.collapsed
              ? collectFoldableHeadingSections(newState.doc, heading).map((section) => section.from)
              : [],
            visibleTails: []
          };
        }

        const headingFrom = findHeadingStartAtPosition(newState, heading, meta.from);
        if (headingFrom === null) return { collapsed: mappedCollapsed, visibleTails: mappedVisibleTails };

        const collapsed = toggleCollapsedPosition(mappedCollapsed, headingFrom);

        return {
          collapsed,
          visibleTails: mappedVisibleTails
        };
      }
    },
    props: {
      decorations: (state) => {
        const pluginState = headingToggleKey.getState(state) ?? emptyCollapsedHeadingState;
        return buildHeadingToggleDecorations(
          state.doc,
          pluginState.collapsed,
          pluginState.visibleTails,
          heading,
          resolvedLabels
        );
      },
      handleKeyDown: (view, event) => {
        return insertParagraphAfterCollapsedHeading(view, heading, event);
      }
    }
  });
}

export function markraHeadingTogglePlugin(labels?: Partial<HeadingToggleLabels>) {
  return $prose((ctx) => createHeadingTogglePlugin(headingSchema.type(ctx), labels));
}
