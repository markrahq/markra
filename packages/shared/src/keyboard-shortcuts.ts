type ShortcutModifiers = {
  alt?: boolean;
  shift?: boolean;
};

export const keyboardShortcutActions = [
  "openQuickOpen",
  "toggleMarkdownFiles",
  "toggleDocumentHistory",
  "toggleAiAgent",
  "toggleAiCommand",
  "toggleSourceMode",
  "toggleReadOnlyMode",
  "bold",
  "italic",
  "strikethrough",
  "inlineCode",
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulletList",
  "orderedList",
  "quote",
  "codeBlock",
  "link",
  "image",
  "table",
  "toggleAllFolds",
  "openSpellcheckSuggestions"
] as const;

export const markdownFormattingShortcutActions = [
  "bold",
  "italic",
  "strikethrough",
  "inlineCode",
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulletList",
  "orderedList",
  "quote",
  "codeBlock"
] as const satisfies readonly KeyboardShortcutAction[];

export type KeyboardShortcutAction = typeof keyboardShortcutActions[number];
export type MarkdownFormattingShortcutAction = typeof markdownFormattingShortcutActions[number];
export type KeyboardShortcutBindings = Record<KeyboardShortcutAction, string>;
export type KeyboardShortcutMap = Partial<Record<KeyboardShortcutAction, string>>;

export const defaultKeyboardShortcuts: KeyboardShortcutBindings = {
  bold: "Mod+B",
  bulletList: "Mod+Shift+8",
  codeBlock: "Mod+Alt+C",
  heading1: "Mod+Alt+1",
  heading2: "Mod+Alt+2",
  heading3: "Mod+Alt+3",
  image: "Mod+Shift+I",
  inlineCode: "Mod+E",
  italic: "Mod+I",
  link: "Mod+K",
  orderedList: "Mod+Shift+7",
  paragraph: "Mod+Alt+0",
  openQuickOpen: "Mod+P",
  quote: "Mod+Shift+B",
  strikethrough: "Mod+Shift+X",
  table: "Mod+Shift+Alt+T",
  toggleAiAgent: "Mod+Alt+J",
  toggleAiCommand: "Mod+Shift+J",
  toggleAllFolds: "Mod+Alt+T",
  toggleDocumentHistory: "Mod+Shift+H",
  toggleMarkdownFiles: "Mod+Shift+M",
  openSpellcheckSuggestions: "Mod+.",
  toggleReadOnlyMode: "Mod+Alt+L",
  toggleSourceMode: "Mod+Alt+S"
};

const previousDefaultKeyboardShortcuts: Partial<KeyboardShortcutBindings> = {
  table: "Mod+Alt+T",
  toggleAiAgent: "Mod+Shift+A",
  toggleSourceMode: "Mod+Alt+V"
};

const reservedKeyboardShortcutChords = new Set([
  "Mod+,",
  "Mod+A",
  "Mod+C",
  "Mod+H",
  "Mod+N",
  "Mod+O",
  "Mod+P",
  "Mod+S",
  "Mod+V",
  "Mod+X",
  "Mod+Y",
  "Mod+Z",
  "Mod+Shift+E",
  "Mod+Shift+O",
  "Mod+Shift+S",
  "Mod+Shift+V",
  "Mod+Shift+Z"
]);

export type ParsedKeyboardShortcut = {
  alt: boolean;
  key: string;
  shift: boolean;
};

export type KeyboardShortcutEventInit = Pick<KeyboardEventInit, "altKey" | "code" | "shiftKey"> & {
  key: string;
};

export function isKeyboardShortcutModKey(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey">) {
  return event.metaKey || event.ctrlKey;
}

export function matchesKeyboardShortcut(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">,
  key: string,
  modifiers: ShortcutModifiers = {}
) {
  return (
    isKeyboardShortcutModKey(event) &&
    event.key.toLowerCase() === key.toLowerCase() &&
    event.altKey === Boolean(modifiers.alt) &&
    event.shiftKey === Boolean(modifiers.shift)
  );
}

const shortcutKeyByPhysicalCode: Record<string, string> = {
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Digit0: "0",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
  Equal: "=",
  Minus: "-",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/"
};

const shiftedKeyByPhysicalCode: Record<string, string> = {
  Backquote: "~",
  Backslash: "|",
  BracketLeft: "{",
  BracketRight: "}",
  Comma: "<",
  Digit0: ")",
  Digit1: "!",
  Digit2: "@",
  Digit3: "#",
  Digit4: "$",
  Digit5: "%",
  Digit6: "^",
  Digit7: "&",
  Digit8: "*",
  Digit9: "(",
  Equal: "+",
  Minus: "_",
  Period: ">",
  Quote: "\"",
  Semicolon: ":",
  Slash: "?"
};

const physicalCodeByShortcutKey = Object.fromEntries(
  Object.entries(shortcutKeyByPhysicalCode).map(([code, key]) => [key, code])
) as Record<string, string>;

const punctuationShortcutKeys = new Set([
  "`",
  "\\",
  "[",
  "]",
  ",",
  "=",
  "-",
  ".",
  "'",
  ";",
  "/"
]);

function normalizeShortcutKey(key: string) {
  if (/^[a-z]$/iu.test(key)) return key.toUpperCase();
  if (/^[0-9]$/u.test(key)) return key;
  if (punctuationShortcutKeys.has(key)) return key;

  return null;
}

function shortcutKeyFromKeyboardEvent(
  event: Pick<KeyboardEvent, "key"> & Partial<Pick<KeyboardEvent, "code">>
) {
  const physicalKey = event.code ? shortcutKeyByPhysicalCode[event.code] : null;
  if (physicalKey) return physicalKey;

  return normalizeShortcutKey(event.key);
}

export function parseKeyboardShortcut(shortcut: unknown): ParsedKeyboardShortcut | null {
  if (typeof shortcut !== "string") return null;

  const parts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  let alt = false;
  let key: string | null = null;
  let mod = false;
  let shift = false;

  for (const part of parts) {
    const lowerPart = part.toLowerCase();

    if (lowerPart === "mod" || lowerPart === "cmdorctrl") {
      if (mod) return null;
      mod = true;
      continue;
    }

    if (lowerPart === "alt" || lowerPart === "option") {
      if (alt) return null;
      alt = true;
      continue;
    }

    if (lowerPart === "shift") {
      if (shift) return null;
      shift = true;
      continue;
    }

    if (key !== null) return null;
    key = normalizeShortcutKey(part);
    if (key === null) return null;
  }

  if (!mod || key === null) return null;

  return {
    alt,
    key,
    shift
  };
}

export function formatKeyboardShortcut(shortcut: unknown) {
  const parsed = parseKeyboardShortcut(shortcut);
  if (!parsed) return null;

  return [
    "Mod",
    parsed.shift ? "Shift" : null,
    parsed.alt ? "Alt" : null,
    parsed.key
  ].filter((part): part is string => Boolean(part)).join("+");
}

export function keyboardShortcutToKeyboardEventInit(shortcut: unknown): KeyboardShortcutEventInit | null {
  const parsed = parseKeyboardShortcut(shortcut);
  if (!parsed) return null;

  const code = physicalCodeByShortcutKey[parsed.key];
  const eventInit: KeyboardShortcutEventInit = {
    altKey: parsed.alt,
    key: parsed.shift && code ? shiftedKeyByPhysicalCode[code] ?? parsed.key : parsed.key,
    shiftKey: parsed.shift
  };
  if (code) eventInit.code = code;

  return eventInit;
}

export function keyboardShortcutFromKeyboardEvent(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"> & Partial<Pick<KeyboardEvent, "code">>
) {
  if (!event.metaKey && !event.ctrlKey) return null;
  if (event.key === "Alt" || event.key === "Control" || event.key === "Meta" || event.key === "Shift") {
    return null;
  }

  const key = shortcutKeyFromKeyboardEvent(event);
  if (!key) return null;

  return formatKeyboardShortcut([
    "Mod",
    event.shiftKey ? "Shift" : null,
    event.altKey ? "Alt" : null,
    key
  ].filter((part): part is string => Boolean(part)).join("+"));
}

export function keyboardShortcutToNativeAccelerator(shortcut: unknown) {
  const parsed = parseKeyboardShortcut(shortcut);
  if (!parsed) return null;

  return [
    "CmdOrCtrl",
    parsed.shift ? "Shift" : null,
    parsed.alt ? "Alt" : null,
    parsed.key
  ].filter((part): part is string => Boolean(part)).join("+");
}

export function normalizeKeyboardShortcuts(value: unknown): KeyboardShortcutBindings {
  if (typeof value !== "object" || value === null) return defaultKeyboardShortcuts;

  const input = value as KeyboardShortcutMap;
  const candidates: KeyboardShortcutBindings = { ...defaultKeyboardShortcuts };
  const shortcuts = { ...defaultKeyboardShortcuts };
  const shortcutCounts = new Map<string, number>();

  for (const action of keyboardShortcutActions) {
    const fallback = defaultKeyboardShortcuts[action];
    const formattedCandidate = formatKeyboardShortcut(input[action]);
    const candidate = formattedCandidate === previousDefaultKeyboardShortcuts[action]
      ? fallback
      : formattedCandidate;

    candidates[action] = !candidate || reservedKeyboardShortcutChords.has(candidate) ? fallback : candidate;
    shortcutCounts.set(candidates[action], (shortcutCounts.get(candidates[action]) ?? 0) + 1);
  }

  for (const action of keyboardShortcutActions) {
    const candidate = candidates[action];
    shortcuts[action] = shortcutCounts.get(candidate) === 1 ? candidate : defaultKeyboardShortcuts[action];
  }

  return shortcuts;
}

export function matchesKeyboardShortcutEvent(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"> & Partial<Pick<KeyboardEvent, "code">>,
  shortcut: string
) {
  const parsed = parseKeyboardShortcut(shortcut);
  if (!parsed) return false;
  const key = shortcutKeyFromKeyboardEvent(event);
  if (!key) return false;

  return (
    isKeyboardShortcutModKey(event) &&
    key.toLowerCase() === parsed.key.toLowerCase() &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift
  );
}
