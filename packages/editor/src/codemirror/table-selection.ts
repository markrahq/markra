export const tableCaretPlaceholder = "\u200b";

export function createTableCaretHost(ownerDocument: Document) {
  const host = ownerDocument.createElement("span");
  host.dataset.markraTableCaretHost = "true";
  const text = ownerDocument.createTextNode(tableCaretPlaceholder);
  host.append(text);
  return { host, text };
}


export function isTableCaretPlaceholder(cell: HTMLTableCellElement) {
  return (
    cell.childNodes.length === 1 &&
    cell.firstElementChild?.tagName === "BR" &&
    cell.firstElementChild.getAttribute("data-markra-source-break") !== "true"
  );
}


export function tableCellCaretOffset(cell: HTMLTableCellElement) {
  const selection = cell.ownerDocument.getSelection();
  const anchorNode = selection?.anchorNode;
  if (!selection || !anchorNode || !cell.contains(anchorNode)) {
    return cell.textContent?.length ?? 0;
  }

  const range = cell.ownerDocument.createRange();
  range.selectNodeContents(cell);
  range.setEnd(anchorNode, selection.anchorOffset);
  return range.toString().replaceAll(tableCaretPlaceholder, "").length;
}


export function placeTableCellCaret(
  cell: HTMLTableCellElement,
  caretOffset: number,
) {
  cell.focus();
  const walker = cell.ownerDocument.createTreeWalker(
    cell,
    NodeFilter.SHOW_TEXT,
  );
  let textNode = walker.nextNode();
  let remaining = caretOffset;
  while (
    textNode &&
    remaining > (textNode.textContent?.length ?? 0)
  ) {
    remaining -= textNode.textContent?.length ?? 0;
    textNode = walker.nextNode();
  }
  // WebKit may place input outside an empty table cell when the range is
  // anchored on the <th>/<td> itself, so always provide a text caret host.
  if (!textNode) {
    textNode = cell.ownerDocument.createTextNode("");
    if (isTableCaretPlaceholder(cell)) {
      cell.replaceChildren(textNode);
    } else {
      cell.append(textNode);
    }
  }
  const selection = cell.ownerDocument.getSelection();
  if (!selection) return;
  const range = cell.ownerDocument.createRange();
  range.setStart(
    textNode,
    Math.min(remaining, textNode.textContent?.length ?? 0),
  );
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}


export function activeTableCell(table: HTMLTableElement) {
  const active = table.ownerDocument.activeElement;
  if (active instanceof HTMLTableCellElement && active.closest("table") === table) return active;
  const node = table.ownerDocument.getSelection()?.anchorNode;
  const element = node instanceof Element ? node : node?.parentElement;
  const cell = element?.closest<HTMLTableCellElement>("th, td");
  return cell?.closest("table") === table ? cell : null;
}

export function clearTableSelection(table: HTMLTableElement) {
  const selection = table.ownerDocument.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  if (!range || range.collapsed) return [];
  const element = (node: Node) => node instanceof Element ? node : node.parentElement;
  const first = element(range.startContainer)?.closest<HTMLTableCellElement>("th, td");
  const last = element(range.endContainer)?.closest<HTMLTableCellElement>("th, td");
  if (!first || !last || first === last || first.closest("table") !== table || last.closest("table") !== table) return [];
  const cells = Array.from(table.rows).flatMap(row => Array.from(row.cells)).filter(cell => range.intersectsNode(cell));
  // Delete inside each cell separately; deleting the cross-cell DOM range can remove the grid itself.
  for (const cell of cells) {
    const local = table.ownerDocument.createRange();
    local.setStart(cell.contains(range.startContainer) ? range.startContainer : cell, cell.contains(range.startContainer) ? range.startOffset : 0);
    local.setEnd(cell.contains(range.endContainer) ? range.endContainer : cell, cell.contains(range.endContainer) ? range.endOffset : cell.childNodes.length);
    local.deleteContents();
  }
  placeTableCellCaret(first, 0);
  return cells;
}
