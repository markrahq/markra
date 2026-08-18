import {
  defaultKeyboardShortcuts,
  formatKeyboardShortcut,
  keyboardShortcutFromKeyboardEvent,
  keyboardShortcutActions,
  keyboardShortcutToKeyboardEventInit,
  keyboardShortcutToNativeAccelerator,
  matchesKeyboardShortcutEvent,
  normalizeKeyboardShortcuts,
  parseKeyboardShortcut
} from "./keyboard-shortcuts";

describe("keyboard shortcuts", () => {
  it("provides a configurable plain text paste shortcut", () => {
    expect(keyboardShortcutActions).toContain("pastePlainText");
    expect(defaultKeyboardShortcuts.pastePlainText).toBe("Mod+Shift+V");
    expect(normalizeKeyboardShortcuts({
      ...defaultKeyboardShortcuts,
      pastePlainText: "Mod+Alt+G"
    }).pastePlainText).toBe("Mod+Alt+G");
  });

  it("keeps default application and editor shortcuts unique", () => {
    const shortcuts = Object.values(defaultKeyboardShortcuts);

    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("includes manual sync as a configurable application shortcut", () => {
    expect(keyboardShortcutActions).toContain("syncNow");
    expect(defaultKeyboardShortcuts.syncNow).toBe("Mod+Alt+R");
    expect(normalizeKeyboardShortcuts({
      syncNow: "Mod+Shift+U"
    }).syncNow).toBe("Mod+Shift+U");
  });

  it("includes read-only mode as a configurable application shortcut", () => {
    expect(keyboardShortcutActions).toContain("toggleReadOnlyMode");
    expect(defaultKeyboardShortcuts.toggleReadOnlyMode).toBe("Mod+Alt+L");
    expect(normalizeKeyboardShortcuts({
      toggleReadOnlyMode: "Mod+Alt+Y"
    }).toggleReadOnlyMode).toBe("Mod+Alt+Y");
  });

  it("includes typewriter mode as a configurable application shortcut", () => {
    expect(keyboardShortcutActions).toContain("toggleTypewriterMode");
    expect(defaultKeyboardShortcuts.toggleTypewriterMode).toBe("Mod+Shift+Y");
    expect(normalizeKeyboardShortcuts({
      toggleTypewriterMode: "Mod+Shift+W"
    }).toggleTypewriterMode).toBe("Mod+Shift+W");
  });

  it("includes Vim mode as a configurable application shortcut", () => {
    expect(keyboardShortcutActions).toContain("toggleVimMode");
    expect(defaultKeyboardShortcuts.toggleVimMode).toBe("Mod+Alt+V");
    expect(normalizeKeyboardShortcuts({
      toggleVimMode: "Mod+Shift+Alt+I"
    }).toggleVimMode).toBe("Mod+Shift+Alt+I");
  });

  it("migrates the previous typewriter shortcut away from the macOS close-all shortcut", () => {
    expect(normalizeKeyboardShortcuts({
      toggleTypewriterMode: "Mod+Alt+W"
    }).toggleTypewriterMode).toBe("Mod+Shift+Y");
    expect(normalizeKeyboardShortcuts({
      bold: "Mod+Alt+W"
    }).bold).toBe(defaultKeyboardShortcuts.bold);
  });

  it("preserves an existing custom shortcut when a new action adopts the same default", () => {
    const normalized = normalizeKeyboardShortcuts({
      syncNow: "Mod+Shift+Y"
    });

    expect(normalized.syncNow).toBe("Mod+Shift+Y");
    expect(normalized.toggleTypewriterMode).toBe("Mod+Shift+Alt+Y");
  });

  it("moves the Vim shortcut when an existing custom action already uses its default", () => {
    const normalized = normalizeKeyboardShortcuts({
      link: "Mod+Alt+V"
    });

    expect(normalized.link).toBe("Mod+Alt+V");
    expect(normalized.toggleVimMode).toBe("Mod+Shift+Alt+V");
  });

  it("records and matches macOS Option-modified letter shortcuts by physical key", () => {
    const event = new KeyboardEvent("keydown", {
      altKey: true,
      code: "KeyW",
      key: "∑",
      metaKey: true
    });

    expect(keyboardShortcutFromKeyboardEvent(event)).toBe("Mod+Alt+W");
    expect(matchesKeyboardShortcutEvent(event, "Mod+Alt+W")).toBe(true);
  });

  it("records, parses, and exactly matches Alt-only digit shortcuts", () => {
    const optionDigit = new KeyboardEvent("keydown", {
      altKey: true,
      code: "Digit1",
      key: "¡"
    });
    const modOptionDigit = new KeyboardEvent("keydown", {
      altKey: true,
      code: "Digit1",
      key: "¡",
      metaKey: true
    });

    expect(parseKeyboardShortcut("Alt+1")).toEqual({
      alt: true,
      key: "1",
      mod: false,
      shift: false
    });
    expect(keyboardShortcutFromKeyboardEvent(optionDigit)).toBe("Alt+1");
    expect(matchesKeyboardShortcutEvent(optionDigit, "Alt+1")).toBe(true);
    expect(matchesKeyboardShortcutEvent(modOptionDigit, "Alt+1")).toBe(false);
    expect(keyboardShortcutToNativeAccelerator("Alt+1")).toBe("Alt+1");
  });

  it("keeps a primary or Alt modifier mandatory", () => {
    expect(parseKeyboardShortcut("1")).toBeNull();
    expect(parseKeyboardShortcut("Shift+1")).toBeNull();
  });

  it("does not record or match shortcuts with both platform modifier keys", () => {
    const event = new KeyboardEvent("keydown", {
      code: "KeyY",
      ctrlKey: true,
      key: "Y",
      metaKey: true,
      shiftKey: true
    });

    expect(keyboardShortcutFromKeyboardEvent(event)).toBeNull();
    expect(matchesKeyboardShortcutEvent(event, "Mod+Shift+Y")).toBe(false);
  });

  it("includes document history as a configurable application shortcut", () => {
    expect(keyboardShortcutActions).toContain("toggleDocumentHistory");
    expect(defaultKeyboardShortcuts.toggleDocumentHistory).toBe("Mod+Shift+H");
    expect(normalizeKeyboardShortcuts({
      toggleDocumentHistory: "Mod+Alt+H"
    }).toggleDocumentHistory).toBe("Mod+Alt+H");
  });

  it("includes quick open as a configurable application shortcut", () => {
    expect(keyboardShortcutActions).toContain("openQuickOpen");
    expect(defaultKeyboardShortcuts.openQuickOpen).toBe("Mod+P");
    expect(normalizeKeyboardShortcuts({
      openQuickOpen: "Mod+Alt+Q"
    }).openQuickOpen).toBe("Mod+Alt+Q");
  });

  it("includes all folds as a configurable editor shortcut", () => {
    expect(keyboardShortcutActions).toContain("toggleAllFolds");
    expect(defaultKeyboardShortcuts.toggleAllFolds).toBe("Mod+Alt+T");
    expect(normalizeKeyboardShortcuts({
      toggleAllFolds: "Mod+Shift+Alt+F"
    }).toggleAllFolds).toBe("Mod+Shift+Alt+F");
  });

  it("includes spelling suggestions as a configurable editor shortcut", () => {
    expect(keyboardShortcutActions).toContain("openSpellcheckSuggestions");
    expect(defaultKeyboardShortcuts.openSpellcheckSuggestions).toBe("Mod+.");
    expect(normalizeKeyboardShortcuts({
      openSpellcheckSuggestions: "Mod+Alt+."
    }).openSpellcheckSuggestions).toBe("Mod+Alt+.");
  });

  it("migrates the previous table shortcut away from all folds", () => {
    expect(defaultKeyboardShortcuts.table).toBe("Mod+Shift+Alt+T");
    expect(normalizeKeyboardShortcuts({
      table: "Mod+Alt+T"
    }).table).toBe("Mod+Shift+Alt+T");
  });

  it("reserves Mod+H for the document replace shortcut", () => {
    expect(normalizeKeyboardShortcuts({
      toggleDocumentHistory: "Mod+H"
    }).toggleDocumentHistory).toBe(defaultKeyboardShortcuts.toggleDocumentHistory);
  });

  it.each([
    "Mod+W",
    "Mod+F",
    "Mod+Alt+F",
    "Mod+Shift+F",
    "Mod+Alt+P"
  ])("reserves the fixed application shortcut %s", (shortcut) => {
    expect(normalizeKeyboardShortcuts({
      toggleAiAgent: shortcut
    }).toggleAiAgent).toBe(defaultKeyboardShortcuts.toggleAiAgent);
  });

  it("uses physical digit keys for shifted digit shortcuts", () => {
    const event = new KeyboardEvent("keydown", {
      code: "Digit8",
      key: "*",
      metaKey: true,
      shiftKey: true
    });

    expect(keyboardShortcutFromKeyboardEvent(event)).toBe("Mod+Shift+8");
    expect(matchesKeyboardShortcutEvent(event, "Mod+Shift+8")).toBe(true);
  });

  it("records and matches punctuation shortcuts", () => {
    const event = new KeyboardEvent("keydown", {
      code: "Slash",
      ctrlKey: true,
      key: "?",
      shiftKey: true
    });

    expect(formatKeyboardShortcut("Mod+/")).toBe("Mod+/");
    expect(keyboardShortcutFromKeyboardEvent(event)).toBe("Mod+Shift+/");
    expect(matchesKeyboardShortcutEvent(event, "Mod+Shift+/")).toBe(true);
  });

  it("creates realistic keyboard event init values for shifted physical keys", () => {
    expect(keyboardShortcutToKeyboardEventInit("Mod+Shift+8")).toEqual({
      altKey: false,
      code: "Digit8",
      key: "*",
      modKey: true,
      shiftKey: true
    });
    expect(keyboardShortcutToKeyboardEventInit("Mod+Shift+/")).toEqual({
      altKey: false,
      code: "Slash",
      key: "?",
      modKey: true,
      shiftKey: true
    });
    expect(keyboardShortcutToKeyboardEventInit("Alt+1")).toEqual({
      altKey: true,
      code: "Digit1",
      key: "1",
      modKey: false,
      shiftKey: false
    });
  });

  it("uses browser-realistic letter casing for synthetic shortcut events", () => {
    expect(keyboardShortcutToKeyboardEventInit("Mod+B")).toEqual({
      altKey: false,
      key: "b",
      modKey: true,
      shiftKey: false
    });
    expect(keyboardShortcutToKeyboardEventInit("Mod+Shift+B")).toEqual({
      altKey: false,
      key: "B",
      modKey: true,
      shiftKey: true
    });
    expect(keyboardShortcutToKeyboardEventInit("Mod+I")?.key).toBe("i");
    expect(keyboardShortcutToKeyboardEventInit("Mod+E")?.key).toBe("e");
    expect(keyboardShortcutToKeyboardEventInit("Mod+Shift+X")?.key).toBe("X");
  });
});
