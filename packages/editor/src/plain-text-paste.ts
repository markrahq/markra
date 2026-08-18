export const plainTextPasteMime = "application/x-markra-plain-text-paste";

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
