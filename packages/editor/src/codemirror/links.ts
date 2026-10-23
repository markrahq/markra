import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type EditorState } from "@codemirror/state";
import { EditorView, type EditorView as CodeMirrorView } from "@codemirror/view";
import { defineMarkraPlugin } from "./plugin.ts";
import type { MarkraSyntaxNode } from "./renderers.ts";
import { unescapeMarkdown } from "./syntax.ts";

export type MarkraLinkActivation = "click" | "modifier" | "none";

export interface MarkraLinkSourceContext {
  readonly source: string;
  readonly state: EditorState;
  readonly view: CodeMirrorView;
}

export interface MarkraLinkOpenContext extends MarkraLinkSourceContext {
  readonly target: string;
}

export interface LinksPluginOptions {
  readonly activation?: MarkraLinkActivation;
  readonly label?: string;
  readonly open: (context: MarkraLinkOpenContext) => unknown;
  readonly resolveTarget?: (
    context: MarkraLinkSourceContext,
  ) => string | null;
}

interface ResolvedLink {
  source: string;
  target: string;
}

const unsafeCodePoint = /[\u0000-\u001f\u007f]/u;
const scheme = /^([a-z][a-z\d+.-]*):/iu;
const safeSchemes = new Set(["http", "https", "mailto", "tel"]);

export function resolveSafeLinkTarget(source: string) {
  const candidate = unescapeMarkdown(source.trim());
  if (!candidate || unsafeCodePoint.test(candidate)) return null;

  const matchedScheme = scheme.exec(candidate)?.[1]?.toLocaleLowerCase();
  if (!matchedScheme) return candidate;
  return safeSchemes.has(matchedScheme) ? candidate : null;
}

export function resolveAutolinkTarget(source: string) {
  const candidate = unescapeMarkdown(source.trim());
  if (scheme.test(candidate)) return resolveSafeLinkTarget(candidate);
  if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(candidate)) {
    return resolveSafeLinkTarget(`mailto:${candidate}`);
  }
  if (/^www\./iu.test(candidate)) {
    return resolveSafeLinkTarget(`http://${candidate}`);
  }
  return resolveSafeLinkTarget(candidate);
}

function normalizeMarkdownLinkLabel(source: string) {
  return unescapeMarkdown(source.replace(/^\[|\]$/gu, ""))
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase();
}

export function readMarkdownLinkReferences(state: EditorState) {
  const references = new Map<string, string>();

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "LinkReference") return;
      const label = node.node.getChild("LinkLabel");
      const url = node.node.getChild("URL");
      if (!label || !url) return;
      const source = unescapeMarkdown(state.sliceDoc(url.from, url.to).trim());
      if (!source) return;
      references.set(
        normalizeMarkdownLinkLabel(state.sliceDoc(label.from, label.to)),
        source,
      );
    },
  });

  return references;
}

export function readMarkdownLinkDestination(
  state: EditorState,
  node: MarkraSyntaxNode,
  references = readMarkdownLinkReferences(state),
) {
  const url = node.name === "URL" ? node : node.getChild("URL");
  if (url) {
    const source = unescapeMarkdown(state.sliceDoc(url.from, url.to).trim());
    return source || null;
  }
  if (node.name !== "Link" || node.getChildren("LinkMark").length !== 2) {
    return null;
  }

  const label = node.getChild("LinkLabel");
  // Shortcut and collapsed references use the visible label; empty inline URLs must not fall back to a reference.
  const source = label && label.to > label.from + 2
    ? state.sliceDoc(label.from, label.to)
    : state.sliceDoc(node.from, label?.from ?? node.to);
  return references.get(
    normalizeMarkdownLinkLabel(source),
  ) ?? null;
}

function linkNodeAt(state: EditorState, position: number) {
  const boundedPosition = Math.max(0, Math.min(position, state.doc.length));
  const tree = syntaxTree(state);
  const candidates = [
    tree.resolveInner(boundedPosition, 1),
    tree.resolveInner(boundedPosition, -1),
  ];

  for (const candidate of candidates) {
    let node: MarkraSyntaxNode | null = candidate;
    while (node) {
      if (node.name === "Link" || node.name === "Autolink") return node;
      if (
        node.name === "URL" &&
        node.parent?.name !== "Image" &&
        node.parent?.name !== "Link" &&
        node.parent?.name !== "Autolink"
      ) {
        return node;
      }
      node = node.parent;
    }
  }
  return null;
}

function linkSource(state: EditorState, node: MarkraSyntaxNode) {
  const source = readMarkdownLinkDestination(state, node);
  if (!source) return null;
  return node.name === "Link" ? source : resolveAutolinkTarget(source);
}

function resolvedLinkSource(
  view: CodeMirrorView,
  source: string,
  resolver: LinksPluginOptions["resolveTarget"],
): ResolvedLink | null {
  const sourceContext: MarkraLinkSourceContext = {
    source,
    state: view.state,
    view,
  };
  let target: string | null;
  try {
    target = resolver
      ? resolver(sourceContext)
      : resolveSafeLinkTarget(source);
  } catch {
    return null;
  }

  const normalizedTarget = target?.trim();
  return normalizedTarget ? { source, target: normalizedTarget } : null;
}

function resolvedLinkAt(
  view: CodeMirrorView,
  position: number,
  resolver: LinksPluginOptions["resolveTarget"],
): ResolvedLink | null {
  const node = linkNodeAt(view.state, position);
  if (!node) return null;
  const source = linkSource(view.state, node);
  if (!source) return null;
  return resolvedLinkSource(view, source, resolver);
}

function openResolvedLink(
  view: CodeMirrorView,
  link: ResolvedLink,
  options: LinksPluginOptions,
) {
  try {
    const result = options.open({
      ...link,
      state: view.state,
      view,
    });
    if (
      result &&
      typeof (result as { then?: unknown }).then === "function"
    ) {
      Promise.resolve(result).catch(() => undefined);
    }
    return true;
  } catch {
    return false;
  }
}

export function openMarkraLinkSource(
  view: CodeMirrorView,
  source: string,
  options: LinksPluginOptions,
) {
  const link = resolvedLinkSource(view, source, options.resolveTarget);
  return link ? openResolvedLink(view, link, options) : false;
}

function openLinkAt(
  view: CodeMirrorView,
  position: number,
  options: LinksPluginOptions,
) {
  const link = resolvedLinkAt(view, position, options.resolveTarget);
  return link ? openResolvedLink(view, link, options) : false;
}

function linkPositionFromEvent(event: MouseEvent, view: CodeMirrorView) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const link = target.closest(".cm-markra-link");
  if (!link || !view.contentDOM.contains(link)) return null;

  try {
    return view.posAtDOM(link, 0);
  } catch {
    return null;
  }
}

function revealLinkSourceAt(view: CodeMirrorView, position: number) {
  const node = linkNodeAt(view.state, position);
  if (!node) return false;
  const url = node.name === "URL" ? node : node.getChild("URL");
  const marks = node.name === "Link" ? node.getChildren("LinkMark") : [];
  const labelFrom = marks[0]?.to;
  const labelTo = marks[1]?.from;
  const anchor = labelFrom !== undefined && labelTo !== undefined
    ? labelFrom < labelTo
      ? Math.min(labelFrom + 1, labelTo)
      : Math.min(node.from + 1, node.to)
    : Math.min((url?.from ?? node.from) + 1, url?.to ?? node.to);

  // Live preview only reveals an active node while the editor owns focus, so
  // focus before dispatching the selection that switches this link to source.
  view.focus();
  view.dispatch({
    selection: EditorSelection.cursor(anchor),
    scrollIntoView: true,
  });
  return true;
}

function syncLinkModifierCursor(
  view: CodeMirrorView,
  event: Pick<KeyboardEvent | MouseEvent, "ctrlKey" | "metaKey">,
) {
  if (event.metaKey || event.ctrlKey) {
    view.dom.dataset.markraLinkModifier = "true";
  } else {
    delete view.dom.dataset.markraLinkModifier;
  }
}

export function linksPlugin(options: LinksPluginOptions) {
  const activation = options.activation ?? "modifier";
  const isAvailable = (view: CodeMirrorView) =>
    resolvedLinkAt(
      view,
      view.state.selection.main.head,
      options.resolveTarget,
    ) !== null;

  return defineMarkraPlugin({
    id: "markra.links",
    commands: [
      {
        id: "link.open",
        isEnabled: isAvailable,
        keybindings: [
          { key: "Mod-Enter", preventDefault: true },
        ],
        label: options.label ?? "Open link",
        run(view) {
          return openLinkAt(
            view,
            view.state.selection.main.head,
            options,
          );
        },
      },
    ],
    extension:
      activation === "none"
        ? []
        : EditorView.domEventHandlers({
            blur(_event, view) {
              delete view.dom.dataset.markraLinkModifier;
              return false;
            },
            click(event, view) {
              const target = event.target;
              if (!(target instanceof Element)) return false;
              const link = target.closest(".cm-markra-link");
              if (!link || !view.contentDOM.contains(link)) return false;

              // Navigation is handled on mousedown so CodeMirror cannot move
              // the caret and reveal the source before the link is resolved.
              event.preventDefault();
              return true;
            },
            keydown(event, view) {
              syncLinkModifierCursor(view, event);
              return false;
            },
            keyup(event, view) {
              syncLinkModifierCursor(view, event);
              return false;
            },
            mousedown(event, view) {
              if (event.button !== 0) return false;
              const position = linkPositionFromEvent(event, view);
              if (position === null) return false;
              if (
                activation === "modifier" &&
                !event.metaKey &&
                !event.ctrlKey
              ) {
                if (!revealLinkSourceAt(view, position)) return false;
                event.preventDefault();
                return true;
              }

              // CodeMirror moves the selection on mousedown. Intercepting here
              // keeps the rendered link DOM alive long enough to resolve it.
              if (!openLinkAt(view, position, options)) return false;
              event.preventDefault();
              return true;
            },
            mousemove(event, view) {
              syncLinkModifierCursor(view, event);
              return false;
            },
          }),
    ui: [
      {
        command: "link.open",
        group: "link",
        icon: "external-link",
        placement: "context-menu",
        when: isAvailable,
      },
    ],
  });
}
