import { describe, expect, it } from "vitest";
import {
  defaultViewModeCustomizations,
  nextViewMode,
  resolveViewModeChrome
} from "./view-mode";

describe("view mode chrome", () => {
  it("keeps the daily mode quiet but fully usable by default", () => {
    expect(resolveViewModeChrome("daily", defaultViewModeCustomizations)).toEqual({
      aiPanel: true,
      documentLinks: true,
      documentTabs: true,
      fileList: true,
      fileTreeButton: true,
      fileTree: true,
      openButton: true,
      outline: true,
      quickCreateButton: true,
      recentFolders: true,
      sidebarLayout: true,
      statusBar: true,
      titlebarActions: true,
      viewModeToggle: true,
      wordCount: true
    });
  });

  it("hides supporting chrome in focus and immersive modes", () => {
    expect(resolveViewModeChrome("focus", defaultViewModeCustomizations)).toEqual({
      aiPanel: false,
      documentLinks: false,
      documentTabs: false,
      fileList: false,
      fileTreeButton: true,
      fileTree: false,
      openButton: true,
      outline: false,
      quickCreateButton: true,
      recentFolders: false,
      sidebarLayout: false,
      statusBar: false,
      titlebarActions: true,
      viewModeToggle: true,
      wordCount: false
    });
    expect(resolveViewModeChrome("immersive", defaultViewModeCustomizations)).toEqual({
      aiPanel: false,
      documentLinks: false,
      documentTabs: false,
      fileList: false,
      fileTreeButton: false,
      fileTree: false,
      openButton: false,
      outline: false,
      quickCreateButton: false,
      recentFolders: false,
      sidebarLayout: false,
      statusBar: false,
      titlebarActions: false,
      viewModeToggle: true,
      wordCount: false
    });
  });

  it("uses custom visibility settings only when custom mode is selected", () => {
    const customizations = {
      ...defaultViewModeCustomizations,
      aiPanel: "hidden" as const,
      documentLinks: "hidden" as const,
      documentTabs: "hidden" as const,
      fileList: "hidden" as const,
      fileTree: "hidden" as const,
      fileTreeButton: "hidden" as const,
      openButton: "hidden" as const,
      outline: "hidden" as const,
      quickCreateButton: "hidden" as const,
      recentFolders: "hidden" as const,
      sidebarLayout: "hidden" as const,
      wordCount: "hidden" as const,
      viewModeToggle: "hidden" as const
    };

    expect(resolveViewModeChrome("custom", customizations)).toMatchObject({
      aiPanel: false,
      documentLinks: false,
      documentTabs: false,
      fileList: false,
      fileTree: true,
      fileTreeButton: false,
      openButton: false,
      outline: false,
      quickCreateButton: false,
      recentFolders: false,
      sidebarLayout: true,
      viewModeToggle: true,
      wordCount: false
    });
    expect(resolveViewModeChrome("full", customizations)).toMatchObject({
      aiPanel: true,
      documentLinks: true,
      documentTabs: true,
      fileList: true,
      fileTree: true,
      fileTreeButton: true,
      openButton: true,
      outline: true,
      quickCreateButton: true,
      recentFolders: true,
      sidebarLayout: true,
      viewModeToggle: true,
      wordCount: true
    });
  });

  it("ignores legacy custom fields that are no longer configurable", () => {
    expect(resolveViewModeChrome("custom", {
      ...defaultViewModeCustomizations,
      fileTree: "hidden",
      sidebarLayout: "hidden",
      viewModeToggle: "hidden"
    })).toMatchObject({
      fileTree: true,
      sidebarLayout: true,
      viewModeToggle: true
    });
  });

  it("cycles through quick titlebar view mode presets", () => {
    expect(nextViewMode("daily")).toBe("focus");
    expect(nextViewMode("focus")).toBe("immersive");
    expect(nextViewMode("immersive")).toBe("full");
    expect(nextViewMode("full")).toBe("daily");
    expect(nextViewMode("custom")).toBe("daily");
    expect(nextViewMode("zen")).toBe("daily");
  });
});
