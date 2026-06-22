import {
  defaultMarkdownShortcuts,
  markdownShortcutToNativeAccelerator,
  normalizeMarkdownShortcuts,
  type MarkdownShortcutAction,
  type MarkdownShortcutMap
} from "@markra/editor";
import { t, type AppLanguage, type I18nKey } from "@markra/shared";
import {
  collapseContextMenuEntries,
  contextMenuItem,
  contextMenuSeparator,
  contextMenuSubmenu,
  type ContextMenuEntry
} from "../components/ContextMenu";
import type {
  NativeEditorContextMenuEntryOptions,
  NativeEditorContextMenuOptions,
  NativeMarkdownFileTreeContextMenuHandlers,
  NativeMenuCommand,
  NativeMenuHandlers
} from "../lib/tauri/menu";
import type { NativeMarkdownFolderFile } from "../lib/tauri/file";

type BrowserEditCommand = "copy" | "cut" | "paste" | "selectAll";

type EditorContextMenuEntryOptions = NativeEditorContextMenuEntryOptions;

export type ContextMenuIdPrefixes = {
  editor: string;
  fileTree: string;
};

const defaultContextMenuIdPrefixes: ContextMenuIdPrefixes = {
  editor: "markra:context",
  fileTree: "markra:file-tree"
};

const nativeMarkdownShortcutCommands: Partial<Record<MarkdownShortcutAction, NativeMenuCommand>> = {
  bold: "formatBold",
  bulletList: "formatBulletList",
  codeBlock: "formatCodeBlock",
  heading1: "formatHeading1",
  heading2: "formatHeading2",
  heading3: "formatHeading3",
  image: "insertImage",
  inlineCode: "formatInlineCode",
  italic: "formatItalic",
  link: "insertLink",
  openQuickOpen: "openQuickOpen",
  orderedList: "formatOrderedList",
  paragraph: "formatParagraph",
  quote: "formatQuote",
  strikethrough: "formatStrikethrough",
  table: "insertTable",
  toggleAiAgent: "toggleAiAgent",
  toggleAiCommand: "toggleAiCommand",
  toggleAllFolds: "toggleAllFolds",
  toggleDocumentHistory: "toggleDocumentHistory",
  toggleMarkdownFiles: "toggleMarkdownFiles",
  toggleReadOnlyMode: "toggleReadOnlyMode",
  toggleSourceMode: "toggleSourceMode"
};

function menuLabel(language: AppLanguage, key: I18nKey) {
  return t(language, key);
}

function shortcutAccelerator(shortcuts: MarkdownShortcutMap | undefined, action: MarkdownShortcutAction): string | undefined {
  const shortcut = normalizeMarkdownShortcuts(shortcuts ?? defaultMarkdownShortcuts)[action];

  return markdownShortcutToNativeAccelerator(shortcut) ?? markdownShortcutToNativeAccelerator(defaultMarkdownShortcuts[action]) ?? undefined;
}

export function nativeAcceleratorsForMarkdownShortcuts(shortcuts: MarkdownShortcutMap | undefined) {
  const accelerators: Partial<Record<NativeMenuCommand, string>> = {};

  if (!shortcuts) return accelerators;

  for (const [action, command] of Object.entries(nativeMarkdownShortcutCommands) as Array<[MarkdownShortcutAction, NativeMenuCommand]>) {
    const accelerator = shortcutAccelerator(shortcuts, action);
    if (accelerator && accelerator !== shortcutAccelerator(defaultMarkdownShortcuts, action)) {
      accelerators[command] = accelerator;
    }
  }

  return accelerators;
}

function runDocumentEditCommand(
  documentTarget: Document,
  command: string,
  showDefaultUI?: boolean,
  value?: string
) {
  const execCommand = (documentTarget as unknown as Record<string, unknown>)["execCommand"];
  if (typeof execCommand !== "function") return false;

  try {
    if (showDefaultUI === undefined && value === undefined) {
      return Boolean(execCommand.call(documentTarget, command));
    }

    return Boolean(execCommand.call(documentTarget, command, showDefaultUI, value));
  } catch {
    return false;
  }
}

async function readBrowserClipboardText(documentTarget: Document) {
  const clipboard = documentTarget.defaultView?.navigator.clipboard;
  const readText = clipboard?.readText;
  if (typeof readText !== "function") return null;

  return readText.call(clipboard);
}

async function pasteClipboardText(
  documentTarget: Document,
  readClipboardText?: NativeEditorContextMenuOptions["readClipboardText"]
) {
  const readText = readClipboardText ?? (() => readBrowserClipboardText(documentTarget));

  try {
    const text = await readText();
    if (!text) return false;

    return runDocumentEditCommand(documentTarget, "insertText", false, text);
  } catch {
    return false;
  }
}

async function runInjectedClipboardPasteCommand(
  documentTarget: Document,
  readClipboardText: NonNullable<NativeEditorContextMenuOptions["readClipboardText"]>
) {
  const handled = await pasteClipboardText(documentTarget, readClipboardText);
  if (handled) return true;

  return runDocumentEditCommand(documentTarget, "paste");
}

function runBrowserEditCommand(command: BrowserEditCommand, options: Pick<EditorContextMenuEntryOptions, "readClipboardText"> = {}) {
  const documentTarget = typeof document === "undefined" ? null : document;
  if (!documentTarget) return false;

  if (command === "paste" && options.readClipboardText) {
    return runInjectedClipboardPasteCommand(documentTarget, options.readClipboardText);
  }

  const handled = runDocumentEditCommand(documentTarget, command);
  if (handled || command !== "paste") return handled;

  return pasteClipboardText(documentTarget);
}

function browserItem(
  id: string,
  label: string,
  accelerator: string,
  command: BrowserEditCommand,
  options: Pick<EditorContextMenuEntryOptions, "readClipboardText"> = {}
) {
  return contextMenuItem(id, label, accelerator, () => runBrowserEditCommand(command, options), false);
}

function readAiCommandsAvailable(options: NativeEditorContextMenuOptions) {
  try {
    return Boolean(options.getAiCommandsAvailable?.());
  } catch {
    return false;
  }
}

export function createEditorContextMenuEntries(
  handlers: NativeMenuHandlers,
  language: AppLanguage = "en",
  options: EditorContextMenuEntryOptions = {},
  idPrefixes: Partial<ContextMenuIdPrefixes> = {}
): ContextMenuEntry[] {
  const prefixes = {
    ...defaultContextMenuIdPrefixes,
    ...idPrefixes
  };
  const editorId = (suffix: string) => `${prefixes.editor}:${suffix}`;
  const label = (key: I18nKey) => menuLabel(language, key);
  const formatItems: ContextMenuEntry[] = [
    contextMenuItem(editorId("bold"), label("menu.bold"), shortcutAccelerator(options.markdownShortcuts, "bold"), handlers.formatBold),
    contextMenuItem(editorId("italic"), label("menu.italic"), shortcutAccelerator(options.markdownShortcuts, "italic"), handlers.formatItalic),
    contextMenuItem(
      editorId("strikethrough"),
      label("menu.strikethrough"),
      shortcutAccelerator(options.markdownShortcuts, "strikethrough"),
      handlers.formatStrikethrough
    ),
    contextMenuItem(
      editorId("inline-code"),
      label("menu.inlineCode"),
      shortcutAccelerator(options.markdownShortcuts, "inlineCode"),
      handlers.formatInlineCode
    ),
    contextMenuSeparator(),
    contextMenuItem(editorId("paragraph"), label("menu.paragraph"), shortcutAccelerator(options.markdownShortcuts, "paragraph"), handlers.formatParagraph),
    contextMenuItem(editorId("heading-1"), label("menu.heading1"), shortcutAccelerator(options.markdownShortcuts, "heading1"), handlers.formatHeading1),
    contextMenuItem(editorId("heading-2"), label("menu.heading2"), shortcutAccelerator(options.markdownShortcuts, "heading2"), handlers.formatHeading2),
    contextMenuItem(editorId("heading-3"), label("menu.heading3"), shortcutAccelerator(options.markdownShortcuts, "heading3"), handlers.formatHeading3),
    contextMenuSeparator(),
    contextMenuItem(editorId("bullet-list"), label("menu.bulletList"), shortcutAccelerator(options.markdownShortcuts, "bulletList"), handlers.formatBulletList),
    contextMenuItem(editorId("ordered-list"), label("menu.orderedList"), shortcutAccelerator(options.markdownShortcuts, "orderedList"), handlers.formatOrderedList),
    contextMenuItem(editorId("quote"), label("menu.quote"), shortcutAccelerator(options.markdownShortcuts, "quote"), handlers.formatQuote),
    contextMenuItem(editorId("code-block"), label("menu.codeBlock"), shortcutAccelerator(options.markdownShortcuts, "codeBlock"), handlers.formatCodeBlock)
  ];
  const exportMenu = contextMenuSubmenu(editorId("export"), label("menu.export"), [
    contextMenuItem(editorId("export-pdf"), label("menu.exportPdf"), "CmdOrCtrl+Alt+P", handlers.exportPdf),
    contextMenuItem(editorId("export-html"), label("menu.exportHtml"), "CmdOrCtrl+Shift+E", handlers.exportHtml),
    contextMenuItem(editorId("export-docx"), label("menu.exportDocx"), undefined, handlers.exportDocx),
    contextMenuItem(editorId("export-epub"), label("menu.exportEpub"), undefined, handlers.exportEpub),
    contextMenuItem(editorId("export-latex"), label("menu.exportLatex"), undefined, handlers.exportLatex)
  ]);
  const entries: ContextMenuEntry[] = [
    browserItem(editorId("cut"), label("menu.cut"), "CmdOrCtrl+X", "cut", options),
    browserItem(editorId("copy"), label("menu.copy"), "CmdOrCtrl+C", "copy", options),
    browserItem(editorId("paste"), label("menu.paste"), "CmdOrCtrl+V", "paste", options),
    browserItem(editorId("select-all"), label("menu.selectAll"), "CmdOrCtrl+A", "selectAll", options),
    contextMenuSeparator(),
    contextMenuSubmenu(editorId("format"), label("menu.format"), formatItems),
    contextMenuSeparator(),
    contextMenuItem(editorId("link"), label("menu.link"), shortcutAccelerator(options.markdownShortcuts, "link"), handlers.insertLink),
    contextMenuItem(editorId("image"), label("menu.image"), shortcutAccelerator(options.markdownShortcuts, "image"), handlers.insertImage),
    contextMenuItem(editorId("import-local-images"), label("menu.importLocalImages"), undefined, handlers.importLocalImages),
    contextMenuItem(editorId("table"), label("menu.table"), shortcutAccelerator(options.markdownShortcuts, "table"), handlers.insertTable)
  ];

  if (!exportMenu.disabled) {
    entries.push(contextMenuSeparator(), exportMenu);
  }

  if (options.aiCommandsAvailable) {
    entries.push(
      contextMenuSeparator(),
      contextMenuSubmenu(editorId("ai"), label("app.aiToolkit"), [
        contextMenuItem(editorId("ai-polish"), label("app.aiPolish"), undefined, handlers.aiPolish),
        contextMenuItem(editorId("ai-rewrite"), label("app.aiRewrite"), undefined, handlers.aiRewrite),
        contextMenuItem(editorId("ai-continue-writing"), label("app.aiContinueWriting"), undefined, handlers.aiContinueWriting),
        contextMenuItem(editorId("ai-summarize"), label("app.aiSummarize"), undefined, handlers.aiSummarize),
        contextMenuItem(editorId("ai-translate"), label("app.aiTranslate"), undefined, handlers.aiTranslate)
      ])
    );
  }

  return collapseContextMenuEntries(entries);
}

export function createEditorContextMenuEntriesFromOptions(
  handlers: NativeMenuHandlers,
  language: AppLanguage,
  options: NativeEditorContextMenuOptions,
  idPrefixes?: Partial<ContextMenuIdPrefixes>
) {
  return createEditorContextMenuEntries(
    handlers,
    language,
    {
      aiCommandsAvailable: readAiCommandsAvailable(options),
      markdownShortcuts: options.markdownShortcuts,
      readClipboardText: options.readClipboardText
    },
    idPrefixes
  );
}

export function createMarkdownFileTreeContextMenuEntries(
  handlers: NativeMarkdownFileTreeContextMenuHandlers,
  language: AppLanguage = "en",
  file?: NativeMarkdownFolderFile,
  idPrefixes: Partial<ContextMenuIdPrefixes> = {}
): ContextMenuEntry[] {
  const prefixes = {
    ...defaultContextMenuIdPrefixes,
    ...idPrefixes
  };
  const fileTreeId = (suffix: string) => `${prefixes.fileTree}:${suffix}`;
  const label = (key: I18nKey) => menuLabel(language, key);
  const fileIsFolder = file?.kind === "folder";
  const fileIsAsset = file?.kind === "asset";
  const multiSelect = Boolean(handlers.multiSelect);
  const templateItems = handlers.createFileFromTemplates?.map((template) =>
    contextMenuItem(fileTreeId(`new-from-template:${template.id}`), template.name, undefined, template.create)
  ) ?? [];
  const entries: ContextMenuEntry[] = [
    contextMenuItem(fileTreeId("new"), label("app.newMarkdownFile"), undefined, handlers.createFile),
    ...(templateItems.length > 0
      ? [contextMenuSubmenu(fileTreeId("new-from-template"), label("app.newMarkdownFileFromTemplate"), templateItems)]
      : []),
    contextMenuItem(fileTreeId("new-folder"), label("app.newMarkdownFolder"), undefined, handlers.createFolder)
  ];

  if (!file) {
    if (handlers.openContainingFolder) {
      entries.push(
        contextMenuSeparator(),
        contextMenuItem(fileTreeId("open-containing-folder"), label("app.openContainingFolder"), undefined, () => handlers.openContainingFolder?.())
      );
    }

    return collapseContextMenuEntries(entries);
  }

  if (fileIsFolder) {
    entries.push(
      contextMenuSeparator(),
      contextMenuItem(fileTreeId("open-containing-folder"), label("app.openContainingFolder"), undefined, () => handlers.openContainingFolder?.(file), !handlers.openContainingFolder),
      contextMenuItem(fileTreeId("rename"), label("app.renameMarkdownFolder"), undefined, () => handlers.renameFile?.(file), !handlers.renameFile),
      contextMenuItem(fileTreeId("delete"), label("app.deleteMarkdownFolder"), undefined, () => handlers.deleteFile?.(file), !handlers.deleteFile)
    );

    return collapseContextMenuEntries(entries);
  }

  entries.push(contextMenuSeparator());
  if (!fileIsAsset && handlers.openFileToSide) {
    const canOpenFileToSide = handlers.canOpenFileToSide?.(file) ?? true;
    const openFileToSideEnabled = canOpenFileToSide && !multiSelect;
    entries.push(
      contextMenuItem(
        fileTreeId("open-to-side"),
        label("app.openDocumentToSide"),
        undefined,
        openFileToSideEnabled ? () => handlers.openFileToSide?.(file) : undefined,
        !openFileToSideEnabled
      )
    );
  }
  if (!fileIsAsset && handlers.saveFileAsTemplate) {
    entries.push(
      contextMenuItem(
        fileTreeId("save-as-template"),
        label("app.saveMarkdownFileAsTemplate"),
        undefined,
        () => handlers.saveFileAsTemplate?.(file),
        multiSelect
      )
    );
  }
  entries.push(
    contextMenuItem(fileTreeId("open-containing-folder"), label("app.openContainingFolder"), undefined, () => handlers.openContainingFolder?.(file), multiSelect || !handlers.openContainingFolder),
    contextMenuItem(fileTreeId("rename"), label("app.renameMarkdownFile"), undefined, () => handlers.renameFile?.(file), multiSelect || !handlers.renameFile),
    contextMenuItem(fileTreeId("delete"), label("app.deleteMarkdownFile"), undefined, () => handlers.deleteFile?.(file), !handlers.deleteFile)
  );

  return collapseContextMenuEntries(entries);
}
