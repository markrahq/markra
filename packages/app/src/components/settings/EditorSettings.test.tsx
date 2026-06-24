import { fireEvent, render, screen, within } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { defaultEditorPreferences, type EditorPreferences } from "../../lib/settings/app-settings";
import { EditorSettings } from "./EditorSettings";
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

  it("keeps template management out of the editor tab", () => {
    render(
      <EditorSettings
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.queryByRole("heading", { name: "Templates" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add template" })).not.toBeInTheDocument();
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

  it("toggles automatic active file reveal from the editor settings", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <EditorSettings
        preferences={{
          ...defaultEditorPreferences,
          autoRevealActiveFile: true
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.click(screen.getByRole("switch", { name: "Reveal active file automatically" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      autoRevealActiveFile: false
    });
  });

  it("toggles document links from the editor settings", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <EditorSettings
        preferences={{
          ...defaultEditorPreferences,
          documentLinksVisible: false
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.click(screen.getByRole("switch", { name: "Document links" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      documentLinksVisible: true
    });
  });

  it("toggles code block line wrapping from the editor settings", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <EditorSettings
        preferences={{
          ...defaultEditorPreferences,
          wrapCodeBlocks: true
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const wrapSwitch = screen.getByRole("switch", { name: "Wrap code block lines" });

    expect(wrapSwitch).toHaveAttribute("aria-checked", "true");

    fireEvent.click(wrapSwitch);

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      wrapCodeBlocks: false
    });
  });

  it("keeps spellcheck controls out of the editor tab", () => {
    render(
      <EditorSettings
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.queryByRole("switch", { name: "Check spelling" })).not.toBeInTheDocument();
  });

  it("searches and switches the editor font family from the editor settings", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <EditorSettings
        preferences={{
          ...defaultEditorPreferences,
          editorFontFamily: { family: null, source: "theme" }
        }}
        systemFontFamilies={[
          { family: "Example Sans", label: "Example Sans" },
          { family: "Example Serif", label: "Example Serif" }
        ]}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const fontFamilySelect = screen.getByRole("combobox", { name: "Editor font" });

    expect(fontFamilySelect).toHaveValue("Theme default");

    fireEvent.focus(fontFamilySelect);

    expect(fontFamilySelect).toHaveValue("");
    expect(fontFamilySelect).toHaveAttribute("placeholder", "Theme default");
    expect(screen.getByRole("option", { name: "Theme default" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Example Sans" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Example Serif" })).toBeInTheDocument();

    fireEvent.change(fontFamilySelect, { target: { value: "ser" } });

    expect(screen.queryByRole("option", { name: "Example Sans" })).not.toBeInTheDocument();

    const serifOption = screen.getByRole("option", { name: "Example Serif" });
    expect(serifOption.getAttribute("style")).toContain("\"Example Serif\"");

    fireEvent.click(serifOption);

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      editorFontFamily: {
        family: "Example Serif",
        source: "system"
      }
    });
  });

  it("previews the selected editor font family in the closed select text", () => {
    render(
      <EditorSettings
        preferences={{
          ...defaultEditorPreferences,
          editorFontFamily: {
            family: "Example Serif",
            source: "system"
          }
        }}
        systemFontFamilies={[
          { family: "Example Sans", label: "Example Sans" },
          { family: "Example Serif", label: "Example Serif" }
        ]}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    const fontFamilySelect = screen.getByRole("combobox", { name: "Editor font" });

    expect(fontFamilySelect).toHaveValue("Example Serif");
    expect(fontFamilySelect.getAttribute("style")).toContain("\"Example Serif\"");
  });

  it("shows localized font labels while applying CSS font family names", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <EditorSettings
        preferences={{
          ...defaultEditorPreferences,
          editorFontFamily: {
            family: "游明朝",
            source: "system"
          }
        }}
        systemFontFamilies={[{ family: "YuMincho", label: "游明朝" }]}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const fontFamilySelect = screen.getByRole("combobox", { name: "Editor font" });

    expect(fontFamilySelect).toHaveValue("Theme default");

    fireEvent.focus(fontFamilySelect);

    const localizedOption = screen.getByRole("option", { name: "游明朝" });
    expect(screen.queryByRole("option", { name: "YuMincho" })).not.toBeInTheDocument();

    fireEvent.click(localizedOption);

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      editorFontFamily: {
        family: "YuMincho",
        source: "system"
      }
    });
  });

  it("switches the sidebar layout from the editor settings", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <EditorSettings
        preferences={{
          ...defaultEditorPreferences,
          sidebarLayoutMode: "stacked"
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const layoutGroup = screen.getByRole("group", { name: "Sidebar layout" });

    expect(within(layoutGroup).getByRole("button", { name: "Stacked" })).toHaveAttribute("aria-pressed", "true");
    expect(within(layoutGroup).getByRole("button", { name: "Tabs" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(within(layoutGroup).getByRole("button", { name: "Tabs" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      sidebarLayoutMode: "tabs"
    });
  });

  it("toggles extension syntax features from the extended syntax settings", () => {
    const onUpdatePreferences = vi.fn();
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      extendedSyntax: {
        githubAlerts: true,
        highlight: true
      }
    };

    render(
      <EditorSettings
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    expect(screen.getByRole("heading", { name: "Extended syntax" })).toBeInTheDocument();
    const highlightSwitch = screen.getByRole("switch", { name: "Highlight syntax" });
    const githubAlertsSwitch = screen.getByRole("switch", { name: "GitHub-style warning boxes" });
    expect(highlightSwitch).toBeChecked();
    expect(githubAlertsSwitch).toBeChecked();
    expect(screen.queryByRole("note", { name: "GitHub compatibility" })).not.toBeInTheDocument();

    fireEvent.click(highlightSwitch);

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      extendedSyntax: {
        githubAlerts: true,
        highlight: false
      }
    });

    fireEvent.click(githubAlertsSwitch);

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      extendedSyntax: {
        githubAlerts: false,
        highlight: true
      }
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

    fireEvent.click(within(storageType).getByRole("button", { name: "Use PicGo/PicList server" }));
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        provider: "picgo"
      }
    });

    const copyExternalFilesSwitch = screen.getByRole("switch", { name: "Copy pasted files to storage" });
    const storageTypeRow = screen.getByText("Storage type").closest(".settings-row") as HTMLElement | null;
    const copyExternalFilesRow = copyExternalFilesSwitch.closest(".settings-row") as HTMLElement | null;
    expect(storageTypeRow).not.toBeNull();
    expect(copyExternalFilesRow).not.toBeNull();
    expect(
      (storageTypeRow as HTMLElement).compareDocumentPosition(copyExternalFilesRow as HTMLElement)
        & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(copyExternalFilesSwitch).toBeChecked();

    fireEvent.click(copyExternalFilesSwitch);
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      copyExternalFilesToStorage: false
    });
  });

  it("hides S3 storage choices when the runtime cannot upload through S3", () => {
    render(
      <EditorSettings
        preferences={{
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "s3"
          }
        }}
        s3ImageUploadEnabled={false}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    const storageType = screen.getByRole("group", { name: "Storage type" });

    expect(within(storageType).getByRole("button", { name: "Use local storage" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(storageType).getByRole("button", { name: "Use WebDAV storage" })).toBeInTheDocument();
    expect(within(storageType).getByRole("button", { name: "Use PicGo/PicList server" })).toBeInTheDocument();
    expect(within(storageType).queryByRole("button", { name: "Use S3-compatible storage" })).not.toBeInTheDocument();
  });

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
      "Editor view mode",
      "Toggle Markra AI"
    ]);
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toHaveAttribute("data-visible", "true");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toHaveClass("aria-pressed:bg-(--bg-active)");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).not.toHaveClass("aria-pressed:border-(--accent)");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).not.toHaveClass("aria-pressed:shadow-[inset_0_0_0_1px_var(--accent)]");
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toHaveClass("transition-transform");
    expect(screen.getByRole("button", { name: "Save Markdown" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Save Markdown" })).toHaveAttribute("data-visible", "false");

    fireEvent.click(screen.getByRole("button", { name: "Save Markdown" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      titlebarActions: [
        { id: "theme", visible: true },
        { id: "save", visible: true },
        { id: "sourceMode", visible: true },
        { id: "aiAgent", visible: true }
      ]
    });

    const themeButton = screen.getByRole("button", { name: "Switch to dark theme" });
    mockTitlebarActionRects(["theme", "save", "sourceMode", "aiAgent"]);

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
        { id: "sourceMode", visible: true },
        { id: "aiAgent", visible: true },
        { id: "history", visible: true }
      ]
    });

    const sourceModeButton = screen.getByRole("button", { name: "Editor view mode" });

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
        { id: "sourceMode", visible: true },
        { id: "save", visible: false },
        { id: "aiAgent", visible: true },
        { id: "history", visible: true }
      ]
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset toolbar buttons" }));

    expect(onUpdatePreferences).toHaveBeenLastCalledWith({
      ...preferences,
      titlebarActions: [
        { id: "aiAgent", visible: true },
        { id: "sourceMode", visible: true },
        { id: "history", visible: true },
        { id: "save", visible: true },
        { id: "theme", visible: true }
      ]
    });
  });
});
