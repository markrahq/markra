import { headingSchema, paragraphSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

type HeadingLevelState = {
  focused: boolean;
  openFrom: number | null;
};

type HeadingLevelMeta =
  | {
      from: number;
      type: "toggle";
    }
  | {
      type: "close";
    }
  | {
      type: "focus";
    }
  | {
      type: "blur";
    };

type ActiveHeading = {
  from: number;
  level: number;
  text: string;
  to: number;
};

export type HeadingLevelLabels = {
  changeHeadingLevel: string;
  headingLevel: string;
  paragraph: string;
};

const headingLevels = [1, 2, 3, 4, 5, 6] as const;
const headingLevelKey = new PluginKey<HeadingLevelState>("markra-heading-level");
const emptyHeadingLevelState: HeadingLevelState = {
  focused: false,
  openFrom: null
};
const defaultHeadingLevelLabels: HeadingLevelLabels = {
  changeHeadingLevel: "Change heading level",
  headingLevel: "Heading level",
  paragraph: "Paragraph"
};

function normalizeHeadingLevelLabels(labels: Partial<HeadingLevelLabels> = {}): HeadingLevelLabels {
  return {
    changeHeadingLevel: labels.changeHeadingLevel?.trim() || defaultHeadingLevelLabels.changeHeadingLevel,
    headingLevel: labels.headingLevel?.trim() || defaultHeadingLevelLabels.headingLevel,
    paragraph: labels.paragraph?.trim() || defaultHeadingLevelLabels.paragraph
  };
}

function headingLevel(node: ProseNode) {
  const level = Number(node.attrs.level ?? 1);
  if (!Number.isFinite(level)) return 1;

  return Math.max(1, Math.min(6, Math.trunc(level)));
}

function headingLevelLabel(level: number) {
  return `H${level}`;
}

function activeHeadingFromSelection(state: EditorState, heading: NodeType): ActiveHeading | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return null;

  const $head = selection.$head;

  for (let depth = $head.depth; depth > 0; depth -= 1) {
    const node = $head.node(depth);
    if (node.type !== heading) continue;

    return {
      from: $head.before(depth),
      level: headingLevel(node),
      text: node.textContent,
      to: $head.after(depth)
    };
  }

  return null;
}

function closeHeadingLevelMenu(view: EditorView) {
  const { openFrom } = headingLevelKey.getState(view.state) ?? emptyHeadingLevelState;
  if (openFrom === null) return;

  view.dispatch(
    view.state.tr.setMeta(headingLevelKey, {
      type: "close"
    } satisfies HeadingLevelMeta)
  );
}

function setHeadingLevelFocus(view: EditorView, focused: boolean) {
  const nextFocused = focused && view.editable;
  const currentState = headingLevelKey.getState(view.state) ?? emptyHeadingLevelState;
  if (currentState.focused === nextFocused && (nextFocused || currentState.openFrom === null)) return;

  view.dispatch(
    view.state.tr.setMeta(headingLevelKey, {
      type: nextFocused ? "focus" : "blur"
    } satisfies HeadingLevelMeta)
  );
}

function toggleHeadingLevelMenu(view: EditorView, headingFrom: number) {
  view.dispatch(
    view.state.tr.setMeta(headingLevelKey, {
      from: headingFrom,
      type: "toggle"
    } satisfies HeadingLevelMeta)
  );
  view.focus();
}

function changeHeadingLevel(view: EditorView, heading: NodeType, headingFrom: number, level: number) {
  const node = view.state.doc.nodeAt(headingFrom);
  if (!node || node.type !== heading) return false;

  let transaction = view.state.tr.setMeta(headingLevelKey, {
    type: "close"
  } satisfies HeadingLevelMeta);

  if (headingLevel(node) !== level) {
    transaction = transaction
      .setNodeMarkup(headingFrom, undefined, {
        ...node.attrs,
        level
      })
      .scrollIntoView();
  }

  view.dispatch(transaction);
  view.focus();
  return true;
}

function changeHeadingToParagraph(view: EditorView, heading: NodeType, paragraph: NodeType, headingFrom: number) {
  const node = view.state.doc.nodeAt(headingFrom);
  if (!node || node.type !== heading || !paragraph.validContent(node.content)) return false;

  view.dispatch(
    view.state.tr
      .setMeta(headingLevelKey, {
        type: "close"
      } satisfies HeadingLevelMeta)
      .setNodeMarkup(headingFrom, paragraph)
      .scrollIntoView()
  );
  view.focus();
  return true;
}

function createHeadingLevelOption(
  view: EditorView,
  heading: NodeType,
  getHeadingFrom: () => number,
  currentLevel: number,
  optionLevel: number
) {
  const option = view.dom.ownerDocument.createElement("button");
  const label = headingLevelLabel(optionLevel);

  option.type = "button";
  option.className = "markra-heading-level-option";
  option.contentEditable = "false";
  option.draggable = false;
  option.dataset.headingLevel = label;
  option.setAttribute("role", "option");
  option.setAttribute("aria-label", label);
  option.setAttribute("aria-selected", String(optionLevel === currentLevel));
  option.textContent = label;

  option.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  option.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    changeHeadingLevel(view, heading, getHeadingFrom(), optionLevel);
  });

  return option;
}

function createParagraphLevelOption(
  view: EditorView,
  heading: NodeType,
  paragraph: NodeType,
  getHeadingFrom: () => number,
  labels: HeadingLevelLabels
) {
  const option = view.dom.ownerDocument.createElement("button");

  option.type = "button";
  option.className = "markra-heading-level-option";
  option.contentEditable = "false";
  option.draggable = false;
  option.dataset.headingLevel = "paragraph";
  option.setAttribute("role", "option");
  option.setAttribute("aria-label", labels.paragraph);
  option.setAttribute("aria-selected", "false");
  option.title = labels.paragraph;
  option.textContent = labels.paragraph;

  option.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  option.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    changeHeadingToParagraph(view, heading, paragraph, getHeadingFrom());
  });

  return option;
}

function createHeadingLevelControl(
  view: EditorView,
  heading: NodeType,
  paragraph: NodeType,
  getHeadingFrom: () => number,
  level: number,
  menuOpen: boolean,
  labels: HeadingLevelLabels
) {
  const ownerDocument = view.dom.ownerDocument;
  const control = ownerDocument.createElement("span");
  const button = ownerDocument.createElement("button");
  const label = headingLevelLabel(level);

  control.className = "markra-heading-level-control";
  control.contentEditable = "false";

  button.type = "button";
  button.className = "markra-heading-level-button";
  button.contentEditable = "false";
  button.draggable = false;
  button.dataset.headingLevel = label;
  button.setAttribute("aria-label", `${labels.headingLevel} ${label}`);
  button.setAttribute("aria-expanded", String(menuOpen));
  button.setAttribute("aria-haspopup", "listbox");
  button.title = labels.changeHeadingLevel;

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleHeadingLevelMenu(view, getHeadingFrom());
  });

  control.append(button);
  if (!menuOpen) return control;

  const list = ownerDocument.createElement("div");
  list.className = "markra-heading-level-list";
  list.contentEditable = "false";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", labels.headingLevel);

  list.append(createParagraphLevelOption(view, heading, paragraph, getHeadingFrom, labels));

  for (const optionLevel of headingLevels) {
    list.append(createHeadingLevelOption(view, heading, getHeadingFrom, level, optionLevel));
  }

  control.append(list);
  return control;
}

function targetIsInsideHeadingLevelControl(target: EventTarget | null, root: HTMLElement) {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const control = element?.closest(".markra-heading-level-control") ?? null;

  return Boolean(control && root.contains(control));
}

function closeInactiveHeadingLevelMenu(state: EditorState, heading: NodeType) {
  const { openFrom } = headingLevelKey.getState(state) ?? emptyHeadingLevelState;
  if (openFrom === null) return null;

  const activeHeading = activeHeadingFromSelection(state, heading);
  if (activeHeading?.from === openFrom) return null;

  return state.tr.setMeta(headingLevelKey, {
    type: "close"
  } satisfies HeadingLevelMeta);
}

function applyHeadingLevelState(transaction: Transaction, state: HeadingLevelState) {
  const meta = transaction.getMeta(headingLevelKey) as HeadingLevelMeta | undefined;
  if (meta?.type === "close") {
    return {
      ...state,
      openFrom: null
    } satisfies HeadingLevelState;
  }
  if (meta?.type === "focus") {
    return {
      ...state,
      focused: true
    } satisfies HeadingLevelState;
  }
  if (meta?.type === "blur") return emptyHeadingLevelState;
  if (meta?.type === "toggle") {
    return {
      focused: state.focused,
      openFrom: state.openFrom === meta.from ? null : meta.from
    } satisfies HeadingLevelState;
  }

  if (!transaction.docChanged || state.openFrom === null) return state;

  return {
    focused: state.focused,
    openFrom: transaction.mapping.map(state.openFrom, 1)
  } satisfies HeadingLevelState;
}

function createHeadingLevelWidget(
  activeHeading: ActiveHeading,
  heading: NodeType,
  paragraph: NodeType,
  menuOpen: boolean,
  labels: HeadingLevelLabels
) {
  return (view: EditorView, getPos: () => number | undefined) =>
    createHeadingLevelControl(
      view,
      heading,
      paragraph,
      () => {
        const position = getPos();
        return typeof position === "number" ? Math.max(0, position - 1) : activeHeading.from;
      },
      activeHeading.level,
      menuOpen,
      labels
    );
}

function buildHeadingEditingDecorations(
  state: EditorState,
  heading: NodeType,
  paragraph: NodeType,
  labels: HeadingLevelLabels
) {
  const { focused, openFrom } = headingLevelKey.getState(state) ?? emptyHeadingLevelState;
  if (!focused) return null;

  const activeHeading = activeHeadingFromSelection(state, heading);
  if (!activeHeading) return null;

  const menuOpen = openFrom === activeHeading.from;

  return DecorationSet.create(state.doc, [
    Decoration.node(activeHeading.from, activeHeading.to, {
      "aria-label": activeHeading.text,
      class: "markra-heading-editing",
      "data-heading-level": headingLevelLabel(activeHeading.level)
    }),
    Decoration.widget(activeHeading.from + 1, createHeadingLevelWidget(activeHeading, heading, paragraph, menuOpen, labels), {
      ignoreSelection: true,
      key: `markra-heading-level-${activeHeading.from}-${activeHeading.level}-${menuOpen ? "open" : "closed"}`,
      side: -1
    })
  ]);
}

export function createHeadingLevelPlugin(
  heading: NodeType,
  paragraph: NodeType,
  labels: Partial<HeadingLevelLabels> = {}
) {
  const resolvedLabels = normalizeHeadingLevelLabels(labels);

  return new Plugin({
    key: headingLevelKey,
    view: (view) => {
      const ownerDocument = view.dom.ownerDocument;
      const handleEditorFocus = () => {
        setHeadingLevelFocus(view, true);
      };
      const handleEditorBlur = () => {
        setHeadingLevelFocus(view, false);
      };
      const handleDocumentPointerDown = (event: PointerEvent) => {
        const { openFrom } = headingLevelKey.getState(view.state) ?? emptyHeadingLevelState;
        if (openFrom === null || targetIsInsideHeadingLevelControl(event.target, view.dom)) return;

        closeHeadingLevelMenu(view);
      };

      view.dom.addEventListener("focus", handleEditorFocus);
      view.dom.addEventListener("blur", handleEditorBlur);
      ownerDocument.addEventListener("pointerdown", handleDocumentPointerDown, true);

      return {
        update(currentView) {
          if (!currentView.editable) setHeadingLevelFocus(currentView, false);
        },
        destroy() {
          view.dom.removeEventListener("focus", handleEditorFocus);
          view.dom.removeEventListener("blur", handleEditorBlur);
          ownerDocument.removeEventListener("pointerdown", handleDocumentPointerDown, true);
        }
      };
    },
    state: {
      init: () => emptyHeadingLevelState,
      apply: applyHeadingLevelState
    },
    appendTransaction: (_transactions, _oldState, newState) => closeInactiveHeadingLevelMenu(newState, heading),
    props: {
      decorations: (state) => buildHeadingEditingDecorations(state, heading, paragraph, resolvedLabels),
      handleKeyDown: (view, event) => {
        const { openFrom } = headingLevelKey.getState(view.state) ?? emptyHeadingLevelState;
        if (openFrom === null || event.key !== "Escape") return false;

        event.preventDefault();
        closeHeadingLevelMenu(view);
        return true;
      }
    }
  });
}

export function markraHeadingLevelPlugin(labels?: Partial<HeadingLevelLabels>) {
  return $prose((ctx) => {
    const heading = headingSchema.type(ctx);
    const paragraph = paragraphSchema.type(ctx);

    return createHeadingLevelPlugin(heading, paragraph, labels);
  });
}
