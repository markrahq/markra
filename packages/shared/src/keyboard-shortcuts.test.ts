import {
  defaultKeyboardShortcuts,
  formatKeyboardShortcut,
  keyboardShortcutFromKeyboardEvent,
  keyboardShortcutActions,
  keyboardShortcutToKeyboardEventInit,
  matchesKeyboardShortcutEvent,
  normalizeKeyboardShortcuts
} from "./keyboard-shortcuts";

describe("keyboard shortcuts", () => {
  it("keeps default application and editor shortcuts unique", () => {
    const shortcuts = Object.values(defaultKeyboardShortcuts);

    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("includes manual sync as a configurable application shortcut", () => {
    expect(keyboardShortcutActions).toContain("syncNow");
    expect(defaultKeyboardShortcuts.syncNow).toBe("Mod+Alt+R");
    expect(normalizeKeyboardShortcuts({
      syncNow: "Mod+Shift+Y"
    }).syncNow).toBe("Mod+Shift+Y");
  });

  it("includes read-only mode as a configurable application shortcut", () => {
    expect(keyboardShortcutActions).toContain("toggleReadOnlyMode");
    expect(defaultKeyboardShortcuts.toggleReadOnlyMode).toBe("Mod+Alt+L");
    expect(normalizeKeyboardShortcuts({
      toggleReadOnlyMode: "Mod+Alt+Y"
    }).toggleReadOnlyMode).toBe("Mod+Alt+Y");
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
      openQuickOpen: "Mod+Alt+P"
    }).openQuickOpen).toBe("Mod+Alt+P");
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
      shiftKey: true
    });
    expect(keyboardShortcutToKeyboardEventInit("Mod+Shift+/")).toEqual({
      altKey: false,
      code: "Slash",
      key: "?",
      shiftKey: true
    });
  });
});
