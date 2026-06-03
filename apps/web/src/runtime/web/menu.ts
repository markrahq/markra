import type {
  AppMenuRuntime,
  NativeEditorContextMenuOptions,
  NativeMarkdownFolderFile,
  NativeMarkdownFileTreeContextMenuHandlers,
  RuntimeCleanup
} from "@markra/app/runtime";
import {
  createEditorContextMenuEntries,
  createEditorContextMenuEntriesFromOptions,
  createMarkdownFileTreeContextMenuEntries,
  contextMenuPositionFromEvent,
  currentContextMenuPosition,
  showContextMenu,
  type ContextMenuIdPrefixes
} from "@markra/app/runtime";
import type { AppLanguage } from "@markra/shared";
import type { WebRuntimeOptions } from "./types";

const webContextMenuIdPrefixes: ContextMenuIdPrefixes = {
  editor: "markra:web-context",
  fileTree: "markra:web-file-tree"
};

function resolveDocument(options: WebRuntimeOptions): Document | null {
  return options.document ?? (typeof document === "undefined" ? null : document);
}

export function createWebMenuRuntime(
  defaultMenuRuntime: AppMenuRuntime,
  options: WebRuntimeOptions
): AppMenuRuntime {
  return {
    ...defaultMenuRuntime,
    createEditorContextMenuItems: (handlers, language, menuOptions) =>
      createEditorContextMenuEntries(handlers, language, menuOptions, webContextMenuIdPrefixes),
    createMarkdownFileTreeContextMenuItems: (handlers, language, file) =>
      createMarkdownFileTreeContextMenuEntries(handlers, language, file, webContextMenuIdPrefixes),
    installEditorContextMenu: async (target, handlers, language = "en", menuOptions = {}) => {
      let closeCurrentMenu: RuntimeCleanup | null = null;
      const handleContextMenu = (event: Event) => {
        const documentTarget = resolveDocument(options);
        const mouseEvent = event instanceof MouseEvent ? event : null;
        const element = event.target instanceof Element ? event.target : null;
        if (!documentTarget || !mouseEvent || !element?.closest(".markdown-paper")) return;

        event.preventDefault();
        event.stopPropagation();
        closeCurrentMenu?.();
        closeCurrentMenu = showContextMenu(documentTarget, {
          entries: createEditorContextMenuEntriesFromOptions(
            handlers,
            language,
            menuOptions,
            webContextMenuIdPrefixes
          ),
          position: contextMenuPositionFromEvent(mouseEvent)
        });
      };

      target.addEventListener("contextmenu", handleContextMenu);

      return () => {
        target.removeEventListener("contextmenu", handleContextMenu);
        closeCurrentMenu?.();
      };
    },
    showMarkdownFileTreeContextMenu: async (
      handlers: NativeMarkdownFileTreeContextMenuHandlers,
      language?: AppLanguage,
      file?: NativeMarkdownFolderFile
    ) => {
      const documentTarget = resolveDocument(options);
      if (!documentTarget) return;

      showContextMenu(documentTarget, {
        entries: createMarkdownFileTreeContextMenuEntries(
          handlers,
          language,
          file,
          webContextMenuIdPrefixes
        ),
        position: currentContextMenuPosition(documentTarget)
      });
    }
  };
}
