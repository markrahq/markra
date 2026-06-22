import { fireEvent, renderHook } from "@testing-library/react";
import { defaultAiQuickActionPrompt } from "../lib/ai-actions";
import { useApplicationShortcuts, useNativeMenuHandlers } from "./useNativeBindings";

describe("useNativeMenuHandlers", () => {
  const baseOptions = {
    importLocalImages: vi.fn(),
    insertMarkdownImage: vi.fn(),
    insertMarkdownLink: vi.fn(),
    insertMarkdownSnippet: vi.fn(),
    insertMarkdownTable: vi.fn(),
    openDocument: vi.fn(),
    openFolder: vi.fn(),
    runEditorShortcut: vi.fn(),
    saveDocument: vi.fn(),
    saveDocumentAs: vi.fn()
  };

  it("routes the insert table menu command to the editor table insertion", () => {
    const insertMarkdownLink = vi.fn();
    const insertMarkdownImage = vi.fn();
    const insertMarkdownSnippet = vi.fn();
    const insertMarkdownTable = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        importLocalImages: vi.fn(),
        insertMarkdownImage,
        insertMarkdownLink,
        insertMarkdownSnippet,
        insertMarkdownTable,
        openDocument: vi.fn(),
        openFolder: vi.fn(),
        runEditorShortcut: vi.fn(),
        saveDocument: vi.fn(),
        saveDocumentAs: vi.fn()
      })
    );

    result.current.insertTable?.();

    expect(insertMarkdownTable).toHaveBeenCalledTimes(1);
    expect(insertMarkdownImage).not.toHaveBeenCalled();
    expect(insertMarkdownLink).not.toHaveBeenCalled();
    expect(insertMarkdownSnippet).not.toHaveBeenCalled();
  });

  it("routes the insert image menu command to the editor image insertion", () => {
    const importLocalImages = vi.fn();
    const insertMarkdownImage = vi.fn();
    const insertMarkdownSnippet = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        importLocalImages,
        insertMarkdownImage,
        insertMarkdownSnippet
      })
    );

    result.current.insertImage?.();

    expect(insertMarkdownImage).toHaveBeenCalledTimes(1);
    expect(importLocalImages).not.toHaveBeenCalled();
    expect(insertMarkdownSnippet).not.toHaveBeenCalled();
  });

  it("routes the import local images menu command separately from image insertion", () => {
    const importLocalImages = vi.fn();
    const insertMarkdownImage = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        importLocalImages,
        insertMarkdownImage
      })
    );

    result.current.importLocalImages?.();

    expect(importLocalImages).toHaveBeenCalledTimes(1);
    expect(insertMarkdownImage).not.toHaveBeenCalled();
  });

  it("routes the insert link menu command to the editor link insertion", () => {
    const insertMarkdownLink = vi.fn();
    const insertMarkdownSnippet = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        insertMarkdownLink,
        insertMarkdownSnippet
      })
    );

    result.current.insertLink?.();

    expect(insertMarkdownLink).toHaveBeenCalledTimes(1);
    expect(insertMarkdownSnippet).not.toHaveBeenCalled();
  });

  it("routes native AI context menu commands to localized inline AI actions", () => {
    const runAiQuickAction = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        language: "zh-CN",
        runAiQuickAction
      })
    );

    result.current.aiPolish?.();
    result.current.aiContinueWriting?.();
    result.current.aiTranslate?.();

    expect(runAiQuickAction).toHaveBeenNthCalledWith(
      1,
      "polish",
      defaultAiQuickActionPrompt("polish", "Simplified Chinese")
    );
    expect(runAiQuickAction).toHaveBeenNthCalledWith(
      2,
      "continue",
      defaultAiQuickActionPrompt("continue", "Simplified Chinese")
    );
    expect(runAiQuickAction).toHaveBeenNthCalledWith(
      3,
      "translate",
      defaultAiQuickActionPrompt("translate", "Simplified Chinese")
    );
  });

  it("routes native formatting commands through custom markdown shortcuts", () => {
    const runEditorShortcut = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        markdownShortcuts: {
          bold: "Mod+Alt+B"
        },
        runEditorShortcut
      })
    );

    result.current.formatBold?.();

    expect(runEditorShortcut).toHaveBeenCalledWith("B", {
      altKey: true,
      shiftKey: false
    });
  });

  it("routes shifted digit formatting commands through physical key data", () => {
    const runEditorShortcut = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        runEditorShortcut
      })
    );

    result.current.formatBulletList?.();

    expect(runEditorShortcut).toHaveBeenCalledWith("*", {
      altKey: false,
      code: "Digit8",
      shiftKey: true
    });
  });

  it("routes native edit history commands through editor shortcuts", () => {
    const runEditorShortcut = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        runEditorShortcut
      })
    );

    result.current.editUndo?.();
    result.current.editRedo?.();

    expect(runEditorShortcut).toHaveBeenNthCalledWith(1, "z");
    expect(runEditorShortcut).toHaveBeenNthCalledWith(2, "z", {
      shiftKey: true
    });
  });

  it("keeps native edit history commands inside a focused text input", () => {
    const runEditorShortcut = vi.fn();
    const execCommand = vi.fn().mockReturnValue(true);
    const input = document.createElement("input");
    const originalExecCommand = document.execCommand;
    input.type = "text";
    document.body.append(input);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        runEditorShortcut
      })
    );

    input.focus();

    result.current.editUndo?.();
    result.current.editRedo?.();

    expect(execCommand).toHaveBeenNthCalledWith(1, "undo");
    expect(execCommand).toHaveBeenNthCalledWith(2, "redo");
    expect(runEditorShortcut).not.toHaveBeenCalled();

    input.remove();
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: originalExecCommand
    });
  });

  it("routes the native all-folds command through the configured editor shortcut", () => {
    const runEditorShortcut = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        markdownShortcuts: {
          toggleAllFolds: "Mod+Shift+Alt+F"
        },
        runEditorShortcut
      })
    );

    result.current.toggleAllFolds?.();

    expect(runEditorShortcut).toHaveBeenCalledWith("F", {
      altKey: true,
      shiftKey: true
    });
  });

  it("routes native application commands to app toggles", () => {
    const closeDocument = vi.fn();
    const checkForUpdates = vi.fn();
    const toggleAiAgent = vi.fn();
    const toggleAiCommand = vi.fn();
    const toggleDocumentHistory = vi.fn();
    const toggleFullscreen = vi.fn();
    const toggleMarkdownFiles = vi.fn();
    const toggleReadOnlyMode = vi.fn();
    const toggleSourceMode = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        checkForUpdates,
        closeDocument,
        toggleAiAgent,
        toggleAiCommand,
        toggleDocumentHistory,
        toggleFullscreen,
        toggleMarkdownFiles,
        toggleReadOnlyMode,
        toggleSourceMode
      })
    );

    result.current.closeDocument?.();
    result.current.checkForUpdates?.();
    result.current.toggleFullscreen?.();
    result.current.toggleMarkdownFiles?.();
    result.current.toggleDocumentHistory?.();
    result.current.toggleAiAgent?.();
    result.current.toggleAiCommand?.();
    result.current.toggleSourceMode?.();
    result.current.toggleReadOnlyMode?.();

    expect(closeDocument).toHaveBeenCalledTimes(1);
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
    expect(toggleMarkdownFiles).toHaveBeenCalledTimes(1);
    expect(toggleDocumentHistory).toHaveBeenCalledTimes(1);
    expect(toggleAiAgent).toHaveBeenCalledTimes(1);
    expect(toggleAiCommand).toHaveBeenCalledTimes(1);
    expect(toggleReadOnlyMode).toHaveBeenCalledTimes(1);
    expect(toggleSourceMode).toHaveBeenCalledTimes(1);
  });

  it("routes the native open folder menu command to the folder opener", () => {
    const openFolder = vi.fn();
    const { result } = renderHook(() =>
      useNativeMenuHandlers({
        ...baseOptions,
        openFolder
      })
    );

    result.current.openFolder?.();

    expect(openFolder).toHaveBeenCalledTimes(1);
  });
});

describe("useApplicationShortcuts", () => {
  const baseOptions = {
    openDocument: vi.fn(),
    openFolder: vi.fn(),
    saveDocument: vi.fn(),
    saveDocumentAs: vi.fn()
  };

  it("routes configurable app shortcuts to panel toggles", () => {
    const toggleAiAgent = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        markdownShortcuts: {
          toggleAiAgent: "Mod+Alt+A"
        },
        toggleAiAgent
      })
    );

    fireEvent.keyDown(window, {
      key: "a",
      altKey: true,
      metaKey: true
    });

    expect(toggleAiAgent).toHaveBeenCalledTimes(1);
  });

  it("routes the configurable document history shortcut", () => {
    const toggleDocumentHistory = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        markdownShortcuts: {
          toggleDocumentHistory: "Mod+Alt+H"
        },
        toggleDocumentHistory
      })
    );

    fireEvent.keyDown(window, {
      key: "h",
      altKey: true,
      metaKey: true
    });

    expect(toggleDocumentHistory).toHaveBeenCalledTimes(1);
  });

  it("routes the default document history shortcut", () => {
    const toggleDocumentHistory = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        toggleDocumentHistory
      })
    );

    fireEvent.keyDown(window, {
      key: "h",
      metaKey: true,
      shiftKey: true
    });

    expect(toggleDocumentHistory).toHaveBeenCalledTimes(1);
  });

  it("routes the configurable inline AI command shortcut", () => {
    const toggleAiCommand = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        markdownShortcuts: {
          toggleAiCommand: "Mod+Alt+U"
        },
        toggleAiCommand
      })
    );

    fireEvent.keyDown(window, {
      key: "u",
      altKey: true,
      metaKey: true
    });

    expect(toggleAiCommand).toHaveBeenCalledTimes(1);
  });

  it("routes the default source mode shortcut", () => {
    const toggleSourceMode = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        toggleSourceMode
      })
    );

    fireEvent.keyDown(window, {
      key: "s",
      altKey: true,
      metaKey: true
    });

    expect(toggleSourceMode).toHaveBeenCalledTimes(1);
  });

  it("routes the configurable read-only mode shortcut", () => {
    const toggleReadOnlyMode = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        markdownShortcuts: {
          toggleReadOnlyMode: "Mod+Alt+R"
        },
        toggleReadOnlyMode
      })
    );

    fireEvent.keyDown(window, {
      key: "r",
      altKey: true,
      metaKey: true
    });

    expect(toggleReadOnlyMode).toHaveBeenCalledTimes(1);
  });

  it("closes the current document from the default close shortcut", () => {
    const closeDocument = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        closeDocument
      })
    );

    fireEvent.keyDown(window, {
      key: "w",
      metaKey: true
    });

    expect(closeDocument).toHaveBeenCalledTimes(1);
  });

  it("intercepts the default document search shortcut", () => {
    const openDocumentSearch = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        openDocumentSearch
      })
    );

    const handled = fireEvent.keyDown(window, {
      key: "f",
      metaKey: true
    });

    expect(handled).toBe(false);
    expect(openDocumentSearch).toHaveBeenCalledTimes(1);
  });

  it("intercepts the workspace search shortcut", () => {
    const openWorkspaceSearch = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        openWorkspaceSearch
      })
    );

    const handled = fireEvent.keyDown(window, {
      key: "f",
      metaKey: true,
      shiftKey: true
    });

    expect(handled).toBe(false);
    expect(openWorkspaceSearch).toHaveBeenCalledTimes(1);
  });

  it("opens quick open from Mod+P instead of exporting PDF", () => {
    const exportPdf = vi.fn();
    const openQuickOpen = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        exportPdf,
        openQuickOpen
      })
    );

    const handled = fireEvent.keyDown(window, {
      key: "p",
      metaKey: true
    });

    expect(handled).toBe(false);
    expect(openQuickOpen).toHaveBeenCalledTimes(1);
    expect(exportPdf).not.toHaveBeenCalled();
  });

  it("exports PDF from Mod+Alt+P", () => {
    const exportPdf = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        exportPdf
      })
    );

    fireEvent.keyDown(window, {
      altKey: true,
      key: "p",
      metaKey: true
    });

    expect(exportPdf).toHaveBeenCalledTimes(1);
  });

  it("opens replace from the document search shortcut with Alt", () => {
    const openDocumentReplace = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        openDocumentReplace
      })
    );

    fireEvent.keyDown(window, {
      key: "f",
      altKey: true,
      metaKey: true
    });

    expect(openDocumentReplace).toHaveBeenCalledTimes(1);
  });

  it("opens replace when macOS reports Cmd+Option+F as the option-modified key", () => {
    const openDocumentReplace = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        openDocumentReplace
      })
    );

    const handled = fireEvent.keyDown(window, {
      altKey: true,
      code: "KeyF",
      key: "ƒ",
      metaKey: true
    });

    expect(handled).toBe(false);
    expect(openDocumentReplace).toHaveBeenCalledTimes(1);
  });

  it("opens replace from the native Windows Ctrl+H document replace shortcut", () => {
    const openDocumentReplace = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        openDocumentReplace,
        platform: "windows"
      })
    );

    const handled = fireEvent.keyDown(window, {
      key: "h",
      ctrlKey: true
    });

    expect(handled).toBe(false);
    expect(openDocumentReplace).toHaveBeenCalledTimes(1);
  });

  it("does not intercept Ctrl+H on macOS", () => {
    const openDocumentReplace = vi.fn();
    renderHook(() =>
      useApplicationShortcuts({
        ...baseOptions,
        openDocumentReplace,
        platform: "macos"
      })
    );

    const handled = fireEvent.keyDown(window, {
      ctrlKey: true,
      key: "h"
    });

    expect(handled).toBe(true);
    expect(openDocumentReplace).not.toHaveBeenCalled();
  });
});
