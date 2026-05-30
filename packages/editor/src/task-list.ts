import { bulletListSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView, ViewMutationRecord } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

function isSingleParagraphTaskList(node: ProseNode) {
  let hasTaskItem = false;
  let allItemsAreSingleParagraphTasks = true;

  node.forEach((child) => {
    if (
      child.type.name !== "list_item" ||
      child.attrs.checked === null ||
      child.childCount !== 1 ||
      child.firstChild?.type.name !== "paragraph"
    ) {
      allItemsAreSingleParagraphTasks = false;
      return;
    }

    hasTaskItem = true;
  });

  return hasTaskItem && allItemsAreSingleParagraphTasks;
}

export const markraTaskListSchema = bulletListSchema.extendSchema((previous) => (ctx) => {
  const baseSchema = previous(ctx);

  return {
    ...baseSchema,
    toMarkdown: {
      ...baseSchema.toMarkdown,
      runner: (state, node) => {
        if (!isSingleParagraphTaskList(node)) {
          baseSchema.toMarkdown.runner(state, node);
          return;
        }

        state
          .openNode("list", undefined, {
            ordered: false,
            spread: false
          })
          .next(node.content)
          .closeNode();
      }
    }
  };
});

class TaskListItemView implements NodeView {
  contentDOM: HTMLElement;
  dom: HTMLElement;

  private checkbox: HTMLInputElement | null = null;
  private node: ProseNode;
  private readonly onCheckboxClick: (event: MouseEvent) => unknown;

  constructor(
    node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined
  ) {
    this.node = node;
    this.dom = document.createElement("li");
    this.contentDOM = this.dom;
    this.onCheckboxClick = (event) => this.handleCheckboxClick(event);
    this.render();
  }

  update(node: ProseNode) {
    if (node.type !== this.node.type) return false;

    const wasTask = this.node.attrs.checked !== null;
    const isTask = node.attrs.checked !== null;
    this.node = node;

    if (wasTask !== isTask) {
      return false;
    }

    this.syncDomAttributes();
    this.syncCheckbox();
    return true;
  }

  destroy() {
    this.checkbox?.removeEventListener("click", this.onCheckboxClick);
  }

  ignoreMutation(record: ViewMutationRecord) {
    return Boolean(this.checkbox && record.target === this.checkbox);
  }

  stopEvent(event: Event) {
    return Boolean(this.checkbox && event.target === this.checkbox);
  }

  private render() {
    this.checkbox?.removeEventListener("click", this.onCheckboxClick);
    this.checkbox = null;
    this.dom.replaceChildren();
    this.syncDomAttributes();

    if (this.node.attrs.checked === null) {
      this.contentDOM = this.dom;
      return;
    }

    const checkbox = document.createElement("input");
    checkbox.className = "markra-task-list-checkbox";
    checkbox.type = "checkbox";
    checkbox.contentEditable = "false";
    checkbox.addEventListener("click", this.onCheckboxClick);

    const content = document.createElement("div");
    content.className = "markra-task-list-content";

    this.checkbox = checkbox;
    this.contentDOM = content;
    this.dom.append(checkbox, content);
    this.syncCheckbox();
  }

  private syncDomAttributes() {
    if (this.node.attrs.checked === null) {
      delete this.dom.dataset.itemType;
      delete this.dom.dataset.checked;
    } else {
      this.dom.dataset.itemType = "task";
      this.dom.dataset.checked = String(this.node.attrs.checked);
    }

    this.setOptionalDataAttribute("label", this.node.attrs.label);
    this.setOptionalDataAttribute("listType", this.node.attrs.listType);
    this.setOptionalDataAttribute("spread", this.node.attrs.spread);
  }

  private syncCheckbox() {
    if (!this.checkbox) return;

    this.checkbox.checked = Boolean(this.node.attrs.checked);
    this.checkbox.disabled = !this.view.editable;
    this.checkbox.setAttribute("aria-label", this.checkbox.checked ? "Mark task incomplete" : "Mark task complete");
  }

  private setOptionalDataAttribute(name: string, value: unknown) {
    if (typeof value === "string") {
      this.dom.dataset[name] = value;
      return;
    }

    delete this.dom.dataset[name];
  }

  private handleCheckboxClick(event: MouseEvent) {
    if (!this.view.editable) return;

    const position = this.getPos();
    if (typeof position !== "number") return;

    const checked = event.currentTarget instanceof HTMLInputElement
      ? event.currentTarget.checked
      : !Boolean(this.node.attrs.checked);
    const transaction = this.view.state.tr.setNodeMarkup(position, undefined, {
      ...this.node.attrs,
      checked
    });

    this.view.dispatch(transaction);
  }
}

export const markraTaskListPlugin = $prose(() => {
  return new Plugin({
    props: {
      nodeViews: {
        list_item: (node, view, getPos) => new TaskListItemView(node, view, getPos)
      }
    }
  });
});
