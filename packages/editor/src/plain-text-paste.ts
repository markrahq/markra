export const plainTextPasteMime = "application/x-markra-plain-text-paste";
const pendingPlainTextPasteProperty = "__markraPendingPlainTextPasteAt";
const plainTextPasteIntentDurationMs = 1_500;

type PlainTextPasteTarget = HTMLElement & {
  [pendingPlainTextPasteProperty]?: number;
};

function plainTextClipboardData(text: string) {
  return {
    files: Object.assign([], {
      item: () => null,
    }),
    getData: (type: string) => {
      if (type === plainTextPasteMime) return "true";
      if (type === "text/plain") return text;

      return "";
    },
    types: [plainTextPasteMime, "text/plain"],
  };
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
