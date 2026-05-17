import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { defaultMarkdownShortcuts } from "@markra/editor";
import { t } from "@markra/shared";
import {
  defaultCustomThemeCss,
  defaultEditorPreferences,
  type EditorPreferences
} from "../lib/settings/app-settings";
import { defaultAiQuickActionPrompt, defaultAiQuickActionPrompts } from "../lib/ai-actions";
import { AiSettings, AppearanceSettings, EditorSettings, KeyboardShortcutsSettings, StorageSettings } from "./SettingsSections";

function translate(key: Parameters<typeof t>[1]) {
  return t("en", key);
}

function translateChinese(key: Parameters<typeof t>[1]) {
  return t("zh-CN", key);
}

function mockTitlebarActionRects(actionIds: string[]) {
  actionIds.forEach((id, index) => {
    const element = document.querySelector(`[data-titlebar-action="${id}"]`) as HTMLElement;
    const left = index * 28;
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      bottom: 24,
      height: 24,
      left,
      right: left + 24,
      top: 0,
      width: 24,
      x: left,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);
  });
}

async function settleSortableDrag() {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 60);
  });
}

describe("AppearanceSettings", () => {
  it("updates the global theme from appearance settings", () => {
    const onSelectTheme = vi.fn();

    render(
      <AppearanceSettings
        customThemeCss=""
        selectedTheme="system"
        translate={translate}
        onUpdateCustomThemeCss={vi.fn()}
        onSelectTheme={onSelectTheme}
      />
    );

    const themeSelect = screen.getByRole("combobox", { name: "Color theme" });

    expect(themeSelect).toHaveValue("system");
    expect(screen.getByRole("option", { name: "System" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dark" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Github" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sepia" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Solarized Light" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Solarized Dark" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Nord" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Catppuccin Latte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Catppuccin Mocha" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Academic" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Minimal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Night" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pixyll" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Custom" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Custom theme CSS" })).not.toBeInTheDocument();

    fireEvent.change(themeSelect, { target: { value: "newsprint" } });

    expect(onSelectTheme).toHaveBeenCalledWith("newsprint");
  });

  it("edits custom theme CSS when the custom theme is selected", () => {
    const onUpdateCustomThemeCss = vi.fn();
    const css = ":root[data-theme=\"custom\"] { --bg-primary: #fdf6e3; }";

    render(
      <AppearanceSettings
        customThemeCss={css}
        selectedTheme="custom"
        translate={translate}
        onUpdateCustomThemeCss={onUpdateCustomThemeCss}
        onSelectTheme={vi.fn()}
      />
    );

    const customCss = screen.getByRole("textbox", { name: "Custom theme CSS" });

    expect(customCss).toHaveValue(css);

    fireEvent.change(customCss, {
      target: { value: ":root[data-theme=\"custom\"] { --accent: #0969da; }" }
    });

    expect(onUpdateCustomThemeCss).toHaveBeenCalledWith(":root[data-theme=\"custom\"] { --accent: #0969da; }");
  });

  it("selects a theme from preview swatches", () => {
    const onSelectTheme = vi.fn();

    render(
      <AppearanceSettings
        customThemeCss=""
        selectedTheme="system"
        translate={translate}
        onUpdateCustomThemeCss={vi.fn()}
        onSelectTheme={onSelectTheme}
      />
    );

    const themePreviews = screen.getByRole("radiogroup", { name: "Theme previews" });
    const systemPreview = within(themePreviews).getByRole("radio", { name: "System" });
    const sepiaPreview = within(themePreviews).getByRole("radio", { name: "Sepia" });

    expect(systemPreview).toHaveAttribute("aria-checked", "true");
    expect(sepiaPreview).toHaveAttribute("aria-checked", "false");

    fireEvent.click(sepiaPreview);

    expect(onSelectTheme).toHaveBeenCalledWith("sepia");
  });

  it("resets the custom theme CSS to the default template", () => {
    const onUpdateCustomThemeCss = vi.fn();

    render(
      <AppearanceSettings
        customThemeCss={":root[data-theme=\"custom\"] { --accent: #b91c1c; }"}
        selectedTheme="custom"
        translate={translate}
        onUpdateCustomThemeCss={onUpdateCustomThemeCss}
        onSelectTheme={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset template" }));

    expect(onUpdateCustomThemeCss).toHaveBeenCalledWith(defaultCustomThemeCss);
  });

  it("imports custom theme CSS from a stylesheet file", async () => {
    const onUpdateCustomThemeCss = vi.fn();
    const importedCss = ":root[data-theme=\"custom\"] { --accent: #2aa198; }";

    render(
      <AppearanceSettings
        customThemeCss=""
        selectedTheme="custom"
        translate={translate}
        onUpdateCustomThemeCss={onUpdateCustomThemeCss}
        onSelectTheme={vi.fn()}
      />
    );

    const fileInput = document.querySelector("input[type=\"file\"]") as HTMLInputElement;

    expect(fileInput).toHaveAttribute("accept", ".css,text/css");

    const cssFile = new File([importedCss], "solarized.css", { type: "text/css" });
    fireEvent.change(fileInput, { target: { files: [cssFile] } });

    await waitFor(() => {
      expect(onUpdateCustomThemeCss).toHaveBeenCalledWith(importedCss);
    });
  });

  it("exports custom theme CSS as a stylesheet file", async () => {
    const css = ":root[data-theme=\"custom\"] { --accent: #8fbcbb; }";
    const objectUrl = "blob:markra-custom-theme";
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickAnchor = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <AppearanceSettings
        customThemeCss={css}
        selectedTheme="custom"
        translate={translate}
        onUpdateCustomThemeCss={vi.fn()}
        onSelectTheme={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSS" }));

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    const exportedBlob = createObjectUrl.mock.calls[0]?.[0] as Blob;
    expect(await exportedBlob.text()).toBe(css);
    expect(clickAnchor).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith(objectUrl);

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    clickAnchor.mockRestore();
  });
});

describe("EditorSettings", () => {
  it("keeps global theme controls out of the editor tab", () => {
    render(
      <EditorSettings
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.queryByRole("combobox", { name: "Color theme" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Editor theme" })).not.toBeInTheDocument();
  });

  it("keeps markdown shortcuts out of the editor tab", () => {
    render(
      <EditorSettings
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.queryByRole("heading", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
  });

  it("toggles document tabs from the editor settings", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <EditorSettings
        preferences={{
          ...defaultEditorPreferences,
          showDocumentTabs: true
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.click(screen.getByRole("switch", { name: "Show document tabs" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      showDocumentTabs: false
    });
  });

  it("keeps AI assistance controls out of the editor settings", () => {
    render(
      <EditorSettings
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.queryByRole("heading", { name: "AI assistance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Show AI on text selection" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Selection AI display" })).not.toBeInTheDocument();
  });
});

describe("AiSettings", () => {
  it("moves editor AI assistance controls into the AI settings tab", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <AiSettings
        language="en"
        preferences={{
          ...defaultEditorPreferences,
          suggestAiPanelForComplexInlinePrompts: true
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    expect(
      screen.getByText(
        "Experimental. Suggest Markra AI for complex inline requests based on local input structure. Turn it off if the prompt feels too eager."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Suggest Markra AI for complex inline requests" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      suggestAiPanelForComplexInlinePrompts: false
    });
  });

  it("selects how AI appears after selecting text", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <AiSettings
        language="en"
        preferences={{
          ...defaultEditorPreferences,
          aiSelectionDisplayMode: "toolbar"
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const group = screen.getByRole("group", { name: "Selection AI display" });
    const quickInputButton = within(group).getByRole("button", { name: "Use quick input" });
    const toolbarButton = within(group).getByRole("button", { name: "Use selection toolbar" });

    expect(toolbarButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(quickInputButton);

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      aiSelectionDisplayMode: "command"
    });
  });

  it("edits and resets AI quick action prompts", () => {
    const onUpdatePreferences = vi.fn();
    const preferences = {
      ...defaultEditorPreferences,
      aiQuickActionPrompts: {
        ...defaultAiQuickActionPrompts,
        polish: "Make the selected text clearer."
      }
    };

    render(
      <AiSettings
        language="en"
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const polishPrompt = screen.getByRole("textbox", { name: "Polish prompt" });

    expect(screen.getByRole("heading", { name: "AI prompts" })).toBeInTheDocument();
    expect(polishPrompt).toHaveValue("Make the selected text clearer.");

    fireEvent.change(polishPrompt, { target: { value: "Make this sharper." } });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      aiQuickActionPrompts: {
        ...defaultAiQuickActionPrompts,
        polish: "Make this sharper."
      }
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset Polish prompt" }));

    expect(onUpdatePreferences).toHaveBeenLastCalledWith({
      ...preferences,
      aiQuickActionPrompts: defaultAiQuickActionPrompts
    });
  });

  it("shows the default prompt when no custom quick action prompt is stored", () => {
    render(
      <AiSettings
        language="en"
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: "Polish prompt" })).toHaveValue(
      defaultAiQuickActionPrompt("polish", "English")
    );
    expect(screen.getByRole("textbox", { name: "Continue writing prompt" })).toHaveValue(
      defaultAiQuickActionPrompt("continue", "English")
    );
  });

  it("keeps non-translation defaults in English while targeting translations to the app language", () => {
    render(
      <AiSettings
        language="zh-CN"
        preferences={defaultEditorPreferences}
        translate={translateChinese}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByRole("textbox", { name: "润色 提示词" })).toHaveValue(
      defaultAiQuickActionPrompt("polish", "Simplified Chinese")
    );
    expect(screen.getByRole("textbox", { name: "翻译 提示词" })).toHaveValue(
      defaultAiQuickActionPrompt("translate", "Simplified Chinese")
    );
  });
});

describe("EditorSettings", () => {
  it("shows storage type in the editor settings", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <EditorSettings
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const storageType = screen.getByRole("group", { name: "Storage type" });
    expect(within(storageType).getByRole("button", { name: "Use local storage" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(within(storageType).getByRole("button", { name: "Use WebDAV storage" }));
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        provider: "webdav"
      }
    });
  });
});

describe("StorageSettings", () => {
  it("switches between provider settings without changing the active storage type", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <StorageSettings
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    expect(screen.queryByText("Storage type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Storage type: Local")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use WebDAV storage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use S3-compatible storage" })).not.toBeInTheDocument();

    const settingsTypeRow = screen.getByText("Settings type").closest(".settings-row") as HTMLElement | null;
    expect(settingsTypeRow).not.toBeNull();
    expect(
      within(settingsTypeRow as HTMLElement).getByText(
        "Change the active storage type in Editor settings. The switch here only chooses which settings to configure."
      )
    ).toBeInTheDocument();

    const settingsType = within(settingsTypeRow as HTMLElement).getByRole("group", { name: "Settings type" });
    expect(within(settingsType).getByRole("button", { name: "Show local settings" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    expect(screen.queryByRole("heading", { name: "Local" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Clipboard image folder" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "WebDAV server URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "S3 endpoint URL" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "File naming pattern" }), {
      target: { value: "{name}-{timestamp}" }
    });
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        fileNamePattern: "{name}-{timestamp}"
      }
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Clipboard image folder" }), {
      target: { value: "media" }
    });
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      clipboardImageFolder: "media"
    });

    fireEvent.click(within(settingsType).getByRole("button", { name: "Show WebDAV settings" }));
    expect(within(settingsType).getByRole("button", { name: "Show WebDAV settings" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByRole("textbox", { name: "Clipboard image folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "WebDAV" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "WebDAV server URL" })).toBeInTheDocument();
    expect(screen.getByLabelText("WebDAV password")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "S3 endpoint URL" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "WebDAV server URL" }), {
      target: { value: "https://dav.example.com/images" }
    });
    fireEvent.change(screen.getByLabelText("WebDAV password"), {
      target: { value: "secret" }
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        webdav: {
          ...defaultEditorPreferences.imageUpload.webdav,
          serverUrl: "https://dav.example.com/images"
        }
      }
    });
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        webdav: {
          ...defaultEditorPreferences.imageUpload.webdav,
          password: "secret"
        }
      }
    });

    fireEvent.click(within(settingsType).getByRole("button", { name: "Show S3-compatible settings" }));
    expect(within(settingsType).getByRole("button", { name: "Show S3-compatible settings" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByRole("textbox", { name: "Clipboard image folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "WebDAV server URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "S3" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "S3 endpoint URL" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "S3 bucket" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "S3 endpoint URL" }), {
      target: { value: "https://s3.example.com" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "S3 bucket" }), {
      target: { value: "markra-images" }
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        s3: {
          ...defaultEditorPreferences.imageUpload.s3,
          endpointUrl: "https://s3.example.com"
        }
      }
    });
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        s3: {
          ...defaultEditorPreferences.imageUpload.s3,
          bucket: "markra-images"
        }
      }
    });
  });
});

describe("EditorSettings", () => {
  it("edits content width as a percentage with a reset button", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <EditorSettings
        preferences={{
          ...defaultEditorPreferences,
          contentWidth: "default",
          contentWidthPx: 980
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const widthInput = screen.getByRole("textbox", { name: "Content width" });
    const resetButton = screen.getByRole("button", { name: "Content width Reset" });

    expect(screen.queryByRole("group", { name: "Content width" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Narrow" })).not.toBeInTheDocument();
    expect(widthInput).toHaveAttribute("inputmode", "numeric");
    expect(widthInput).toHaveAttribute("min", "0");
    expect(widthInput).toHaveAttribute("max", "100");
    expect(widthInput).toHaveValue("53");
    expect(screen.getByText("%")).toBeInTheDocument();
    expect(resetButton.querySelector(".lucide-rotate-ccw")).toBeInTheDocument();

    fireEvent.change(widthInput, { target: { value: "0100" } });

    expect(widthInput).toHaveValue("100");
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      contentWidth: "default",
      contentWidthPx: 1280
    });

    fireEvent.change(widthInput, { target: { value: "80" } });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      contentWidth: "default",
      contentWidthPx: 1152
    });

    fireEvent.change(widthInput, { target: { value: "0" } });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      contentWidth: "default",
      contentWidthPx: 640
    });

    fireEvent.change(widthInput, { target: { value: "200" } });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      contentWidth: "default",
      contentWidthPx: 1280
    });

    fireEvent.click(resetButton);

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      contentWidth: "default",
      contentWidthPx: null
    });
  });

  it("manages titlebar action order and visibility with icon buttons", async () => {
    const onUpdatePreferences = vi.fn();
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      titlebarActions: [
        { id: "theme", visible: true },
        { id: "save", visible: false },
        { id: "splitMode", visible: true },
        { id: "sourceMode", visible: true },
        { id: "aiAgent", visible: true }
      ]
    };

    render(
      <EditorSettings
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const group = screen.getByRole("group", { name: "Toolbar buttons" });
    const buttons = within(group).getAllByRole("button").filter((button) => button.ariaLabel !== "Reset toolbar buttons");

    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Switch to dark theme",
      "Save Markdown",
      "Switch to split mode",
      "Switch to source mode",
      "Toggle Markra AI"
    ]);
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toHaveAttribute("data-visible", "true");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toHaveClass("aria-[pressed=true]:bg-(--bg-active)");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).not.toHaveClass("aria-[pressed=true]:border-(--accent)");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).not.toHaveClass("aria-[pressed=true]:shadow-[inset_0_0_0_1px_var(--accent)]");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toHaveClass("transition-transform");
    expect(screen.getByRole("button", { name: "Save Markdown" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Save Markdown" })).toHaveAttribute("data-visible", "false");

    fireEvent.click(screen.getByRole("button", { name: "Save Markdown" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      titlebarActions: [
        { id: "theme", visible: true },
        { id: "save", visible: true },
        { id: "splitMode", visible: true },
        { id: "sourceMode", visible: true },
        { id: "aiAgent", visible: true }
      ]
    });

    const themeButton = screen.getByRole("button", { name: "Switch to dark theme" });
    mockTitlebarActionRects(["theme", "save", "splitMode", "sourceMode", "aiAgent"]);

    fireEvent.mouseDown(themeButton, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 20, clientY: 10 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 42, clientY: 10 });
    fireEvent.mouseUp(document, { clientX: 42, clientY: 10 });
    await settleSortableDrag();

    expect(onUpdatePreferences).toHaveBeenLastCalledWith({
      ...preferences,
      titlebarActions: [
        { id: "save", visible: false },
        { id: "theme", visible: true },
        { id: "splitMode", visible: true },
        { id: "sourceMode", visible: true },
        { id: "aiAgent", visible: true }
      ]
    });

    const sourceModeButton = screen.getByRole("button", { name: "Switch to source mode" });

    fireEvent.mouseDown(sourceModeButton, {
      button: 0,
      clientX: 80,
      clientY: 10
    });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 70, clientY: 10 });
    fireEvent.mouseMove(document, { buttons: 1, clientX: 52, clientY: 10 });
    fireEvent.mouseUp(document, { clientX: 52, clientY: 10 });
    await settleSortableDrag();

    expect(onUpdatePreferences).toHaveBeenLastCalledWith({
      ...preferences,
      titlebarActions: [
        { id: "theme", visible: true },
        { id: "save", visible: false },
        { id: "sourceMode", visible: true },
        { id: "splitMode", visible: true },
        { id: "aiAgent", visible: true }
      ]
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset toolbar buttons" }));

    expect(onUpdatePreferences).toHaveBeenLastCalledWith({
      ...preferences,
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "sourceMode", visible: true },
        { id: "splitMode", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ]
    });
  });
});

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
    expect(screen.getByRole("button", { name: "Switch to source mode shortcut" })).toHaveTextContent("⌘+⌥+S");
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
    expect(screen.getByRole("button", { name: "Switch to source mode shortcut" })).toHaveTextContent("Ctrl+Alt+S");
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
