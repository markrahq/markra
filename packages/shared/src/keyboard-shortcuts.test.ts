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
});
