import type { MarkdownOutlineItem } from "@markra/markdown";

export type OutlineRenderItem = {
  hasChildren: boolean;
  index: number;
  item: MarkdownOutlineItem;
  key: string;
};

function outlineItemKey(item: MarkdownOutlineItem, index: number) {
  return `${index}:${item.level}:${item.title}`;
}

function outlineItemHasVisibleChildren(
  items: MarkdownOutlineItem[],
  index: number,
  maxLevel: number | null
) {
  const item = items[index];
  if (!item) return false;

  for (let nextIndex = index + 1; nextIndex < items.length; nextIndex += 1) {
    const nextItem = items[nextIndex];
    if (!nextItem || nextItem.level <= item.level) return false;
    if (maxLevel === null || nextItem.level <= maxLevel) return true;
  }

  return false;
}

export function buildOutlineRenderItems(items: MarkdownOutlineItem[], maxLevel: number | null) {
  return items.flatMap((item, index): OutlineRenderItem[] => {
    if (maxLevel !== null && item.level > maxLevel) return [];

    return [{
      hasChildren: outlineItemHasVisibleChildren(items, index, maxLevel),
      index,
      item,
      key: outlineItemKey(item, index)
    }];
  });
}

export function visibleOutlineRenderItems(items: OutlineRenderItem[], collapsedKeys: ReadonlySet<string>) {
  let collapsedAncestorLevel: number | null = null;

  return items.filter(({ item, key }) => {
    const hiddenByAncestor = collapsedAncestorLevel !== null && item.level > collapsedAncestorLevel;
    if (hiddenByAncestor) return false;

    collapsedAncestorLevel = collapsedKeys.has(key) ? item.level : null;
    return true;
  });
}
