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
  NativeEditorContextMenuOptions,
  NativeMarkdownFileTreeContextMenuHandlers,
  NativeMenuCommand,
  NativeMenuHandlers
} from "../lib/tauri/menu";
import type { NativeMarkdownFolderFile } from "../lib/tauri/file";

type BrowserEditCommand = "copy" | "cut" | "paste" | "selectAll";

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
  orderedList: "formatOrderedList",
  paragraph: "formatParagraph",
  quote: "formatQuote",
  strikethrough: "formatStrikethrough",
  table: "insertTable",
  toggleAiAgent: "toggleAiAgent",
  toggleAiCommand: "toggleAiCommand",
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

function runBrowserEditCommand(command: BrowserEditCommand) {
  const documentTarget = typeof document === "undefined" ? null : document;
  const execCommand = documentTarget
    ? (documentTarget as unknown as Record<string, unknown>)["execCommand"]
    : null;
  if (typeof execCommand === "function") {
    execCommand.call(documentTarget, command);
  }
}

function browserItem(id: string, label: string, accelerator: string, command: BrowserEditCommand) {
  return contextMenuItem(id, label, accelerator, () => runBrowserEditCommand(command), false);
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
  options: { aiCommandsAvailable?: boolean; markdownShortcuts?: MarkdownShortcutMap } = {},
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
    contextMenuItem(editorId("export-pdf"), label("menu.exportPdf"), "CmdOrCtrl+P", handlers.exportPdf),
    contextMenuItem(editorId("export-html"), label("menu.exportHtml"), "CmdOrCtrl+Shift+E", handlers.exportHtml),
    contextMenuItem(editorId("export-docx"), label("menu.exportDocx"), undefined, handlers.exportDocx),
    contextMenuItem(editorId("export-epub"), label("menu.exportEpub"), undefined, handlers.exportEpub),
    contextMenuItem(editorId("export-latex"), label("menu.exportLatex"), undefined, handlers.exportLatex)
  ]);
  const entries: ContextMenuEntry[] = [
    browserItem(editorId("cut"), label("menu.cut"), "CmdOrCtrl+X", "cut"),
    browserItem(editorId("copy"), label("menu.copy"), "CmdOrCtrl+C", "copy"),
    browserItem(editorId("paste"), label("menu.paste"), "CmdOrCtrl+V", "paste"),
    browserItem(editorId("select-all"), label("menu.selectAll"), "CmdOrCtrl+A", "selectAll"),
    contextMenuSeparator(),
    contextMenuSubmenu(editorId("format"), label("menu.format"), formatItems),
    contextMenuSeparator(),
    contextMenuItem(editorId("link"), label("menu.link"), shortcutAccelerator(options.markdownShortcuts, "link"), handlers.insertLink),
    contextMenuItem(editorId("image"), label("menu.image"), shortcutAccelerator(options.markdownShortcuts, "image"), handlers.insertImage),
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
      markdownShortcuts: options.markdownShortcuts
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

  if (!file) return collapseContextMenuEntries(entries);

  if (fileIsFolder) {
    entries.push(
      contextMenuSeparator(),
      contextMenuItem(fileTreeId("delete"), label("app.deleteMarkdownFolder"), undefined, () => handlers.deleteFile?.(file), !handlers.deleteFile)
    );

    return collapseContextMenuEntries(entries);
  }

  entries.push(contextMenuSeparator());
  if (!fileIsAsset && handlers.openFileToSide) {
    const canOpenFileToSide = handlers.canOpenFileToSide?.(file) ?? true;
    entries.push(
      contextMenuItem(
        fileTreeId("open-to-side"),
        label("app.openDocumentToSide"),
        undefined,
        canOpenFileToSide ? () => handlers.openFileToSide?.(file) : undefined,
        !canOpenFileToSide
      )
    );
  }
  if (!fileIsAsset && handlers.saveFileAsTemplate) {
    entries.push(
      contextMenuItem(
        fileTreeId("save-as-template"),
        label("app.saveMarkdownFileAsTemplate"),
        undefined,
        () => handlers.saveFileAsTemplate?.(file)
      )
    );
  }
  entries.push(
    contextMenuItem(fileTreeId("rename"), label("app.renameMarkdownFile"), undefined, () => handlers.renameFile?.(file), !handlers.renameFile),
    contextMenuItem(fileTreeId("delete"), label("app.deleteMarkdownFile"), undefined, () => handlers.deleteFile?.(file), !handlers.deleteFile)
  );

  return collapseContextMenuEntries(entries);
}
