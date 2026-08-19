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
  [pendingPlainTextPasteProperty]?: number;
};

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

  const escaped = Array.from(backslashPositions)
    .sort((first, second) => second - first)
    .reduce(
      (result, position) =>
        `${result.slice(0, position)}\\${result.slice(position)}`,
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

export function markNextPlainTextPaste(target: HTMLElement) {
  (target as PlainTextPasteTarget)[pendingPlainTextPasteProperty] = Date.now();
}

export function consumeNextPlainTextPaste(target: HTMLElement) {
  const pasteTarget = target as PlainTextPasteTarget;
  const markedAt = pasteTarget[pendingPlainTextPasteProperty];
  delete pasteTarget[pendingPlainTextPasteProperty];
  if (markedAt === undefined) return false;

  return Date.now() - markedAt <= plainTextPasteIntentDurationMs;
}

export function dispatchPlainTextPaste(target: HTMLElement, text: string) {
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
}
