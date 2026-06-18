export type EditableTextInput = HTMLInputElement | HTMLTextAreaElement;
export type EditableTextControl = EditableTextInput | HTMLElement;

const editableInputTypes = new Set([
  "date",
  "datetime-local",
  "email",
  "month",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "time",
  "url",
  "week"
]);

function editableTextInputFromElement(element: Element | null): EditableTextInput | null {
  if (element instanceof HTMLInputElement) {
    return !element.disabled && editableInputTypes.has(element.type) ? element : null;
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled ? element : null;
  }

  return null;
}

function editableTextControlFromElement(element: Element | null): EditableTextControl | null {
  const input = editableTextInputFromElement(element);
  if (input) return input;

  if (element instanceof HTMLElement && element.hasAttribute("contenteditable")) {
    return element.getAttribute("contenteditable")?.toLowerCase() !== "false" ? element : null;
  }

  return null;
}

export function editableTextControlFromTarget(target: EventTarget | null): EditableTextControl | null {
  if (!(target instanceof Element)) return null;

  return editableTextControlFromElement(target.closest("input, textarea, [contenteditable]"));
}

export function focusedEditableTextControl(documentTarget: Document): EditableTextControl | null {
  return editableTextControlFromElement(documentTarget.activeElement);
}

export function focusedEditableTextInput(documentTarget: Document): EditableTextInput | null {
  return editableTextInputFromElement(documentTarget.activeElement);
}
