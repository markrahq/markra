import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  headingSchema,
  orderedListSchema,
  paragraphSchema
} from "@milkdown/kit/preset/commonmark";
import {
  tableCellSchema,
  tableHeaderRowSchema,
  tableHeaderSchema,
  tableRowSchema,
  tableSchema
} from "@milkdown/kit/preset/gfm";
import type { NodeType } from "@milkdown/kit/prose/model";
import { setBlockType, wrapIn } from "@milkdown/kit/prose/commands";
import { Plugin, PluginKey, TextSelection, type Command, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { wrapInList } from "@milkdown/kit/prose/schema-list";
import { $prose } from "@milkdown/kit/utils";
import { markdownCalloutMarkerForType, popoverPosition, type MarkdownCalloutType } from "@markra/shared";

export type SlashCommandId =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "quote"
  | "callout"
  | "codeBlock"
  | "table";

export type SlashCommandLabels = {
  menu: string;
  noResults: string;
  commands: Record<SlashCommandId, string>;
};

export type SlashCommandOptions = {
  callout?: boolean;
};

type SlashCommandRange = {
  from: number;
  query: string;
  source: "typed" | "virtual";
  to: number;
};

type SuppressedSlashCommandRange = Pick<SlashCommandRange, "from" | "to">;

type SlashCommandState = {
  active: SlashCommandRange | null;
  selectedIndex: number;
  suppressed: SuppressedSlashCommandRange | null;
};

type SlashCommandMeta =
  | {
      type: "close";
    }
  | {
      type: "open";
    }
  | {
      selectedIndex: number;
      type: "select";
    };

type SlashCommandSpec = {
  aliases: string[];
  id: SlashCommandId;
  label: string;
  run: (view: EditorView, range: SlashCommandRange) => boolean;
};

const slashCommandsKey = new PluginKey<SlashCommandState>("markra-slash-commands");
const emptySlashCommandState: SlashCommandState = {
  active: null,
  selectedIndex: 0,
  suppressed: null
};

export const defaultSlashCommandLabels: SlashCommandLabels = {
  menu: "Slash commands",
  noResults: "No matching commands",
  commands: {
    bulletList: "Bullet List",
    codeBlock: "Code Block",
    heading1: "Heading 1",
    heading2: "Heading 2",
    heading3: "Heading 3",
    orderedList: "Ordered List",
    paragraph: "Paragraph",
    callout: "Callout",
    quote: "Quote",
    table: "Table"
  }
};

function clampSelectedIndex(index: number, commandsLength: number) {
  if (commandsLength <= 0) return 0;

  return Math.max(0, Math.min(index, commandsLength - 1));
}

function sameRange(left: SuppressedSlashCommandRange | null, right: SuppressedSlashCommandRange | null) {
  return Boolean(left && right && left.from === right.from && left.to === right.to);
}

function slashRangeFromState(state: EditorState): SlashCommandRange | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;

  const beforeCursor = $from.parent.textContent.slice(0, $from.parentOffset);
  const afterCursor = $from.parent.textContent.slice($from.parentOffset);
  if (afterCursor.length > 0) return null;

  const match = beforeCursor.match(/^\/([^\s/]*)$/u);
  if (!match) return null;

  return {
    from: selection.from - beforeCursor.length,
    query: match[1] ?? "",
    source: "typed",
    to: selection.from
  };
}

function virtualSlashRangeFromState(state: EditorState, from = state.selection.from): SlashCommandRange | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;

  const afterCursor = $from.parent.textContent.slice($from.parentOffset);
  if (afterCursor.length > 0) return null;

  const textOffset = from - $from.start();
  if (textOffset < 0 || textOffset > $from.parentOffset) return null;

  const query = $from.parent.textContent.slice(textOffset, $from.parentOffset);
  if (/[\s/]/u.test(query)) return null;

  return {
    from,
    query,
    source: "virtual",
    to: selection.from
  };
}

function continuedVirtualSlashRangeFromState(
  state: EditorState,
  transaction: Transaction,
  previousState: SlashCommandState
) {
  if (previousState.active?.source !== "virtual") return null;

  const from = transaction.mapping.map(previousState.active.from, -1);
  return virtualSlashRangeFromState(state, from);
}

function normalizedSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/gu, "");
}

function filterSlashCommands(commands: SlashCommandSpec[], query: string) {
  const normalizedQuery = normalizedSearchText(query);
  if (!normalizedQuery) return commands;

  return commands.filter((command) => {
    const haystacks = [command.id, command.label, ...command.aliases];

    return haystacks.some((candidate) => normalizedSearchText(candidate).includes(normalizedQuery));
  });
}

function runCommandAfterDeletingSlash(view: EditorView, range: SlashCommandRange, command: Command) {
  let deleteTransaction = view.state.tr.delete(range.from, range.to);
  deleteTransaction = deleteTransaction
    .setSelection(TextSelection.create(deleteTransaction.doc, range.from))
    .scrollIntoView();
  view.dispatch(deleteTransaction);

  const handled = command(view.state, view.dispatch, view);
  if (handled) view.focus();

  return handled;
}

function createTableCell(
  view: EditorView,
  cellType: NodeType,
  paragraph: NodeType,
  text = ""
) {
  const content = text ? paragraph.create(null, view.state.schema.text(text)) : paragraph.create();

  return cellType.create(null, content);
}

function createDefaultTableNode(view: EditorView, commands: {
  paragraph: NodeType;
  table: NodeType;
  tableCell: NodeType;
  tableHeader: NodeType;
  tableHeaderRow: NodeType;
  tableRow: NodeType;
}) {
  const headerRow = commands.tableHeaderRow.create(null, [
    createTableCell(view, commands.tableHeader, commands.paragraph),
    createTableCell(view, commands.tableHeader, commands.paragraph)
  ]);
  const bodyRow = commands.tableRow.create(null, [
    createTableCell(view, commands.tableCell, commands.paragraph),
    createTableCell(view, commands.tableCell, commands.paragraph)
  ]);

  return commands.table.create(null, [headerRow, bodyRow]);
}

function runTableCommand(view: EditorView, range: SlashCommandRange, commands: {
  paragraph: NodeType;
  table: NodeType;
  tableCell: NodeType;
  tableHeader: NodeType;
  tableHeaderRow: NodeType;
  tableRow: NodeType;
}) {
  const { state } = view;
  const $from = state.doc.resolve(range.from);
  if (!$from.parent.isTextblock || $from.depth < 1) return false;

  const blockFrom = $from.before();
  const blockTo = $from.after();
  let transaction = state.tr.replaceWith(blockFrom, blockTo, createDefaultTableNode(view, commands));
  const selectionPosition = Math.min(blockFrom + 3, transaction.doc.content.size);

  transaction = transaction
    .setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition)))
    .scrollIntoView();
  view.dispatch(transaction);
  view.focus();

  return true;
}

function calloutTypeFromQuery(query: string): MarkdownCalloutType {
  const normalizedQuery = normalizedSearchText(query);
  if (!normalizedQuery) return "note";

  if ("warning".startsWith(normalizedQuery) || normalizedQuery.startsWith("warn")) return "warning";
  if ("caution".startsWith(normalizedQuery) || "danger".startsWith(normalizedQuery)) return "caution";
  if ("important".startsWith(normalizedQuery)) return "important";
  if ("tip".startsWith(normalizedQuery)) return "tip";
  if ("note".startsWith(normalizedQuery) || "info".startsWith(normalizedQuery)) return "note";

  return "note";
}

function createDefaultCalloutNode(view: EditorView, type: MarkdownCalloutType, commands: {
  paragraph: NodeType;
  quote: NodeType;
}) {
  const markerParagraph = commands.paragraph.create(null, view.state.schema.text(markdownCalloutMarkerForType(type)));
  const bodyParagraph = commands.paragraph.create();

  return commands.quote.create(null, [markerParagraph, bodyParagraph]);
}

function runCalloutCommand(view: EditorView, range: SlashCommandRange, commands: {
  paragraph: NodeType;
  quote: NodeType;
}) {
  const { state } = view;
  const $from = state.doc.resolve(range.from);
  if (!$from.parent.isTextblock || $from.depth < 1) return false;

  const blockFrom = $from.before();
  const blockTo = $from.after();
  const callout = createDefaultCalloutNode(view, calloutTypeFromQuery(range.query), commands);
  const markerParagraph = callout.firstChild;
  if (!markerParagraph) return false;

  let transaction = state.tr.replaceWith(blockFrom, blockTo, callout);
  const selectionPosition = Math.min(blockFrom + 1 + markerParagraph.nodeSize + 1, transaction.doc.content.size);

  transaction = transaction
    .setSelection(TextSelection.near(transaction.doc.resolve(selectionPosition)))
    .scrollIntoView();
  view.dispatch(transaction);
  view.focus();

  return true;
}

function createSlashCommands(
  labels: SlashCommandLabels,
  commands: {
    bulletList: ReturnType<typeof bulletListSchema.type>;
    codeBlock: ReturnType<typeof codeBlockSchema.type>;
    heading: ReturnType<typeof headingSchema.type>;
    orderedList: ReturnType<typeof orderedListSchema.type>;
    paragraph: ReturnType<typeof paragraphSchema.type>;
    quote: ReturnType<typeof blockquoteSchema.type>;
    table: ReturnType<typeof tableSchema.type>;
    tableCell: ReturnType<typeof tableCellSchema.type>;
    tableHeader: ReturnType<typeof tableHeaderSchema.type>;
    tableHeaderRow: ReturnType<typeof tableHeaderRowSchema.type>;
    tableRow: ReturnType<typeof tableRowSchema.type>;
  },
  options: SlashCommandOptions = {}
): SlashCommandSpec[] {
  const slashCommands: SlashCommandSpec[] = [
    {
      aliases: ["text", "plain"],
      id: "paragraph",
      label: labels.commands.paragraph,
      run: (view, range) => runCommandAfterDeletingSlash(view, range, setBlockType(commands.paragraph))
    },
    {
      aliases: ["h1", "title", "heading"],
      id: "heading1",
      label: labels.commands.heading1,
      run: (view, range) => runCommandAfterDeletingSlash(view, range, setBlockType(commands.heading, { level: 1 }))
    },
    {
      aliases: ["h2", "subtitle", "heading"],
      id: "heading2",
      label: labels.commands.heading2,
      run: (view, range) => runCommandAfterDeletingSlash(view, range, setBlockType(commands.heading, { level: 2 }))
    },
    {
      aliases: ["h3", "subheading", "heading"],
      id: "heading3",
      label: labels.commands.heading3,
      run: (view, range) => runCommandAfterDeletingSlash(view, range, setBlockType(commands.heading, { level: 3 }))
    },
    {
      aliases: ["ul", "list", "unordered"],
      id: "bulletList",
      label: labels.commands.bulletList,
      run: (view, range) => runCommandAfterDeletingSlash(view, range, wrapInList(commands.bulletList))
    },
    {
      aliases: ["ol", "list", "numbered"],
      id: "orderedList",
      label: labels.commands.orderedList,
      run: (view, range) => runCommandAfterDeletingSlash(view, range, wrapInList(commands.orderedList))
    },
    {
      aliases: ["blockquote"],
      id: "quote",
      label: labels.commands.quote,
      run: (view, range) => runCommandAfterDeletingSlash(view, range, wrapIn(commands.quote))
    }
  ];

  if (options.callout ?? true) {
    slashCommands.push({
      aliases: ["alert", "note", "info", "tip", "warning", "caution", "danger", "important"],
      id: "callout",
      label: labels.commands.callout,
      run: (view, range) => runCalloutCommand(view, range, commands)
    });
  }

  slashCommands.push(
    {
      aliases: ["code", "pre", "fence"],
      id: "codeBlock",
      label: labels.commands.codeBlock,
      run: (view, range) => runCommandAfterDeletingSlash(view, range, setBlockType(commands.codeBlock))
    },
    {
      aliases: ["grid"],
      id: "table",
      label: labels.commands.table,
      run: (view, range) => runTableCommand(view, range, commands)
    }
  );

  return slashCommands;
}

function dispatchSlashCommandSelection(view: EditorView, selectedIndex: number) {
  view.dispatch(view.state.tr.setMeta(slashCommandsKey, {
    selectedIndex,
    type: "select"
  } satisfies SlashCommandMeta));
}

function closeSlashCommandMenu(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(slashCommandsKey, {
    type: "close"
  } satisfies SlashCommandMeta));
}

export function openSlashCommandMenu(view: EditorView) {
  if (!virtualSlashRangeFromState(view.state)) return false;

  view.dispatch(view.state.tr.setMeta(slashCommandsKey, {
    type: "open"
  } satisfies SlashCommandMeta));
  view.focus();
  return true;
}

function runSelectedSlashCommand(view: EditorView, commands: SlashCommandSpec[]) {
  const state = slashCommandsKey.getState(view.state);
  if (!state?.active) return false;

  const filteredCommands = filterSlashCommands(commands, state.active.query);
  const selectedCommand = filteredCommands[state.selectedIndex];
  if (!selectedCommand) return false;

  const range = state.active;
  const handled = selectedCommand.run(view, range);
  if (handled && range.source === "virtual") closeSlashCommandMenu(view);

  return handled;
}

function positionMenu(menu: HTMLElement, view: EditorView, range: SlashCommandRange) {
  try {
    const coords = view.coordsAtPos(range.to);
    const ownerWindow = view.dom.ownerDocument.defaultView ?? window;
    const position = popoverPosition(
      coords,
      {
        height: menu.offsetHeight || 220,
        width: menu.offsetWidth || 240
      },
      {
        height: ownerWindow.innerHeight,
        width: ownerWindow.innerWidth
      },
      { gap: 8, margin: 8 }
    );

    menu.style.left = `${position.left}px`;
    menu.style.maxHeight = `${position.maxHeight}px`;
    menu.style.overflowY = "auto";
    menu.style.top = `${position.top}px`;
  } catch {
    menu.style.left = "12px";
    menu.style.maxHeight = "";
    menu.style.overflowY = "";
    menu.style.top = "12px";
  }
}

function elementFromEventTarget(target: EventTarget | null) {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;

  return null;
}

class SlashCommandMenuView {
  private readonly menu: HTMLDivElement;
  private readonly ownerDocument: Document;
  private view: EditorView;

  constructor(
    view: EditorView,
    private readonly commands: SlashCommandSpec[],
    private readonly labels: SlashCommandLabels
  ) {
    this.view = view;
    this.ownerDocument = view.dom.ownerDocument;
    this.menu = this.ownerDocument.createElement("div");
    this.menu.className = "markra-slash-menu";
    this.menu.setAttribute("aria-label", labels.menu);
    this.menu.setAttribute("role", "listbox");
    this.menu.addEventListener("pointerdown", this.handlePointerDown);
    this.menu.addEventListener("mousedown", this.handleMouseDown);
    this.menu.addEventListener("click", this.handleClick);
    this.menu.addEventListener("mouseover", this.handleMouseOver);
    this.ownerDocument.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
  }

  update(view: EditorView) {
    this.view = view;
    const state = slashCommandsKey.getState(view.state);

    if (!state?.active) {
      this.detach();
      return;
    }

    this.attach();
    this.render(state);
    positionMenu(this.menu, view, state.active);
  }

  destroy() {
    this.menu.removeEventListener("pointerdown", this.handlePointerDown);
    this.menu.removeEventListener("mousedown", this.handleMouseDown);
    this.menu.removeEventListener("click", this.handleClick);
    this.menu.removeEventListener("mouseover", this.handleMouseOver);
    this.ownerDocument.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
    this.detach();
  }

  private attach() {
    if (this.menu.isConnected) return;

    this.view.dom.ownerDocument.body.append(this.menu);
  }

  private detach() {
    if (!this.menu.isConnected) return;

    this.menu.remove();
  }

  private render(state: SlashCommandState) {
    const filteredCommands = filterSlashCommands(this.commands, state.active?.query ?? "");

    if (filteredCommands.length === 0) {
      this.menu.textContent = "";
      const empty = this.view.dom.ownerDocument.createElement("div");
      empty.className = "markra-slash-menu-empty";
      empty.textContent = this.labels.noResults;
      this.menu.append(empty);
      return;
    }

    const currentOptions = Array.from(this.menu.querySelectorAll<HTMLButtonElement>(".markra-slash-menu-option"));
    const optionsMatchCommands = currentOptions.length === filteredCommands.length
      && currentOptions.every((option, index) => option.dataset.slashCommandId === filteredCommands[index]?.id);

    if (!optionsMatchCommands) {
      this.menu.textContent = "";
      filteredCommands.forEach((command, index) => {
        this.menu.append(this.createOption(command, index === state.selectedIndex));
      });
      return;
    }

    currentOptions.forEach((option, index) => {
      const command = filteredCommands[index];
      if (!command) return;

      option.dataset.slashCommandId = command.id;
      option.setAttribute("aria-selected", String(index === state.selectedIndex));
      option.textContent = command.label;
    });
  }

  private createOption(command: SlashCommandSpec, selected: boolean) {
    const option = this.view.dom.ownerDocument.createElement("button");
    option.className = "markra-slash-menu-option";
    option.dataset.slashCommandId = command.id;
    option.setAttribute("aria-selected", String(selected));
    option.setAttribute("role", "option");
    option.tabIndex = -1;
    option.type = "button";
    option.textContent = command.label;

    return option;
  }

  private readonly handleMouseDown = (event: MouseEvent) => {
    this.runCommandFromMouseEvent(event);
  };

  private readonly handleClick = (event: MouseEvent) => {
    this.runCommandFromMouseEvent(event);
  };

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;

    this.runCommandFromMouseEvent(event);
  };

  private readonly handleDocumentPointerDown = (event: PointerEvent) => {
    const state = slashCommandsKey.getState(this.view.state);
    if (!state?.active) return;

    const target = elementFromEventTarget(event.target);
    if (target && this.menu.contains(target)) return;

    closeSlashCommandMenu(this.view);
  };

  private runCommandFromMouseEvent(event: MouseEvent) {
    const target = elementFromEventTarget(event.target);
    const option = target?.closest<HTMLElement>("[data-slash-command-id]");
    if (!option || !this.menu.contains(option)) return;

    event.preventDefault();
    event.stopPropagation();
    const commandId = option.dataset.slashCommandId as SlashCommandId | undefined;
    const state = slashCommandsKey.getState(this.view.state);
    if (!state?.active || !commandId) return;

    const command = this.commands.find((candidate) => candidate.id === commandId);
    if (!command) return;

    const range = state.active;
    const handled = command.run(this.view, range);
    if (handled && range.source === "virtual") closeSlashCommandMenu(this.view);
  }

  private readonly handleMouseOver = (event: MouseEvent) => {
    const target = elementFromEventTarget(event.target);
    const option = target?.closest<HTMLElement>("[data-slash-command-id]");
    if (!option || !this.menu.contains(option)) return;

    const options = Array.from(this.menu.querySelectorAll<HTMLElement>("[data-slash-command-id]"));
    const selectedIndex = options.indexOf(option);
    if (selectedIndex < 0) return;

    dispatchSlashCommandSelection(this.view, selectedIndex);
  };
}

export const markraSlashCommands = (
  labels: Partial<SlashCommandLabels> = {},
  options: SlashCommandOptions = {}
) => $prose((ctx) => {
  const resolvedLabels: SlashCommandLabels = {
    menu: labels.menu ?? defaultSlashCommandLabels.menu,
    noResults: labels.noResults ?? defaultSlashCommandLabels.noResults,
    commands: {
      ...defaultSlashCommandLabels.commands,
      ...labels.commands
    }
  };
  const commands = createSlashCommands(resolvedLabels, {
    bulletList: bulletListSchema.type(ctx),
    codeBlock: codeBlockSchema.type(ctx),
    heading: headingSchema.type(ctx),
    orderedList: orderedListSchema.type(ctx),
    paragraph: paragraphSchema.type(ctx),
    quote: blockquoteSchema.type(ctx),
    table: tableSchema.type(ctx),
    tableCell: tableCellSchema.type(ctx),
    tableHeader: tableHeaderSchema.type(ctx),
    tableHeaderRow: tableHeaderRowSchema.type(ctx),
    tableRow: tableRowSchema.type(ctx)
  }, options);

  return new Plugin<SlashCommandState>({
    key: slashCommandsKey,
    state: {
      init: () => emptySlashCommandState,
      apply(transaction, previousState, _oldState, newState) {
        const meta = transaction.getMeta(slashCommandsKey) as SlashCommandMeta | undefined;
        const activeRange = slashRangeFromState(newState)
          ?? continuedVirtualSlashRangeFromState(newState, transaction, previousState);

        if (meta?.type === "close") {
          return {
            active: null,
            selectedIndex: 0,
            suppressed: activeRange?.source === "typed" ? { from: activeRange.from, to: activeRange.to } : null
          };
        }

        if (meta?.type === "open") {
          const openedRange = virtualSlashRangeFromState(newState);

          return {
            active: openedRange,
            selectedIndex: 0,
            suppressed: null
          };
        }

        if (!activeRange) return emptySlashCommandState;
        if (sameRange(activeRange, previousState.suppressed)) {
          return {
            active: null,
            selectedIndex: 0,
            suppressed: previousState.suppressed
          };
        }

        const filteredCommands = filterSlashCommands(commands, activeRange.query);
        const selectedIndex = meta?.type === "select"
          ? meta.selectedIndex
          : previousState.active?.query === activeRange.query
            ? previousState.selectedIndex
            : 0;

        return {
          active: activeRange,
          selectedIndex: clampSelectedIndex(selectedIndex, filteredCommands.length),
          suppressed: null
        };
      }
    },
    props: {
      handleKeyDown(view, event) {
        const state = slashCommandsKey.getState(view.state);
        if (!state?.active) return false;

        const filteredCommands = filterSlashCommands(commands, state.active.query);

        if (event.key === "Escape") {
          event.preventDefault();
          closeSlashCommandMenu(view);
          return true;
        }

        if (event.metaKey || event.ctrlKey || event.altKey) return false;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          dispatchSlashCommandSelection(view, (state.selectedIndex + 1) % Math.max(filteredCommands.length, 1));
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          dispatchSlashCommandSelection(
            view,
            (state.selectedIndex + Math.max(filteredCommands.length, 1) - 1) % Math.max(filteredCommands.length, 1)
          );
          return true;
        }

        if (event.key !== "Enter" && event.key !== "Tab") return false;
        if (filteredCommands.length === 0) return false;

        event.preventDefault();
        return runSelectedSlashCommand(view, commands);
      }
    },
    view: (view) => {
      const menuView = new SlashCommandMenuView(view, commands, resolvedLabels);
      menuView.update(view);

      return menuView;
    }
  });
});
