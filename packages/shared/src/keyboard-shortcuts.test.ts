import {
  defaultKeyboardShortcuts,
  keyboardShortcutActions,
  normalizeKeyboardShortcuts
} from "./keyboard-shortcuts";

describe("keyboard shortcuts", () => {
  it("includes read-only mode as a configurable application shortcut", () => {
    expect(keyboardShortcutActions).toContain("toggleReadOnlyMode");
    expect(defaultKeyboardShortcuts.toggleReadOnlyMode).toBe("Mod+Alt+L");
    expect(normalizeKeyboardShortcuts({
      toggleReadOnlyMode: "Mod+Alt+R"
    }).toggleReadOnlyMode).toBe("Mod+Alt+R");
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

  it("reserves Mod+H for the document replace shortcut", () => {
    expect(normalizeKeyboardShortcuts({
      toggleDocumentHistory: "Mod+H"
    }).toggleDocumentHistory).toBe(defaultKeyboardShortcuts.toggleDocumentHistory);
  });
});
