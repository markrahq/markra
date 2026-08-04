import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { BlockLabels } from "./blocks.ts";
import { syntaxTreeChanged } from "./changes.ts";
import { runMarkraCommand } from "./plugin.ts";

interface ActiveHeading {
  from: number;
  level: number;
}

const headingPattern = /^(?:[\t ]{0,3})(#{1,6})[\t ]+/u;
const setOpenHeading = StateEffect.define<number | null>();

function activeHeading(state: EditorState): ActiveHeading | null {
  if (state.readOnly || state.selection.ranges.length !== 1) return null;
  const selection = state.selection.main;
  const line = state.doc.lineAt(selection.head);
  if (selection.from < line.from || selection.to > line.to) return null;
  const match = headingPattern.exec(line.text);
  if (!match) return null;
  const level = match[1]?.length ?? 1;
  const markerOffset = match[0].indexOf("#");
  let node = syntaxTree(state).resolveInner(line.from + markerOffset, 1);
  // A line-start hash is ambiguous inside fenced code. Require the Markdown
  // parser to classify the marker as the matching ATX heading before showing
  // controls that can rewrite the line.
  while (true) {
    if (node.name === `ATXHeading${level}`) {
      return { from: line.from, level };
    }
    const parent = node.parent;
    if (!parent) return null;
    node = parent;
  }
}

const openHeadingField = StateField.define<number | null>({
  create: () => null,
  update(value, transaction) {
    let next = value;
    if (transaction.docChanged && next !== null) {
      next = transaction.changes.mapPos(next, 1);
    }
    for (const effect of transaction.effects) {
      if (effect.is(setOpenHeading)) next = effect.value;
    }
    const heading = activeHeading(transaction.state);
    return heading?.from === next ? next : null;
  },
});

function controlButton(
  document: Document,
  className: string,
  label: string,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.contentEditable = "false";
  button.draggable = false;
  button.setAttribute("aria-label", label);
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  return button;
}

class HeadingLevelWidget extends WidgetType {
  constructor(
    readonly heading: ActiveHeading,
    readonly open: boolean,
    readonly labels: BlockLabels,
    readonly headingLevelLabel: string,
  ) {
    super();
  }

  eq(other: HeadingLevelWidget) {
    return other.heading.from === this.heading.from &&
      other.heading.level === this.heading.level &&
      other.open === this.open &&
      other.headingLevelLabel === this.headingLevelLabel;
  }

  ignoreEvent() {
    return false;
  }

  toDOM(view: EditorView) {
    const document = view.dom.ownerDocument;
    const control = document.createElement("span");
    const levelLabel = `H${this.heading.level}`;
    control.className = "markra-heading-level-control";
    control.contentEditable = "false";

    const toggle = controlButton(
      document,
      "markra-heading-level-button",
      `${this.headingLevelLabel} ${levelLabel}`,
    );
    toggle.dataset.headingLevel = levelLabel;
    toggle.title = this.headingLevelLabel;
    toggle.setAttribute("aria-expanded", String(this.open));
    toggle.setAttribute("aria-haspopup", "listbox");
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        effects: setOpenHeading.of(this.open ? null : this.heading.from),
      });
      view.focus();
    });
    control.append(toggle);
    if (!this.open) return control;

    const list = document.createElement("span");
    list.className = "markra-heading-level-list";
    list.contentEditable = "false";
    list.setAttribute("aria-label", this.headingLevelLabel);
    list.setAttribute("role", "listbox");

    const options: Array<{ command: string; label: string; level: string }> = [
      {
        command: "block.paragraph",
        label: this.labels["block.paragraph"],
        level: "paragraph",
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        command: `block.heading.${index + 1}`,
        label: `H${index + 1}`,
        level: `H${index + 1}`,
      })),
    ];
    for (const option of options) {
      const button = controlButton(
        document,
        "markra-heading-level-option",
        option.label,
      );
      button.dataset.headingLevel = option.level;
      button.setAttribute("aria-selected", String(
        option.level === levelLabel,
      ));
      button.setAttribute("role", "option");
      button.textContent = option.label;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        view.dispatch({ effects: setOpenHeading.of(null) });
        runMarkraCommand(view, option.command, { source: "ui" });
        view.focus();
      });
      list.append(button);
    }
    control.append(list);
    return control;
  }
}

function headingDecorations(
  view: EditorView,
  labels: BlockLabels,
  headingLevelLabel: string,
): DecorationSet {
  if (!view.hasFocus) return Decoration.none;
  const heading = activeHeading(view.state);
  if (!heading) return Decoration.none;
  const open = view.state.field(openHeadingField) === heading.from;
  return Decoration.set([
    Decoration.line({ class: "markra-heading-editing" }).range(heading.from),
    Decoration.widget({
      side: -1,
      widget: new HeadingLevelWidget(
        heading,
        open,
        labels,
        headingLevelLabel,
      ),
    }).range(heading.from),
  ]);
}

class HeadingLevelViewPlugin {
  decorations: DecorationSet;
  private readonly handlePointerDown: (event: PointerEvent) => unknown;

  constructor(
    readonly view: EditorView,
    readonly labels: BlockLabels,
    readonly headingLevelLabel: string,
  ) {
    this.decorations = headingDecorations(view, labels, headingLevelLabel);
    this.handlePointerDown = (event) => {
      if (view.state.field(openHeadingField) === null) return;
      const target = event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? event.target.parentElement
          : null;
      const control = target?.closest(".markra-heading-level-control");
      if (control && view.dom.contains(control)) return;
      view.dispatch({ effects: setOpenHeading.of(null) });
    };
    view.dom.ownerDocument.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.selectionSet ||
      update.focusChanged ||
      update.transactions.some((transaction) => transaction.effects.length > 0) ||
      syntaxTreeChanged(update.startState, update.state)
    ) {
      this.decorations = headingDecorations(
        update.view,
        this.labels,
        this.headingLevelLabel,
      );
    }
  }

  destroy() {
    this.view.dom.ownerDocument.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
  }
}

export function headingLevelControlExtension(
  labels: BlockLabels,
  headingLevelLabel: string,
) {
  return [
    openHeadingField,
    ViewPlugin.define(
      (view) => new HeadingLevelViewPlugin(view, labels, headingLevelLabel),
      { decorations: (plugin) => plugin.decorations },
    ),
    EditorView.domEventHandlers({
      keydown(event, view) {
        if (event.key !== "Escape" || view.state.field(openHeadingField) === null) {
          return false;
        }
        view.dispatch({ effects: setOpenHeading.of(null) });
        event.preventDefault();
        return true;
      },
    }),
  ];
}
