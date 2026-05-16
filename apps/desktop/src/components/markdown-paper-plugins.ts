import {
  commands as commonmarkCommands,
  inputRules as commonmarkInputRules,
  keymap as commonmarkKeymap,
  plugins as commonmarkPlugins,
  schema as commonmarkSchema
} from "@milkdown/kit/preset/commonmark";
import {
  commands as gfmCommands,
  inputRules as gfmInputRules,
  keymap as gfmKeymap,
  pasteRules as gfmPasteRules,
  plugins as gfmPlugins,
  schema as gfmSchema
} from "@milkdown/kit/preset/gfm";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import type { AiSelectionContext } from "@markra/ai";
import { readAiSelectionContextFromView } from "../hooks/useEditorController";

export const markraCommonmark = [
  commonmarkSchema,
  commonmarkInputRules,
  commonmarkCommands,
  commonmarkKeymap,
  commonmarkPlugins
].flat();

export const markraGfm = [
  gfmSchema,
  gfmInputRules,
  gfmPasteRules,
  gfmKeymap,
  gfmCommands,
  gfmPlugins
].flat();

export function markraTextSelectionObserverPlugin(
  onTextSelectionChange: (selection: AiSelectionContext | null) => unknown
) {
  return $prose(() => {
    let lastSignature = "";

    const notifySelectionChange = (view: EditorView, options: { requireFocusForEmptySelection: boolean }) => {
      const { selection } = view.state;

      if (selection.empty) {
        if (options.requireFocusForEmptySelection && !view.hasFocus()) return;

        const blockContext = readAiSelectionContextFromView(view);
        if (blockContext.text.trim()) {
          const signature = `${blockContext.source ?? "block"}:${blockContext.from}:${blockContext.to}:${blockContext.text}`;
          if (signature === lastSignature) return;

          lastSignature = signature;
          onTextSelectionChange(blockContext);
          return;
        }

        if (lastSignature) {
          lastSignature = "";
          onTextSelectionChange(null);
        }
        return;
      }

      const text = view.state.doc.textBetween(selection.from, selection.to, "\n").trim();
      if (!text) {
        if (view.hasFocus() && lastSignature) {
          lastSignature = "";
          onTextSelectionChange(null);
        }

        return;
      }

      const signature = `${selection.from}:${selection.to}:${text}`;
      if (signature === lastSignature) return;

      lastSignature = signature;
      onTextSelectionChange({
        from: selection.from,
        source: "selection",
        text,
        to: selection.to
      });
    };

    const clearStaleSelectionAfterEditorClick = (view: EditorView) => {
      if (!lastSignature) return;

      const domSelection = view.dom.ownerDocument.getSelection();
      const hasDomSelectedText = Boolean(domSelection && !domSelection.isCollapsed && domSelection.toString().trim());
      if (hasDomSelectedText) return;

      if (!view.state.selection.empty) {
        lastSignature = "";
        onTextSelectionChange(null);
        return;
      }

      notifySelectionChange(view, { requireFocusForEmptySelection: false });
    };

    return new Plugin({
      view(view) {
        const ownerDocument = view.dom.ownerDocument;
        const handleMouseUp = (event: MouseEvent) => {
          if (event.button !== 0) return;

          const targetElement =
            event.target instanceof Element
              ? event.target
              : event.target instanceof Node
                ? event.target.parentElement
                : null;
          const writingSurface = view.dom.closest(".paper-scroll");
          if (!targetElement || !writingSurface?.contains(targetElement)) return;

          ownerDocument.defaultView?.setTimeout(() => {
            clearStaleSelectionAfterEditorClick(view);
          }, 0);
        };

        ownerDocument.addEventListener("mouseup", handleMouseUp, true);

        return {
          destroy() {
            ownerDocument.removeEventListener("mouseup", handleMouseUp, true);
          },
          update(view, previousState) {
            const { selection } = view.state;
            if (selection.eq(previousState.selection)) return;
            notifySelectionChange(view, { requireFocusForEmptySelection: true });
          }
        };
      }
    });
  });
}

function linkTargetFromClickTarget(target: EventTarget | null) {
  const targetElement =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!targetElement) return null;

  return targetElement.closest<HTMLAnchorElement | HTMLElement>("a[href], .markra-live-link-label[data-markra-href]");
}

function linkHrefFromClickTarget(target: EventTarget | null) {
  const linkTarget = linkTargetFromClickTarget(target);
  if (!linkTarget) return null;

  if (linkTarget instanceof HTMLAnchorElement) {
    return linkTarget.getAttribute("href") ?? linkTarget.href;
  }

  return linkTarget.dataset.markraHref ?? null;
}

function linkOpenModifierIsPressed(event: MouseEvent) {
  return event.metaKey || event.ctrlKey;
}

export function markraExternalLinkClickPlugin(openExternalUrl: (url: string) => unknown) {
  return $prose(() => {
    return new Plugin({
      props: {
        handleDOMEvents: {
          mousedown(_view, event) {
            const href = linkHrefFromClickTarget(event.target);
            if (!href) return false;

            if (!linkOpenModifierIsPressed(event)) {
              return false;
            }

            event.preventDefault();
            return true;
          },
          click(_view, event) {
            const href = linkHrefFromClickTarget(event.target);
            if (!href) return false;

            if (!linkOpenModifierIsPressed(event)) {
              return false;
            }

            event.preventDefault();

            try {
              Promise.resolve(openExternalUrl(href)).catch(() => {});
            } catch {
              // Opening external links is best-effort; editing should not be interrupted by opener failures.
            }

            return true;
          }
        }
      }
    });
  });
}
