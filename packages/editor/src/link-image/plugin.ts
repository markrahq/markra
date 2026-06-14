import { imageSchema, linkSchema } from "@milkdown/kit/preset/commonmark";
import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import { normalizedExternalAutolinkUrl } from "@markra/shared";
import { buildLiveLinkImageDecorations } from "./decorations.ts";
import { replaceRawMarkdownTarget } from "./finalize.ts";
import { createFinalizedImageNodeView } from "./images.ts";
import { expandFinalizedLinkMarkdown, linkElementFromEventTarget } from "./links.ts";
import { findActiveRawMarkdownRange } from "./ranges.ts";
import type { AbsoluteRawMarkdownRange, ResolveMarkdownImageSrc } from "./types.ts";

type SuppressedLiveMarkdownRange = {
  from: number;
  to: number;
};

type LinkImageLiveState = {
  suppressedRange: SuppressedLiveMarkdownRange | null;
};

type LinkImageLiveMeta = {
  range: SuppressedLiveMarkdownRange;
  type: "suppress";
};

const linkImageLiveKey = new PluginKey<LinkImageLiveState>("markra-link-image-live-markdown");
const linkOpenModifierClass = "markra-link-open-modifier-active";

function sameRange(left: SuppressedLiveMarkdownRange | null, right: AbsoluteRawMarkdownRange | null) {
  return Boolean(left && right && left.from === right.from && left.to === right.to);
}

function targetIsInsideActiveLiveMarkdownSource(target: EventTarget | null, root: HTMLElement) {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const source = element?.closest(
    ".markra-live-link-source.markra-md-delimiter, .markra-live-link-source-label, .markra-live-image-source.markra-md-delimiter"
  ) ?? null;

  return Boolean(source && root.contains(source));
}

function activeLiveMarkdownRange(state: EditorState) {
  const range = findActiveRawMarkdownRange(state);
  const liveState = linkImageLiveKey.getState(state);

  return sameRange(liveState?.suppressedRange ?? null, range) ? null : range;
}

function pastedExternalUrl(event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text/plain") ?? "";
  return normalizedExternalAutolinkUrl(text);
}

export function markraLinkImageLivePlugin(resolveImageSrc?: ResolveMarkdownImageSrc) {
  return $prose((ctx) => {
    const link = linkSchema.type(ctx);
    const image = imageSchema.type(ctx);
    (image.spec as { draggable?: boolean }).draggable = false;

    return new Plugin({
      key: linkImageLiveKey,
      view: (view) => {
        const ownerDocument = view.dom.ownerDocument;
        const ownerWindow = ownerDocument.defaultView;
        const syncModifierState = (event: KeyboardEvent) => {
          view.dom.classList.toggle(linkOpenModifierClass, event.metaKey || event.ctrlKey);
        };
        const clearModifierState = () => {
          view.dom.classList.remove(linkOpenModifierClass);
        };
        const suppressActiveLiveMarkdownSource = (event: PointerEvent) => {
          const range = findActiveRawMarkdownRange(view.state);
          if (!range || targetIsInsideActiveLiveMarkdownSource(event.target, view.dom)) return;

          view.dispatch(
            view.state.tr.setMeta(linkImageLiveKey, {
              range: {
                from: range.from,
                to: range.to
              },
              type: "suppress"
            } satisfies LinkImageLiveMeta)
          );
        };

        ownerDocument.addEventListener("keydown", syncModifierState, true);
        ownerDocument.addEventListener("keyup", syncModifierState, true);
        ownerDocument.addEventListener("pointerdown", suppressActiveLiveMarkdownSource, true);
        ownerWindow?.addEventListener("blur", clearModifierState);

        return {
          destroy() {
            clearModifierState();
            ownerDocument.removeEventListener("keydown", syncModifierState, true);
            ownerDocument.removeEventListener("keyup", syncModifierState, true);
            ownerDocument.removeEventListener("pointerdown", suppressActiveLiveMarkdownSource, true);
            ownerWindow?.removeEventListener("blur", clearModifierState);
          }
        };
      },
      state: {
        init: (): LinkImageLiveState => ({
          suppressedRange: null
        }),
        apply(transaction, liveState): LinkImageLiveState {
          const meta = transaction.getMeta(linkImageLiveKey) as LinkImageLiveMeta | undefined;
          if (meta?.type === "suppress") {
            return {
              suppressedRange: meta.range
            };
          }

          if (transaction.docChanged || transaction.selectionSet) {
            return {
              suppressedRange: null
            };
          }

          return liveState;
        }
      },
      props: {
        decorations: (state) =>
          buildLiveLinkImageDecorations(state.doc, activeLiveMarkdownRange(state), link, resolveImageSrc),
        handleDOMEvents: {
          click: (view, event) => {
            if (event.metaKey || event.ctrlKey) return false;

            const linkElement = linkElementFromEventTarget(event.target);
            if (!linkElement) return false;

            event.preventDefault();
            return expandFinalizedLinkMarkdown(view, link, view.posAtDOM(linkElement, 0));
          },
          dragstart: (_view, event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target?.closest("a[href], .markra-live-link-label, .markra-image-node, .markra-live-image-preview")) {
              return false;
            }

            event.preventDefault();
            return true;
          }
        },
        handlePaste: (view, event) => {
          const { $from, $to } = view.state.selection;
          if ($from.parent.type.spec.code || !$from.parent.inlineContent || !$from.sameParent($to)) return false;

          const href = pastedExternalUrl(event);
          if (!href) return false;

          const { from, to } = view.state.selection;
          const selectedText = view.state.selection.empty ? "" : view.state.doc.textBetween(from, to, " ");
          const pastedText = event.clipboardData?.getData("text/plain") ?? "";
          const label = selectedText.trim() || pastedText.trim() || href;
          const linkedText = view.state.schema.text(label, [link.create({ href })]);
          const tr = view.state.tr.replaceWith(from, to, linkedText).scrollIntoView();

          view.dispatch(tr);
          return true;
        },
        handleKeyDown: (view, event) => {
          const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;
          if (event.key !== "Enter" || hasModifier) return false;

          const tr = replaceRawMarkdownTarget(view.state, link, image);
          if (!tr) return false;

          event.preventDefault();
          view.dispatch(tr.scrollIntoView());
          return true;
        },
        nodeViews: {
          image: (node, view, getPos) => createFinalizedImageNodeView(node, view, getPos, resolveImageSrc)
        }
      }
    });
  });
}
