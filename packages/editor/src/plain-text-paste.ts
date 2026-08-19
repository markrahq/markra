import { GFM, parser as markdownParser } from "@lezer/markdown";

export const plainTextPasteMime = "application/x-markra-plain-text-paste";
const pendingPlainTextPasteProperty = "__markraPendingPlainTextPasteAt";
const plainTextPasteIntentDurationMs = 1_500;
const markdownLiteralJoiner = "\u2060";
const plainTextMarkdownParser = markdownParser.configure([GFM]);
const markdownMarkNodeNames = new Set([
  "CodeMark",
  "EmphasisMark",
  "Escape",
  "HeaderMark",
  "ListMark",
  "QuoteMark",
  "StrikethroughMark",
]);
const markdownDelimiterNodeNames = new Set([
  "HorizontalRule",
  "TableDelimiter",
]);

type PlainTextPasteTarget = HTMLElement & {
  [pendingPlainTextPasteProperty]?: {
    markedAt: number;
    mode: PlainTextPasteIntent;
  };
};

type PlainTextInputTarget = HTMLInputElement | HTMLTextAreaElement;
type PlainTextPasteIntent = "suppress-native" | "use-native-text";

function plainTextClipboardData(text: string) {
  const escapedText = escapePlainTextMarkdown(text);

  return {
    files: Object.assign([], {
      item: () => null,
    }),
    getData: (type: string) => {
      if (type === plainTextPasteMime) return "true";
      if (type === "text/plain") return escapedText;

      return "";
    },
    types: [plainTextPasteMime, "text/plain"],
  };
}

export function escapePlainTextMarkdown(text: string) {
  // Escape only parser-owned Markdown marks. Visual mode hides these standard escape slashes,
  // while source mode keeps explicit, portable Markdown instead of invisible document characters.
  const backslashPositions = new Set<number>();
  const invisibleInsertionPositions = new Set<number>();
  const addPunctuation = (from: number, to: number) => {
    for (let position = from; position < to; position += 1) {
      if (isAsciiPunctuation(text[position] ?? "")) {
        backslashPositions.add(position);
      }
    }
  };

  for (let position = 0; position < text.length; position += 1) {
    if (text[position] === "\\" || text[position] === "$") {
      backslashPositions.add(position);
    }
  }
  for (const match of text.matchAll(/^[ \t]*\[\^[^\]\n]+\]:/gmu)) {
    const definitionColon = match[0].lastIndexOf(":");
    if (match.index !== undefined && definitionColon >= 0) {
      invisibleInsertionPositions.add(match.index + definitionColon);
    }
  }
  for (const match of text.matchAll(/\[\^[^\]\n]+\]/gu)) {
    if (match.index !== undefined) {
      invisibleInsertionPositions.add(match.index + 1);
      backslashPositions.add(match.index + match[0].length - 1);
    }
  }

  const cursor = plainTextMarkdownParser.parse(text).cursor();
  do {
    if (
      markdownMarkNodeNames.has(cursor.name) ||
      markdownDelimiterNodeNames.has(cursor.name)
    ) {
      addPunctuation(cursor.from, cursor.to);
      continue;
    }

    const source = text.slice(cursor.from, cursor.to);
    if (cursor.name === "LinkReference") {
      const definitionColon = source.indexOf("]:");
      if (definitionColon >= 0) {
        backslashPositions.add(cursor.from + definitionColon);
        invisibleInsertionPositions.add(cursor.from + definitionColon + 1);
      }
      continue;
    }
    if (cursor.name === "CodeBlock") {
      // Markdown has no backslash escape for four-space code blocks. A word joiner keeps the
      // visible indentation intact while making the line start with a non-whitespace character.
      invisibleInsertionPositions.add(
        text.lastIndexOf("\n", cursor.from - 1) + 1,
      );
      continue;
    }
    if (cursor.name === "LinkMark") {
      for (let offset = 0; offset < source.length; offset += 1) {
        const position = cursor.from + offset;
        if (source[offset] === "]") backslashPositions.add(position);
        if (source[offset] === "!" || source[offset] === "<") {
          backslashPositions.add(position);
        }
      }
      continue;
    }
    if (cursor.name === "TaskMarker") {
      const closingBracket = source.lastIndexOf("]");
      if (closingBracket >= 0) {
        backslashPositions.add(cursor.from + closingBracket);
      }
      continue;
    }
    if (cursor.name === "HTMLTag" || cursor.name === "Entity") {
      backslashPositions.add(cursor.from);
      continue;
    }
    if (cursor.name === "URL") {
      const separator = source.includes(":")
        ? source.indexOf(":")
        : source.indexOf("@");
      if (separator >= 0) backslashPositions.add(cursor.from + separator);
    }
  } while (cursor.next());

  const escaped = [
    ...Array.from(backslashPositions, (position) => ({ position, prefix: "\\" })),
    ...Array.from(invisibleInsertionPositions, (position) => ({
      position,
      prefix: markdownLiteralJoiner,
    })),
  ]
    .sort((first, second) => second.position - first.position)
    .reduce(
      (result, insertion) =>
        `${result.slice(0, insertion.position)}${insertion.prefix}${result.slice(insertion.position)}`,
      text,
    );

  // Highlight markers are a Markra extension rather than a GFM parser node.
  return escaped.replaceAll("==", `=${markdownLiteralJoiner}=`);
}

function isAsciiPunctuation(character: string) {
  const code = character.codePointAt(0) ?? 0;
  return (
    (code >= 33 && code <= 47) ||
    (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) ||
    (code >= 123 && code <= 126)
  );
}

export function isPlainTextPaste(event: ClipboardEvent) {
  return event.clipboardData?.getData(plainTextPasteMime) === "true";
}

export function markNextPlainTextPaste(
  target: HTMLElement,
  mode: PlainTextPasteIntent = "suppress-native",
) {
  (target as PlainTextPasteTarget)[pendingPlainTextPasteProperty] = {
    markedAt: Date.now(),
    mode,
  };
}

export function consumeNextPlainTextPaste(target: HTMLElement) {
  const pasteTarget = target as PlainTextPasteTarget;
  const pending = pasteTarget[pendingPlainTextPasteProperty];
  delete pasteTarget[pendingPlainTextPasteProperty];
  if (!pending) return null;

  return Date.now() - pending.markedAt <= plainTextPasteIntentDurationMs
    ? pending.mode
    : null;
}

function editablePlainTextTarget(target: HTMLElement) {
  const selectionNode = target.classList.contains("cm-content")
    ? target.ownerDocument.getSelection()?.anchorNode
    : null;
  const selectionElement = selectionNode instanceof Element
    ? selectionNode
    : selectionNode?.parentElement;
  const origin = selectionElement && target.contains(selectionElement)
    ? selectionElement
    : target;
  const editable = origin.closest("input, textarea, [contenteditable]");
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    return editable.disabled ? null : editable;
  }
  if (!(editable instanceof HTMLElement)) return null;

  return editable.getAttribute("contenteditable")?.toLowerCase() === "false"
    ? null
    : editable;
}

function dispatchPlainTextInputEvent(target: HTMLElement) {
  const EventConstructor = target.ownerDocument.defaultView?.Event ?? Event;
  target.dispatchEvent(new EventConstructor("input", { bubbles: true }));
}

function createPlainTextInputInserter(target: PlainTextInputTarget) {
  const from = target.selectionStart ?? target.value.length;
  const to = target.selectionEnd ?? from;

  return (text: string) => {
    if (!target.isConnected) return false;

    target.setRangeText(text, from, to, "end");
    dispatchPlainTextInputEvent(target);
    return true;
  };
}

function createPlainTextContentEditableInserter(target: HTMLElement) {
  const selection = target.ownerDocument.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!selection || !range || !target.contains(range.commonAncestorContainer)) {
    return null;
  }
  const startElement = range.startContainer instanceof Element
    ? range.startContainer
    : range.startContainer.parentElement;
  const endElement = range.endContainer instanceof Element
    ? range.endContainer
    : range.endContainer.parentElement;
  const startCell = startElement?.closest("th, td");
  const endCell = endElement?.closest("th, td");
  const capturedRange = range.cloneRange();
  if (startCell && endCell && startCell !== endCell) {
    // Deleting a DOM Range across cells can remove table structure. Keep all cells intact and
    // use the range's start boundary as the deterministic paste destination.
    capturedRange.collapse(true);
  }

  return (text: string) => {
    if (!target.isConnected) return false;

    capturedRange.deleteContents();
    const fragment = target.ownerDocument.createDocumentFragment();
    const lines = escapePlainTextMarkdown(text).split(/\r\n?|\n/u);
    let inserted: Node | null = null;
    for (const [index, line] of lines.entries()) {
      if (index > 0) {
        const lineBreak = target.ownerDocument.createElement("br");
        lineBreak.dataset.markraSourceBreak = "true";
        fragment.append(lineBreak);
        inserted = lineBreak;
      }
      const textNode = target.ownerDocument.createTextNode(line);
      fragment.append(textNode);
      inserted = textNode;
    }
    capturedRange.insertNode(fragment);
    if (inserted) capturedRange.setStartAfter(inserted);
    capturedRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(capturedRange);
    dispatchPlainTextInputEvent(target);
    return true;
  };
}

export function createPlainTextPasteInserter(target: HTMLElement) {
  const editableTarget = editablePlainTextTarget(target);
  if (editableTarget && !editableTarget.classList.contains("cm-content")) {
    return editableTarget instanceof HTMLInputElement ||
      editableTarget instanceof HTMLTextAreaElement
      ? createPlainTextInputInserter(editableTarget)
      : createPlainTextContentEditableInserter(editableTarget);
  }

  return (text: string) => {
    if (!target.isConnected) return false;

    const EventConstructor = target.ownerDocument.defaultView?.Event ?? Event;
    const event = new EventConstructor("paste", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "clipboardData", {
      value: plainTextClipboardData(text),
    });
    target.dispatchEvent(event);

    return event.defaultPrevented;
  };
}

export function dispatchPlainTextPaste(target: HTMLElement, text: string) {
  const insert = createPlainTextPasteInserter(target);

  return insert?.(text) ?? false;
}

export function handlePendingPlainTextPasteEvent(
  event: ClipboardEvent,
  intentTarget: HTMLElement,
) {
  const intent = consumeNextPlainTextPaste(intentTarget);
  if (!intent) return false;

  event.preventDefault();
  if (intent === "use-native-text") {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    const eventTarget = event.target instanceof HTMLElement &&
      intentTarget.contains(event.target)
      ? event.target
      : intentTarget;
    if (text) dispatchPlainTextPaste(eventTarget, text);
  }
  return true;
}
