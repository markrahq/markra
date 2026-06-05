import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { popoverPosition } from "@markra/shared";
import {
  documentLinkCompletionFiles,
  markdownDocumentLinkHrefForFile,
  markdownDocumentLinkForFile,
  markdownDocumentLinkTitle,
  type MarkdownDocumentLinkFile
} from "../lib/document-links";

type DocumentLinkCompletionOptions = {
  getDocumentPath: () => string | null | undefined;
  getWorkspaceFiles: () => MarkdownDocumentLinkFile[];
};

type ActiveCompletion = {
  from: number;
  query: string;
  to: number;
};

type CompletionState = {
  active: ActiveCompletion | null;
  selectedIndex: number;
};

type CompletionMeta =
  | {
      type: "close";
    }
  | {
      selectedIndex: number;
      type: "move";
    };

const completionKey = new PluginKey<CompletionState>("markra-document-link-completion");
const completionOptionAttribute = "data-markra-document-link-index";

function activeDocumentLinkCompletion(state: EditorState): ActiveCompletion | null {
  const { selection } = state;
  if (!selection.empty) return null;

  const $cursor = selection.$from;
  if (!$cursor.parent.isTextblock) return null;

  const textBeforeCursor = $cursor.parent.textBetween(0, $cursor.parentOffset, "\n", "\n");
  const match = /\[\[([^\]\n]*)$/u.exec(textBeforeCursor);
  if (!match) return null;

  const typed = match[0] ?? "";
  return {
    from: selection.from - typed.length,
    query: match[1] ?? "",
    to: selection.from
  };
}

function sameCompletion(left: ActiveCompletion | null, right: ActiveCompletion | null) {
  return Boolean(left && right && left.from === right.from && left.to === right.to && left.query === right.query);
}

function completionOptions(options: DocumentLinkCompletionOptions, active: ActiveCompletion | null) {
  if (!active) return [];

  return documentLinkCompletionFiles(
    options.getWorkspaceFiles(),
    active.query,
    options.getDocumentPath()
  );
}

function insertDocumentLink(view: EditorView, active: ActiveCompletion, file: MarkdownDocumentLinkFile, options: DocumentLinkCompletionOptions) {
  const href = markdownDocumentLinkHrefForFile(file, options.getDocumentPath());
  const title = markdownDocumentLinkTitle(file);
  const linkMark = view.state.schema.marks.link;
  const replacement = linkMark
    ? view.state.schema.text(title, [linkMark.create({ href })])
    : view.state.schema.text(markdownDocumentLinkForFile(file, options.getDocumentPath()));
  const transaction = view.state.tr
    .replaceWith(active.from, active.to, replacement)
    .setMeta(completionKey, { type: "close" } satisfies CompletionMeta)
    .scrollIntoView();

  view.dispatch(transaction);
  view.focus();
}

function moveSelectedOption(view: EditorView, options: DocumentLinkCompletionOptions, delta: number) {
  const state = completionKey.getState(view.state);
  const active = state?.active ?? null;
  const files = completionOptions(options, active);
  if (!state || !active || files.length === 0) return false;

  const nextIndex = (state.selectedIndex + delta + files.length) % files.length;
  view.dispatch(view.state.tr.setMeta(completionKey, { selectedIndex: nextIndex, type: "move" } satisfies CompletionMeta));
  return true;
}

function optionId(index: number) {
  return `markra-document-link-option-${index}`;
}

function renderMenuOption(ownerDocument: Document, file: MarkdownDocumentLinkFile, index: number, selected: boolean) {
  const option = ownerDocument.createElement("div");
  const titleText = file.name.replace(/\.(md|markdown)$/iu, "");
  option.className = "markra-document-link-option";
  option.id = optionId(index);
  option.setAttribute("role", "option");
  option.setAttribute("aria-label", `${titleText} ${file.relativePath}`);
  option.setAttribute("aria-selected", selected ? "true" : "false");
  option.setAttribute(completionOptionAttribute, String(index));

  const title = ownerDocument.createElement("span");
  title.className = "markra-document-link-title";
  title.textContent = titleText;

  const path = ownerDocument.createElement("span");
  path.className = "markra-document-link-path";
  path.textContent = file.relativePath;

  option.append(title, path);
  return option;
}

function positionMenu(view: EditorView, active: ActiveCompletion, menu: HTMLElement) {
  try {
    const coords = view.coordsAtPos(active.to);
    const ownerWindow = view.dom.ownerDocument.defaultView ?? window;
    const position = popoverPosition(
      coords,
      {
        height: menu.offsetHeight || 280,
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
    menu.style.left = "8px";
    menu.style.maxHeight = "";
    menu.style.overflowY = "";
    menu.style.top = "8px";
  }
}

export function markraDocumentLinkCompletionPlugin(options: DocumentLinkCompletionOptions) {
  return $prose(() => {
    return new Plugin<CompletionState>({
      key: completionKey,
      state: {
        init(_, state) {
          return {
            active: activeDocumentLinkCompletion(state),
            selectedIndex: 0
          };
        },
        apply(transaction, previous, _oldState, newState) {
          const meta = transaction.getMeta(completionKey) as CompletionMeta | undefined;
          if (meta?.type === "close") {
            return {
              active: null,
              selectedIndex: 0
            };
          }

          const active = activeDocumentLinkCompletion(newState);
          const selectedIndex = meta?.type === "move"
            ? meta.selectedIndex
            : sameCompletion(previous.active, active)
              ? previous.selectedIndex
              : 0;

          return {
            active,
            selectedIndex
          };
        }
      },
      props: {
        handleKeyDown(view, event) {
          const state = completionKey.getState(view.state);
          const active = state?.active ?? null;
          if (!active || event.isComposing) return false;

          if (event.key === "Escape") {
            event.preventDefault();
            view.dispatch(view.state.tr.setMeta(completionKey, { type: "close" } satisfies CompletionMeta));
            return true;
          }

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            return moveSelectedOption(view, options, event.key === "ArrowDown" ? 1 : -1);
          }

          if (event.key !== "Enter" && event.key !== "Tab") return false;

          const files = completionOptions(options, active);
          const file = files[Math.min(state?.selectedIndex ?? 0, files.length - 1)];
          if (!file) return false;

          event.preventDefault();
          insertDocumentLink(view, active, file, options);
          return true;
        }
      },
      view(view) {
        const ownerDocument = view.dom.ownerDocument;
        const menu = ownerDocument.createElement("div");
        let currentFiles: MarkdownDocumentLinkFile[] = [];

        menu.className = "markra-document-link-menu";
        menu.hidden = true;
        menu.setAttribute("role", "listbox");
        menu.setAttribute("aria-label", "Document links");

        const update = (nextView: EditorView) => {
          const state = completionKey.getState(nextView.state);
          const active = state?.active ?? null;
          const files = completionOptions(options, active);

          currentFiles = files;
          menu.replaceChildren();

          if (!active || files.length === 0) {
            menu.hidden = true;
            menu.removeAttribute("aria-activedescendant");
            return;
          }

          const selectedIndex = Math.min(state?.selectedIndex ?? 0, files.length - 1);
          files.forEach((file, index) => {
            menu.append(renderMenuOption(ownerDocument, file, index, index === selectedIndex));
          });
          menu.hidden = false;
          menu.setAttribute("aria-activedescendant", optionId(selectedIndex));
          positionMenu(nextView, active, menu);
        };

        const handleMouseDown = (event: MouseEvent) => {
          const target = event.target instanceof Element ? event.target : null;
          const option = target?.closest(`[${completionOptionAttribute}]`);
          const optionIndex = Number(option?.getAttribute(completionOptionAttribute));
          const file = Number.isFinite(optionIndex) ? currentFiles[optionIndex] : undefined;
          const active = completionKey.getState(view.state)?.active ?? null;
          if (!file || !active) return;

          event.preventDefault();
          insertDocumentLink(view, active, file, options);
        };

        const handleDocumentPointerDown = (event: PointerEvent) => {
          const active = completionKey.getState(view.state)?.active ?? null;
          if (!active) return;

          const target = event.target instanceof Node ? event.target : null;
          if (target && menu.contains(target)) return;

          view.dispatch(view.state.tr.setMeta(completionKey, { type: "close" } satisfies CompletionMeta));
        };

        menu.addEventListener("mousedown", handleMouseDown);
        ownerDocument.addEventListener("pointerdown", handleDocumentPointerDown, true);
        ownerDocument.body.append(menu);
        update(view);

        return {
          destroy() {
            menu.removeEventListener("mousedown", handleMouseDown);
            ownerDocument.removeEventListener("pointerdown", handleDocumentPointerDown, true);
            menu.remove();
          },
          update
        };
      }
    });
  });
}
