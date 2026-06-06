import {
  bulletListSchema,
  listItemSchema,
  orderedListSchema
} from "@milkdown/kit/preset/commonmark";
import type { Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export type ListToggleLabels = {
  collapseListItem: string;
  expandListItem: string;
};

type CollapsedListState = {
  collapsed: readonly number[];
};

type ListToggleMeta = {
  from: number;
  type: "toggle";
} | {
  collapsed: boolean;
  type: "set-all";
};

type ListRange = {
  from: number;
  to: number;
};

type CollapsibleListItem = {
  from: number;
  nestedLists: ListRange[];
  node: ProseNode;
  to: number;
};

const defaultListToggleLabels: ListToggleLabels = {
  collapseListItem: "Collapse list item",
  expandListItem: "Expand list item"
};

const emptyCollapsedListState: CollapsedListState = {
  collapsed: []
};

const listToggleKey = new PluginKey<CollapsedListState>("markra-list-toggle");

function normalizeListToggleLabels(labels: Partial<ListToggleLabels> | undefined): ListToggleLabels {
  return {
    ...defaultListToggleLabels,
    ...labels
  };
}

function isListNode(node: ProseNode, bulletList: NodeType, orderedList: NodeType) {
  return node.type === bulletList || node.type === orderedList;
}

function collectCollapsibleListItems(
  doc: ProseNode,
  listItem: NodeType,
  bulletList: NodeType,
  orderedList: NodeType
) {
  const items: CollapsibleListItem[] = [];

  doc.descendants((node, position) => {
    if (node.type !== listItem) return true;

    const nestedLists: ListRange[] = [];
    node.forEach((child, offset) => {
      if (!isListNode(child, bulletList, orderedList)) return;

      const from = position + 1 + offset;
      nestedLists.push({
        from,
        to: from + child.nodeSize
      });
    });

    if (nestedLists.length > 0) {
      items.push({
        from: position,
        nestedLists,
        node,
        to: position + node.nodeSize
      });
    }

    return true;
  });

  return items;
}

function findListItemStartAtPosition(state: EditorState, listItem: NodeType, position: number) {
  const safePosition = Math.max(0, Math.min(position, state.doc.content.size));
  const nodeAtPosition = state.doc.nodeAt(safePosition);
  if (nodeAtPosition?.type === listItem) return safePosition;

  const $position = state.doc.resolve(safePosition);
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type === listItem) return $position.before(depth);
  }

  return null;
}

function normalizeCollapsedPositions(state: EditorState, listItem: NodeType, positions: readonly number[]) {
  const collapsed = new Set<number>();

  for (const position of positions) {
    const listItemStart = findListItemStartAtPosition(state, listItem, position);
    if (listItemStart !== null) collapsed.add(listItemStart);
  }

  return Array.from(collapsed).sort((left, right) => left - right);
}

function mapCollapsedPositions(
  transaction: Transaction,
  state: EditorState,
  listItem: NodeType,
  positions: readonly number[]
) {
  return normalizeCollapsedPositions(
    state,
    listItem,
    positions.map((position) => transaction.mapping.map(position, 1))
  );
}

function toggleCollapsedPosition(positions: readonly number[], position: number) {
  return positions.includes(position)
    ? positions.filter((collapsedPosition) => collapsedPosition !== position)
    : [...positions, position].sort((left, right) => left - right);
}

function createListToggleButton(
  view: EditorView,
  getListItemFrom: () => number,
  collapsed: boolean,
  labels: ListToggleLabels
) {
  const button = view.dom.ownerDocument.createElement("button");
  const label = collapsed ? labels.expandListItem : labels.collapseListItem;

  button.type = "button";
  button.className = "markra-list-toggle-button";
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
      view.state.tr.setMeta(listToggleKey, {
        from: getListItemFrom(),
        type: "toggle"
      } satisfies ListToggleMeta)
    );
    view.focus();
  });

  return button;
}

function buildListToggleDecorations(
  doc: ProseNode,
  collapsedPositions: readonly number[],
  listItem: NodeType,
  bulletList: NodeType,
  orderedList: NodeType,
  labels: ListToggleLabels
) {
  const items = collectCollapsibleListItems(doc, listItem, bulletList, orderedList);
  const itemByStart = new Map(items.map((item) => [item.from, item]));
  const collapsed = new Set(collapsedPositions.filter((position) => itemByStart.has(position)));
  const decorations: Decoration[] = [];

  for (const item of items) {
    const itemIsCollapsed = collapsed.has(item.from);
    decorations.push(
      Decoration.node(item.from, item.to, {
        class: "markra-list-toggle-item",
        "data-list-collapsed": String(itemIsCollapsed)
      }),
      Decoration.widget(
        item.from + 1,
        (view, getPos) =>
          createListToggleButton(
            view,
            () => {
              const position = getPos();
              if (typeof position !== "number") return item.from;

              return findListItemStartAtPosition(view.state, listItem, position) ?? item.from;
            },
            itemIsCollapsed,
            labels
          ),
        {
          ignoreSelection: true,
          key: `markra-list-toggle-${item.from}-${itemIsCollapsed ? "collapsed" : "expanded"}`,
          side: -1
        }
      )
    );

    if (!itemIsCollapsed) continue;

    for (const nestedList of item.nestedLists) {
      decorations.push(
        Decoration.node(nestedList.from, nestedList.to, {
          class: "markra-list-collapsed-content"
        })
      );
    }
  }

  return DecorationSet.create(doc, decorations);
}

export function listItemCollapseInfo(
  state: EditorState,
  listItem: NodeType,
  bulletList: NodeType,
  orderedList: NodeType
) {
  const items = collectCollapsibleListItems(state.doc, listItem, bulletList, orderedList);
  const itemByStart = new Set(items.map((item) => item.from));
  const pluginState = listToggleKey.getState(state) ?? emptyCollapsedListState;
  const collapsed = normalizeCollapsedPositions(state, listItem, pluginState.collapsed)
    .filter((position) => itemByStart.has(position));

  return {
    collapsedCount: collapsed.length,
    totalCount: items.length
  };
}

export function setAllListItemsCollapsed(
  view: EditorView,
  listItem: NodeType,
  bulletList: NodeType,
  orderedList: NodeType,
  collapsed: boolean
) {
  const info = listItemCollapseInfo(view.state, listItem, bulletList, orderedList);
  if (info.totalCount === 0) return false;

  view.dispatch(
    view.state.tr.setMeta(listToggleKey, {
      collapsed,
      type: "set-all"
    } satisfies ListToggleMeta)
  );
  view.focus();

  return true;
}

export function createListTogglePlugin(
  listItem: NodeType,
  bulletList: NodeType,
  orderedList: NodeType,
  labels?: Partial<ListToggleLabels>
) {
  const resolvedLabels = normalizeListToggleLabels(labels);

  return new Plugin<CollapsedListState>({
    key: listToggleKey,
    state: {
      init: () => emptyCollapsedListState,
      apply(transaction, value, _oldState, newState) {
        const meta = transaction.getMeta(listToggleKey) as ListToggleMeta | undefined;
        const mappedCollapsed = transaction.docChanged
          ? mapCollapsedPositions(transaction, newState, listItem, value.collapsed)
          : value.collapsed;

        if (!meta) {
          return mappedCollapsed === value.collapsed ? value : { collapsed: mappedCollapsed };
        }

        if (meta.type === "set-all") {
          return {
            collapsed: meta.collapsed
              ? collectCollapsibleListItems(newState.doc, listItem, bulletList, orderedList).map((item) => item.from)
              : []
          };
        }

        const listItemFrom = findListItemStartAtPosition(newState, listItem, meta.from);
        if (listItemFrom === null) return { collapsed: mappedCollapsed };

        return {
          collapsed: toggleCollapsedPosition(mappedCollapsed, listItemFrom)
        };
      }
    },
    props: {
      decorations: (state) => {
        const pluginState = listToggleKey.getState(state) ?? emptyCollapsedListState;
        return buildListToggleDecorations(
          state.doc,
          pluginState.collapsed,
          listItem,
          bulletList,
          orderedList,
          resolvedLabels
        );
      }
    }
  });
}

export function markraListTogglePlugin(labels?: Partial<ListToggleLabels>) {
  return $prose((ctx) =>
    createListTogglePlugin(
      listItemSchema.type(ctx),
      bulletListSchema.type(ctx),
      orderedListSchema.type(ctx),
      labels
    )
  );
}
