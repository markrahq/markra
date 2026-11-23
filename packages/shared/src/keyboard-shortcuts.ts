type ShortcutModifiers = {
  alt?: boolean;
  shift?: boolean;
};

export const keyboardShortcutActions = [
  "openQuickOpen",
  "syncNow",
  "toggleMarkdownFiles",
  "toggleDocumentHistory",
  "toggleAiAgent",
  "toggleAiCommand",
  "toggleSourceMode",
  "toggleReadOnlyMode",
  "toggleTypewriterMode",
  "toggleVimMode",
  "pastePlainText",
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
  pastePlainText: "Mod+Shift+V",
  paragraph: "Mod+Alt+0",
  openQuickOpen: "Mod+P",
  quote: "Mod+Shift+B",
  syncNow: "Mod+Alt+R",
  strikethrough: "Mod+Shift+X",
  table: "Mod+Shift+Alt+T",
  toggleAiAgent: "Mod+Alt+J",
  toggleAiCommand: "Mod+Shift+J",
  toggleAllFolds: "Mod+Alt+T",
  toggleDocumentHistory: "Mod+Shift+H",
  toggleMarkdownFiles: "Mod+Shift+M",
  openSpellcheckSuggestions: "Mod+.",
  toggleReadOnlyMode: "Mod+Alt+L",
  toggleSourceMode: "Mod+Alt+S",
  toggleTypewriterMode: "Mod+Shift+Y",
  toggleVimMode: "Mod+Alt+V"
};

const previousDefaultKeyboardShortcuts: Partial<KeyboardShortcutBindings> = {
  table: "Mod+Alt+T",
  toggleAiAgent: "Mod+Shift+A",
  toggleSourceMode: "Mod+Alt+V",
  toggleTypewriterMode: "Mod+Alt+W"
};

const introducedKeyboardShortcutFallbacks: Partial<Record<KeyboardShortcutAction, readonly string[]>> = {
  toggleTypewriterMode: [
    "Mod+Shift+Alt+Y",
    "Mod+Shift+Alt+U",
    "Mod+Shift+Alt+W"
  ],
  toggleVimMode: [
    "Mod+Shift+Alt+V",
    "Mod+Shift+Alt+I",
    "Mod+Shift+Alt+M"
  ]
};

const reservedKeyboardShortcutChords = new Set([
  "Mod+,",
  "Mod+A",
  "Mod+C",
  "Mod+F",
  "Mod+H",
  "Mod+N",
  "Mod+O",
  "Mod+P",
  "Mod+S",
  "Mod+V",
  "Mod+W",
  "Mod+X",
  "Mod+Y",
  "Mod+Z",
  "Mod+Alt+F",
  "Mod+Alt+P",
  "Mod+Alt+W",
  "Mod+Shift+E",
  "Mod+Shift+F",
  "Mod+Shift+O",
  "Mod+Shift+S",
  "Mod+Shift+Z"
]);

export type ParsedKeyboardShortcut = {
  alt: boolean;
  key: string;
  mod: boolean;
  shift: boolean;
};

export type KeyboardShortcutEventInit = Pick<KeyboardEventInit, "altKey" | "code" | "shiftKey"> & {
  key: string;
  modKey: boolean;
};

export function isKeyboardShortcutModKey(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey">) {
  return event.metaKey !== event.ctrlKey;
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

  const normalizedKey = normalizeShortcutKey(event.key);
  if (normalizedKey) return normalizedKey;

  // macOS Option+letter shortcuts can report the generated symbol (for example, Option+W as "∑")
  // instead of the letter. Fall back only when key is unusable so non-QWERTY layouts keep their
  // normal character-based behavior for unmodified letter shortcuts.
  return event.code?.match(/^Key([A-Z])$/u)?.[1] ?? null;
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

  if ((!mod && !alt) || key === null) return null;

  return {
    alt,
    key,
    mod,
    shift
  };
}

export function formatKeyboardShortcut(shortcut: unknown) {
  const parsed = parseKeyboardShortcut(shortcut);
  if (!parsed) return null;

  return [
    parsed.mod ? "Mod" : null,
    parsed.shift ? "Shift" : null,
    parsed.alt ? "Alt" : null,
    parsed.key
  ].filter((part): part is string => Boolean(part)).join("+");
}

export function keyboardShortcutToKeyboardEventInit(shortcut: unknown): KeyboardShortcutEventInit | null {
  const parsed = parseKeyboardShortcut(shortcut);
  if (!parsed) return null;

  const code = physicalCodeByShortcutKey[parsed.key];
  // DOM KeyboardEvent.key uses lowercase letters unless Shift is pressed.
  // CodeMirror matches this value exactly for synthetic toolbar/menu commands.
  const key = /^[A-Z]$/u.test(parsed.key)
    ? parsed.shift ? parsed.key : parsed.key.toLocaleLowerCase()
    : parsed.shift && code ? shiftedKeyByPhysicalCode[code] ?? parsed.key : parsed.key;
  const eventInit: KeyboardShortcutEventInit = {
    altKey: parsed.alt,
    key,
    modKey: parsed.mod,
    shiftKey: parsed.shift
  };
  if (code) eventInit.code = code;

  return eventInit;
}

export function keyboardShortcutFromKeyboardEvent(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"> & Partial<Pick<KeyboardEvent, "code">>
) {
  // Control+Meta is never a valid primary modifier. Do not let Alt make that
  // invalid chord look like an Alt-only shortcut after Mod became optional.
  if (event.metaKey && event.ctrlKey) return null;
  const mod = isKeyboardShortcutModKey(event);
  if (!mod && !event.altKey) return null;
  if (event.key === "Alt" || event.key === "Control" || event.key === "Meta" || event.key === "Shift") {
    return null;
  }

  const key = shortcutKeyFromKeyboardEvent(event);
  if (!key) return null;

  return formatKeyboardShortcut([
    mod ? "Mod" : null,
    event.shiftKey ? "Shift" : null,
    event.altKey ? "Alt" : null,
    key
  ].filter((part): part is string => Boolean(part)).join("+"));
}

export function keyboardShortcutToNativeAccelerator(shortcut: unknown) {
  const parsed = parseKeyboardShortcut(shortcut);
  if (!parsed) return null;

  return [
    parsed.mod ? "CmdOrCtrl" : null,
    parsed.shift ? "Shift" : null,
    parsed.alt ? "Alt" : null,
    parsed.key
  ].filter((part): part is string => Boolean(part)).join("+");
}

export function normalizeKeyboardShortcuts(value: unknown): KeyboardShortcutBindings {
  if (typeof value !== "object" || value === null) return defaultKeyboardShortcuts;

  const input = value as KeyboardShortcutMap;
  const candidates: KeyboardShortcutBindings = { ...defaultKeyboardShortcuts };
  const explicitActions = new Set<KeyboardShortcutAction>();
  const shortcuts = { ...defaultKeyboardShortcuts };

  for (const action of keyboardShortcutActions) {
    const fallback = defaultKeyboardShortcuts[action];
    const formattedCandidate = formatKeyboardShortcut(input[action]);
    const usesPreviousDefault = formattedCandidate === previousDefaultKeyboardShortcuts[action];
    const candidate = usesPreviousDefault
      ? fallback
      : formattedCandidate;

    candidates[action] = !candidate || reservedKeyboardShortcutChords.has(candidate) ? fallback : candidate;
    if (formattedCandidate && !usesPreviousDefault && !reservedKeyboardShortcutChords.has(formattedCandidate)) {
      explicitActions.add(action);
    }
  }

  const occupiedShortcuts = new Set(Object.values(candidates));
  for (const action of keyboardShortcutActions) {
    const fallbacks = introducedKeyboardShortcutFallbacks[action];
    if (!fallbacks || explicitActions.has(action)) continue;

    // A newly introduced default must not evict an older, explicitly saved custom binding.
    // Move only the new action so existing users keep the shortcut they chose.
    const conflictsWithExplicitAction = keyboardShortcutActions.some(
      (candidateAction) =>
        candidateAction !== action &&
        explicitActions.has(candidateAction) &&
        candidates[candidateAction] === candidates[action]
    );
    if (!conflictsWithExplicitAction) continue;

    const availableFallback = fallbacks.find(
      (fallback) => !occupiedShortcuts.has(fallback) && !reservedKeyboardShortcutChords.has(fallback)
    );
    if (!availableFallback) continue;

    candidates[action] = availableFallback;
    occupiedShortcuts.add(availableFallback);
  }

  const shortcutCounts = new Map<string, number>();
  for (const action of keyboardShortcutActions) {
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
  // Keep capture and matching symmetrical for the invalid Control+Meta chord.
  if (event.metaKey && event.ctrlKey) return false;

  return (
    isKeyboardShortcutModKey(event) === parsed.mod &&
    key.toLowerCase() === parsed.key.toLowerCase() &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift
  );
}
