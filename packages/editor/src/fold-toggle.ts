import type { NodeType } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  headingSectionCollapseInfo,
  setAllHeadingSectionsCollapsed
} from "./heading-toggle.ts";
import {
  listItemCollapseInfo,
  setAllListItemsCollapsed
} from "./list-toggle.ts";

export type FoldableBlockNodeTypes = {
  bulletList: NodeType;
  heading: NodeType;
  listItem: NodeType;
  orderedList: NodeType;
};

export function toggleAllFoldableBlocks(view: EditorView, nodeTypes: FoldableBlockNodeTypes) {
  const headingInfo = headingSectionCollapseInfo(view.state, nodeTypes.heading);
  const listInfo = listItemCollapseInfo(
    view.state,
    nodeTypes.listItem,
    nodeTypes.bulletList,
    nodeTypes.orderedList
  );
  const totalCount = headingInfo.totalCount + listInfo.totalCount;
  if (totalCount === 0) return false;

  const collapsedCount = headingInfo.collapsedCount + listInfo.collapsedCount;
  const collapsed = collapsedCount < totalCount;
  const headingHandled = setAllHeadingSectionsCollapsed(view, nodeTypes.heading, collapsed);
  const listHandled = setAllListItemsCollapsed(
    view,
    nodeTypes.listItem,
    nodeTypes.bulletList,
    nodeTypes.orderedList,
    collapsed
  );

  return headingHandled || listHandled;
}
