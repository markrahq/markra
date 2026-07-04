import { fireEvent, render, screen, within } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { defaultEditorPreferences } from "../../lib/settings/app-settings";
import { ViewSettings } from "./ViewSettings";

describe("ViewSettings", () => {
  it("selects a view mode preset from the view settings", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <ViewSettings
        preferences={defaultEditorPreferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "View mode" }), {
      target: { value: "focus" }
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      viewMode: "focus"
    });
  });

  it("edits custom view mode visibility directly from the element grid", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <ViewSettings
        preferences={{
          ...defaultEditorPreferences,
          viewMode: "custom"
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const visibilityList = screen.getByRole("list", { name: "Element visibility" });
    const visibilityGrid = within(visibilityList);

    expect(screen.queryByRole("group", { name: "Visible elements" })).not.toBeInTheDocument();
    expect(screen.queryByText("Choose the workspace elements shown in custom view mode.")).not.toBeInTheDocument();
    const sidebarGroup = within(screen.getByRole("group", { name: "Sidebar" }));
    const titlebarGroup = within(screen.getByRole("group", { name: "Title bar" }));
    const workspaceGroup = within(screen.getByRole("group", { name: "Workspace" }));

    expect(visibilityGrid.queryByRole("switch", { name: "File tree" })).not.toBeInTheDocument();
    expect(sidebarGroup.getByRole("switch", { name: "Sidebar" })).toBeChecked();
    expect(sidebarGroup.getByRole("switch", { name: "Recently used directories" })).toBeInTheDocument();
    expect(sidebarGroup.getByRole("switch", { name: "File list" })).toBeInTheDocument();
    expect(sidebarGroup.getByRole("switch", { name: "Outline" })).toBeInTheDocument();
    expect(sidebarGroup.queryByRole("switch", { name: "Sidebar layout" })).not.toBeInTheDocument();
    expect(sidebarGroup.getByRole("switch", { name: "Document links" })).toBeInTheDocument();
    expect(titlebarGroup.getByRole("switch", { name: "Title bar" })).toBeChecked();
    expect(titlebarGroup.getByRole("switch", { name: "File list button" })).toBeInTheDocument();
    expect(titlebarGroup.getByRole("switch", { name: "Open file/folder button" })).toBeInTheDocument();
    expect(titlebarGroup.getByRole("switch", { name: "New file button" })).toBeInTheDocument();
    expect(titlebarGroup.getByRole("switch", { name: "Top-right button group" })).toBeInTheDocument();
    expect(workspaceGroup.getByRole("switch", { name: "Workspace" })).toBeChecked();
    expect(workspaceGroup.getByRole("switch", { name: "Show word count" })).toBeInTheDocument();
    expect(visibilityGrid.queryByRole("switch", { name: "View mode button" })).not.toBeInTheDocument();

    fireEvent.click(titlebarGroup.getByRole("switch", { name: "Open file/folder button" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      viewMode: "custom",
      viewModeCustomizations: {
        ...defaultEditorPreferences.viewModeCustomizations,
        openButton: "hidden"
      }
    });
  });

  it("toggles a custom view mode group from its category switch", () => {
    const onUpdatePreferences = vi.fn();

    render(
      <ViewSettings
        preferences={{
          ...defaultEditorPreferences,
          viewMode: "custom"
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.click(within(screen.getByRole("group", { name: "Sidebar" })).getByRole("switch", { name: "Sidebar" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      viewMode: "custom",
      viewModeCustomizations: {
        ...defaultEditorPreferences.viewModeCustomizations,
        documentLinks: "hidden",
        fileList: "hidden",
        outline: "hidden",
        recentFolders: "hidden"
      }
    });
  });

  it("treats a partially visible custom group as enabled so the group switch can hide it", () => {
    const onUpdatePreferences = vi.fn();
    const preferences = {
      ...defaultEditorPreferences,
      viewMode: "custom" as const,
      viewModeCustomizations: {
        ...defaultEditorPreferences.viewModeCustomizations,
        fileList: "hidden" as const
      }
    };

    render(
      <ViewSettings
        preferences={preferences}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const sidebarGroup = within(screen.getByRole("group", { name: "Sidebar" }));

    expect(sidebarGroup.getByRole("switch", { name: "Sidebar" })).toBeChecked();

    fireEvent.click(sidebarGroup.getByRole("switch", { name: "Sidebar" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      viewModeCustomizations: {
        ...preferences.viewModeCustomizations,
        documentLinks: "hidden",
        fileList: "hidden",
        outline: "hidden",
        recentFolders: "hidden"
      }
    });
  });

  it("lists resolved element visibility for the selected preset", () => {
    render(
      <ViewSettings
        preferences={{
          ...defaultEditorPreferences,
          viewMode: "immersive"
        }}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    const visibilityList = screen.getByRole("list", { name: "Element visibility" });

    expect(visibilityList).toBeInTheDocument();
    expect(visibilityList.closest(".settings-row")).toBeNull();
    expect(visibilityList).toHaveClass("w-full");
    expect(within(visibilityList).queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText("Current state for each element in this view mode.")).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "File tree: Hidden" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Recently used directories: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "File list: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Outline: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "File list button: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Open file/folder button: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "New file button: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Document tabs: Hidden" })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Sidebar layout: Hidden" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Document links: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "AI panel: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Status bar: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Show word count: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Top-right button group: Hidden" })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "View mode button: Visible" })).not.toBeInTheDocument();
  });

  it("lists custom element visibility from the custom mode switches", () => {
    render(
      <ViewSettings
        preferences={{
          ...defaultEditorPreferences,
          viewMode: "custom",
          viewModeCustomizations: {
            ...defaultEditorPreferences.viewModeCustomizations,
            documentLinks: "hidden",
            fileTreeButton: "hidden",
            fileList: "hidden",
            openButton: "hidden",
            outline: "hidden",
            recentFolders: "hidden",
            wordCount: "hidden"
          }
        }}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    const visibilityGrid = within(screen.getByRole("list", { name: "Element visibility" }));

    expect(screen.queryByRole("listitem", { name: "File tree: Visible" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Recently used directories: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "File list: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Outline: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "File list button: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Open file/folder button: Hidden" })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Sidebar layout: Hidden" })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Document links: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Show word count: Hidden" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Top-right button group: Visible" })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "View mode button: Visible" })).not.toBeInTheDocument();
    expect(visibilityGrid.queryByRole("switch", { name: "File tree" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Sidebar" })).getByRole("switch", { name: "Sidebar" })).not.toBeChecked();
    expect(within(screen.getByRole("group", { name: "Sidebar" })).getByRole("switch", { name: "Recently used directories" })).not.toBeChecked();
    expect(within(screen.getByRole("group", { name: "Sidebar" })).getByRole("switch", { name: "File list" })).not.toBeChecked();
    expect(within(screen.getByRole("group", { name: "Sidebar" })).getByRole("switch", { name: "Outline" })).not.toBeChecked();
    expect(within(screen.getByRole("group", { name: "Title bar" })).getByRole("switch", { name: "Title bar" })).toBeChecked();
    expect(within(screen.getByRole("group", { name: "Title bar" })).getByRole("switch", { name: "File list button" })).not.toBeChecked();
    expect(within(screen.getByRole("group", { name: "Title bar" })).getByRole("switch", { name: "Open file/folder button" })).not.toBeChecked();
  });
});
