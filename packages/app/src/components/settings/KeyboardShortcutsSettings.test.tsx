import { fireEvent, render, screen } from "@testing-library/react";
import { defaultMarkdownShortcuts } from "@markra/editor";
import { translate } from "../../test/settings-components";
import { defaultEditorPreferences, type EditorPreferences } from "../../lib/settings/app-settings";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";

describe("KeyboardShortcutsSettings", () => {
  it("records and resets custom markdown shortcuts", () => {
    const onUpdatePreferences = vi.fn();
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      markdownShortcuts: defaultMarkdownShortcuts
    };

    render(
      <KeyboardShortcutsSettings
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Application" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Editor" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Formatting" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Insert" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Markra AI shortcut" })).toHaveTextContent("⌘+⌥+J");
    expect(screen.getByRole("button", { name: "AI writing command shortcut" })).toHaveTextContent("⌘+⇧+J");
    expect(screen.getByRole("button", { name: "History versions shortcut" })).toHaveTextContent("⌘+⇧+H");
    expect(screen.getByRole("button", { name: "Switch to source mode shortcut" })).toHaveTextContent("⌘+⌥+S");
    expect(screen.getByRole("button", { name: "Toggle read-only mode shortcut" })).toHaveTextContent("⌘+⌥+L");
    expect(screen.getByRole("button", { name: "Link shortcut" })).toHaveTextContent("⌘+K");
    expect(screen.getByRole("button", { name: "Bold shortcut" })).toHaveTextContent("⌘+B");
    expect(screen.queryByText("Mod+B")).not.toBeInTheDocument();

    const boldShortcut = screen.getByRole("button", { name: "Bold shortcut" });
    fireEvent.click(boldShortcut);
    fireEvent.keyDown(boldShortcut, {
      key: "b",
      altKey: true,
      metaKey: true
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        bold: "Mod+Alt+B"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset keyboard shortcuts" }));

    expect(onUpdatePreferences).toHaveBeenLastCalledWith({
      ...preferences,
      markdownShortcuts: defaultMarkdownShortcuts
    });
  });

  it("records shortcuts from the active window while capture is active", () => {
    const onUpdatePreferences = vi.fn();
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      markdownShortcuts: defaultMarkdownShortcuts
    };

    render(
      <KeyboardShortcutsSettings
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Bold shortcut" }));
    fireEvent.keyDown(window, {
      key: "b",
      altKey: true,
      metaKey: true
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        bold: "Mod+Alt+B"
      }
    });
  });

  it("records shifted digit and punctuation shortcuts from physical keys", () => {
    const onUpdatePreferences = vi.fn();
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      markdownShortcuts: defaultMarkdownShortcuts
    };

    render(
      <KeyboardShortcutsSettings
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Bullet List shortcut" }));
    fireEvent.keyDown(window, {
      code: "Digit8",
      key: "*",
      metaKey: true,
      shiftKey: true
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        bulletList: "Mod+Shift+8"
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Link shortcut" }));
    fireEvent.keyDown(window, {
      code: "Slash",
      key: "?",
      metaKey: true,
      shiftKey: true
    });

    expect(onUpdatePreferences).toHaveBeenLastCalledWith({
      ...preferences,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        link: "Mod+Shift+/"
      }
    });
  });

  it("swaps existing shortcuts when recording a chord already used by another action", () => {
    const onUpdatePreferences = vi.fn();
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      markdownShortcuts: defaultMarkdownShortcuts
    };

    render(
      <KeyboardShortcutsSettings
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Link shortcut" }));
    fireEvent.keyDown(window, {
      code: "Digit8",
      key: "*",
      metaKey: true,
      shiftKey: true
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        bulletList: "Mod+K",
        link: "Mod+Shift+8"
      }
    });
  });

  it("uses Ctrl labels for markdown shortcuts on Windows and Linux", () => {
    render(
      <KeyboardShortcutsSettings
        platform="windows"
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Bold shortcut" })).toHaveTextContent("Ctrl+B");
    expect(screen.getByRole("button", { name: "Toggle Markra AI shortcut" })).toHaveTextContent("Ctrl+Alt+J");
    expect(screen.getByRole("button", { name: "AI writing command shortcut" })).toHaveTextContent("Ctrl+Shift+J");
    expect(screen.getByRole("button", { name: "History versions shortcut" })).toHaveTextContent("Ctrl+Shift+H");
    expect(screen.getByRole("button", { name: "Switch to source mode shortcut" })).toHaveTextContent("Ctrl+Alt+S");
    expect(screen.getByRole("button", { name: "Toggle read-only mode shortcut" })).toHaveTextContent("Ctrl+Alt+L");
    expect(screen.getByRole("button", { name: "Link shortcut" })).toHaveTextContent("Ctrl+K");
    expect(screen.getByRole("button", { name: "Strikethrough shortcut" })).toHaveTextContent("Ctrl+Shift+X");
  });

  it("records app-level shortcuts from the keyboard shortcuts tab", () => {
    const onUpdatePreferences = vi.fn();
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      markdownShortcuts: defaultMarkdownShortcuts
    };

    render(
      <KeyboardShortcutsSettings
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle Markra AI shortcut" }));
    fireEvent.keyDown(window, {
      key: "j",
      altKey: true,
      metaKey: true,
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        toggleAiAgent: "Mod+Alt+J"
      }
    });
  });

  it("records the document history shortcut from the keyboard shortcuts tab", () => {
    const onUpdatePreferences = vi.fn();
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      markdownShortcuts: defaultMarkdownShortcuts
    };

    render(
      <KeyboardShortcutsSettings
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "History versions shortcut" }));
    fireEvent.keyDown(window, {
      key: "h",
      altKey: true,
      metaKey: true,
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      markdownShortcuts: {
        ...defaultMarkdownShortcuts,
        toggleDocumentHistory: "Mod+Alt+H"
      }
    });
  });

  it("leaves recording mode when shortcuts are reset", () => {
    render(
      <KeyboardShortcutsSettings
        preferences={{
          ...defaultEditorPreferences,
          markdownShortcuts: {
            ...defaultMarkdownShortcuts,
            bold: "Mod+Alt+B"
          }
        }}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    const boldShortcut = screen.getByRole("button", { name: "Bold shortcut" });
    fireEvent.click(boldShortcut);

    expect(boldShortcut).toHaveTextContent("Press keys");

    fireEvent.click(screen.getByRole("button", { name: "Reset keyboard shortcuts" }));

    expect(boldShortcut).toHaveTextContent("⌘+⌥+B");
  });
});
