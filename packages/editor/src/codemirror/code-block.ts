import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  Prec,
  StateField,
  type Range,
  type EditorState,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  WidgetType,
  type DecorationSet,
  type EditorView as CodeMirrorView,
} from "@codemirror/view";
import {
  highlightMarkraCode,
  markraCodeLanguageOptions,
  normalizeMarkraCodeLanguage,
  type MarkraCodeLanguageOption,
} from "../code-support.ts";
import {
  isMermaidLanguage,
  mermaidThemeFromElement,
  renderMermaidToSvg,
} from "../mermaid.ts";
import { defineMarkraPlugin } from "./plugin.ts";
import {
  createMediaViewerEnlargeIcon,
  openMediaViewer,
  type MediaViewerHandle,
} from "./media-viewer.ts";
import {
  markraRenderer,
  type MarkraRendererContext,
  type MarkraSyntaxNode,
} from "./renderers.ts";

export interface CodeBlockHighlightSpan {
  readonly className: string;
  readonly from: number;
  readonly to: number;
}

export interface CodeBlockHighlightContext {
  readonly code: string;
  readonly language: string;
  readonly state: EditorState;
  readonly view: CodeMirrorView;
}

export interface CodeBlockPreviewPluginOptions {
  highlight?: (
    context: CodeBlockHighlightContext,
  ) => readonly CodeBlockHighlightSpan[];
  labels?: Partial<CodeBlockPreviewLabels>;
  languages?: readonly MarkraCodeLanguageOption[];
  plainTextLabel?: string;
  renderMermaid?: (
    context: CodeBlockMermaidContext,
  ) => Promise<string>;
}

export interface CodeBlockMermaidContext {
  readonly source: string;
  readonly theme: string;
  readonly view: CodeMirrorView;
}

export interface CodeBlockPreviewLabels {
  readonly codeCopied: string;
  readonly copyCode: string;
  readonly language: string;
  readonly mermaidDiagram: string;
  readonly mermaidError: string;
}

interface CodeBlockParts {
  code: string;
  codeNode: MarkraSyntaxNode | null;
  hasClosingFence: boolean;
  language: string;
  languageFrom: number;
  languageTo: number;
  openingMarkTo: number;
}

const defaultLabels: CodeBlockPreviewLabels = {
  codeCopied: "Code copied",
  copyCode: "Copy code block",
  language: "Code block language",
  mermaidDiagram: "Mermaid diagram",
  mermaidError: "Unable to render Mermaid diagram",
};

const svgNamespace = "http://www.w3.org/2000/svg";

function createCodeControlIcon(
  document: Document,
  className: string,
  children: readonly {
    readonly attributes: Readonly<Record<string, string>>;
    readonly tag: "path" | "rect";
  }[],
) {
  const icon = document.createElementNS(svgNamespace, "svg");
  icon.classList.add(className);
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("fill", "none");
  icon.setAttribute("height", "15");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "15");
  for (const childDefinition of children) {
    const child = document.createElementNS(svgNamespace, childDefinition.tag);
    for (const [name, value] of Object.entries(childDefinition.attributes)) {
      child.setAttribute(name, value);
    }
    icon.append(child);
  }
  return icon;
}

const copyIconChildren = [
  {
    tag: "rect",
    attributes: {
      height: "14",
      rx: "2",
      ry: "2",
      width: "14",
      x: "8",
      y: "8",
    },
  },
  {
    tag: "path",
    attributes: {
      d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
    },
  },
] as const;

const checkIconChildren = [
  {
    tag: "path",
    attributes: { d: "M20 6 9 17l-5-5" },
  },
] as const;

const codeBlockTheme = EditorView.baseTheme({
  ".cm-markra-code-line": {
    backgroundColor: "color-mix(in srgb, currentColor 5%, transparent)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    paddingLeft: "0.85em",
    paddingRight: "0.85em",
  },
  ".cm-markra-code-header-line": {
    borderRadius: "0.45em 0.45em 0 0",
    paddingBottom: "0.35em",
    paddingTop: "0.35em",
  },
  ".cm-markra-code-top-gap": {
    height: "12px",
    margin: "0",
    pointerEvents: "none",
    width: "100%",
  },
  ".cm-markra-code-header": {
    color: "color-mix(in srgb, currentColor 62%, transparent)",
    display: "inline-block",
    fontFamily: 'var(--font-ui, "Noto Sans SC Variable", sans-serif)',
    fontSize: "0.78em",
    fontWeight: "650",
    letterSpacing: "0.04em",
  },
  ".cm-markra-code-header-wrap": {
    alignItems: "center",
    display: "flex",
    gap: "0.5em",
    justifyContent: "space-between",
  },
  ".cm-markra-code-header-actions": {
    alignItems: "center",
    display: "inline-flex",
    gap: "0.35em",
  },
  ".markra-code-copy-button, .markra-code-language-select": {
    background: "transparent",
    border: "1px solid color-mix(in srgb, currentColor 15%, transparent)",
    borderRadius: "0.35em",
    color: "inherit",
    font: "inherit",
    fontSize: "0.78em",
    minHeight: "1.65rem",
  },
  ".markra-code-copy-button": {
    cursor: "pointer",
    opacity: "1",
    padding: "0.15em 0.55em",
    pointerEvents: "auto",
    position: "static",
    transform: "none",
  },
  ".markra-code-language-select": {
    padding: "0.1em 0.35em",
  },
  ".cm-markra-code-content-line": {
    borderLeft: "1px solid color-mix(in srgb, currentColor 10%, transparent)",
    borderRight: "1px solid color-mix(in srgb, currentColor 10%, transparent)",
  },
  ".cm-markra-code-content-line::before": {
    color: "color-mix(in srgb, currentColor 38%, transparent)",
    content: "attr(data-code-line-number)",
    display: "inline-block",
    marginRight: "1em",
    minWidth: "2ch",
    textAlign: "right",
    userSelect: "none",
  },
  ".cm-markra-code-closing-line": {
    borderRadius: "0 0 0.45em 0.45em",
    height: "3.5em",
    lineHeight: "0.75em",
    minHeight: "3.5em",
    overflow: "visible",
    position: "relative",
  },
  ".cm-markra-code-exit-wrap": {
    display: "inline-block",
    height: "100%",
    width: "100%",
  },
  ".cm-markra-code-exit": {
    cursor: "text",
    display: "inline-block",
    height: "100%",
    width: "100%",
  },
  ".cm-markra-code-source-line": {
    color: "color-mix(in srgb, currentColor 72%, transparent)",
  },
  ".markra-mermaid-render": {
    background: "color-mix(in srgb, currentColor 3%, transparent)",
    border: "1px solid color-mix(in srgb, currentColor 12%, transparent)",
    borderRadius: "0.45em",
    cursor: "text",
    display: "block",
    margin: "0.5em 0",
    minHeight: "3.5em",
    overflow: "auto",
    padding: "0.85em",
    position: "relative",
    textAlign: "center",
  },
  ".markra-mermaid-render svg": {
    height: "auto",
    maxWidth: "100%",
  },
  ".cm-markra-mermaid-hidden-line": {
    display: "none",
  },
});

class CodeBlockTopGapWidget extends WidgetType {
  eq() {
    return true;
  }

  get estimatedHeight() {
    return 12;
  }

  toDOM(view: CodeMirrorView) {
    const gap = view.dom.ownerDocument.createElement("div");
    gap.className = "cm-markra-code-top-gap";
    gap.setAttribute("aria-hidden", "true");
    return gap;
  }
}

function codeBlockTopGapDecorations(state: EditorState) {
  const gaps: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.name !== "FencedCode") return;
      const firstLine = state.doc.lineAt(node.from);
      const lastLine = state.doc.lineAt(node.to);
      if (firstLine.number === lastLine.number) return;
      gaps.push(
        Decoration.widget({
          block: true,
          side: -100,
          widget: new CodeBlockTopGapWidget(),
        }).range(node.from),
      );
    },
  });
  return Decoration.set(gaps, true);
}

const codeBlockTopGapField = StateField.define<DecorationSet>({
  create: codeBlockTopGapDecorations,
  update(gaps, transaction) {
    return transaction.docChanged
      ? codeBlockTopGapDecorations(transaction.state)
      : gaps;
  },
  provide: (field) => EditorView.decorations.from(field),
});

class CodeBlockHeaderWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly displayLanguage: string,
    readonly labels: CodeBlockPreviewLabels,
    readonly language: string,
    readonly languageFrom: number,
    readonly languageTo: number,
    readonly languages: readonly MarkraCodeLanguageOption[],
    readonly openingMarkTo: number,
  ) {
    super();
  }

  eq(other: CodeBlockHeaderWidget) {
    return (
      this.code === other.code &&
      this.displayLanguage === other.displayLanguage &&
      this.language === other.language &&
      this.languageFrom === other.languageFrom &&
      this.languageTo === other.languageTo &&
      this.openingMarkTo === other.openingMarkTo &&
      JSON.stringify(this.labels) === JSON.stringify(other.labels) &&
      JSON.stringify(this.languages) === JSON.stringify(other.languages)
    );
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const wrapper = document.createElement("span");
    const label = document.createElement("span");
    const actions = document.createElement("span");
    const languageControl = document.createElement("span");
    const language = document.createElement("select");
    const copy = document.createElement("button");

    wrapper.className = "cm-markra-code-header-wrap";
    label.className = "cm-markra-code-header";
    label.textContent = this.displayLanguage;
    actions.className = "cm-markra-code-header-actions";
    languageControl.className = "markra-code-language-control";
    language.className = "markra-code-language-select";
    language.ariaLabel = this.labels.language;
    language.disabled = view.state.readOnly;
    copy.className = "markra-code-copy-button";
    copy.type = "button";
    copy.ariaLabel = this.labels.copyCode;
    copy.title = this.labels.copyCode;
    copy.dataset.copied = "false";
    copy.append(
      createCodeControlIcon(
        document,
        "markra-code-copy-icon",
        copyIconChildren,
      ),
      createCodeControlIcon(
        document,
        "markra-code-copy-check-icon",
        checkIconChildren,
      ),
    );

    const languageOptions = [...this.languages];
    if (
      this.language &&
      !languageOptions.some((option) => option.value === this.language)
    ) {
      languageOptions.push({ label: this.language, value: this.language });
    }
    for (const optionDefinition of languageOptions) {
      const option = document.createElement("option");
      option.value = optionDefinition.value;
      option.textContent = optionDefinition.label;
      language.append(option);
    }
    language.value = this.language;

    language.addEventListener("mousedown", (event) => event.stopPropagation());
    language.addEventListener("change", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (view.state.readOnly) return;
      const nextLanguage = normalizeMarkraCodeLanguage(language.value);
      if (nextLanguage === this.language) return;
      view.dispatch({
        changes: this.languageFrom < this.languageTo
          ? {
              from: this.languageFrom,
              insert: nextLanguage,
              to: this.languageTo,
            }
          : { from: this.openingMarkTo, insert: nextLanguage },
      });
    });

    copy.addEventListener("mousedown", (event) => event.stopPropagation());
    copy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const clipboard = document.defaultView?.navigator.clipboard;
      if (!clipboard?.writeText) return;
      clipboard.writeText(this.code).then(() => {
        copy.ariaLabel = this.labels.codeCopied;
        copy.title = this.labels.codeCopied;
        copy.dataset.copied = "true";
      }).catch(() => undefined);
    });

    // Keep both controls in one header surface. The closing widget stays a
    // compact exit target instead of creating detached chrome below the block.
    languageControl.append(language);
    actions.append(languageControl, copy);
    wrapper.append(label, actions);
    return wrapper;
  }
}

function moveSelectionAfterCodeBlock(
  view: CodeMirrorView,
  requestedAfterFence: number,
) {
  const afterFence = Math.min(requestedAfterFence, view.state.doc.length);
  const hasFollowingLineBreak =
    view.state.sliceDoc(afterFence, afterFence + 1) === "\n";
  const canMaterializeLine = !hasFollowingLineBreak && !view.state.readOnly;

  // The closing fence is visually folded. Materialize/select the line after
  // it so clicks in the visual gap can never append code inside the fence.
  view.dispatch({
    changes: canMaterializeLine
      ? { from: afterFence, insert: "\n" }
      : undefined,
    scrollIntoView: true,
    selection: EditorSelection.cursor(
      afterFence + (hasFollowingLineBreak || canMaterializeLine ? 1 : 0),
    ),
  });
  view.focus();
}

class CodeBlockExitWidget extends WidgetType {
  constructor(readonly afterFence: number) {
    super();
  }

  eq(other: CodeBlockExitWidget) {
    return this.afterFence === other.afterFence;
  }

  ignoreEvent() {
    return true;
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const wrapper = document.createElement("span");
    const exit = document.createElement("span");
    wrapper.className = "cm-markra-code-exit-wrap";
    exit.className = "cm-markra-code-exit";
    exit.setAttribute("aria-hidden", "true");

    exit.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || view.state.readOnly) return;
      event.preventDefault();
      event.stopPropagation();
      moveSelectionAfterCodeBlock(view, this.afterFence);
    });
    wrapper.append(exit);
    return wrapper;
  }
}

class MermaidPreviewWidget extends WidgetType {
  private observer: MutationObserver | null = null;
  private renderToken = 0;
  private mediaViewer: MediaViewerHandle | null = null;

  constructor(
    readonly from: number,
    readonly labels: CodeBlockPreviewLabels,
    readonly renderMermaid: NonNullable<CodeBlockPreviewPluginOptions["renderMermaid"]>,
    readonly source: string,
  ) {
    super();
  }

  eq(other: MermaidPreviewWidget) {
    return this.from === other.from && this.source === other.source;
  }

  ignoreEvent() {
    return true;
  }

  private closeViewer() {
    this.mediaViewer?.close({ restoreFocus: false });
    this.mediaViewer = null;
  }

  private openZoom(
    view: CodeMirrorView,
    preview: HTMLElement,
    trigger: HTMLButtonElement,
  ) {
    const sourceSvg = preview.querySelector("svg");
    if (!sourceSvg) return;
    this.closeViewer();
    this.mediaViewer = openMediaViewer({
      labels: {
        close: "Close enlarged Mermaid diagram",
        dialog: "Enlarged Mermaid diagram",
        enterFullscreen: "Enter full screen",
        exitFullscreen: "Exit full screen",
        reset: "Reset Mermaid diagram view",
        viewport: "Mermaid diagram viewport",
        zoomIn: "Zoom in Mermaid diagram",
        zoomOut: "Zoom out Mermaid diagram",
      },
      media: sourceSvg,
      mount: view.dom.closest(".markdown-paper") ?? view.dom.ownerDocument.body,
      restoreFocus: trigger,
    });
  }

  private appendZoomButton(
    view: CodeMirrorView,
    preview: HTMLElement,
    wrapper: HTMLElement,
  ) {
    if (!preview.querySelector("svg")) return;
    wrapper.querySelector(".markra-mermaid-zoom-button")?.remove();
    const button = view.dom.ownerDocument.createElement("button");
    button.type = "button";
    button.className = "markra-mermaid-zoom-button";
    button.ariaLabel = "Enlarge Mermaid diagram";
    button.title = "Enlarge Mermaid diagram";
    button.append(createMediaViewerEnlargeIcon(
      view.dom.ownerDocument,
      "markra-mermaid-zoom-icon",
    ));
    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openZoom(view, preview, button);
    });
    wrapper.append(button);
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const wrapper = document.createElement("div");
    const preview = document.createElement("div");
    wrapper.className = "markra-code-block";
    wrapper.dataset.mermaidMode = "preview";
    preview.className = "markra-mermaid-render";
    preview.tabIndex = 0;
    preview.ariaLabel = this.labels.mermaidDiagram;
    preview.setAttribute("aria-busy", "true");

    const revealSource = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        scrollIntoView: true,
        selection: { anchor: this.from },
      });
      view.focus();
    };
    preview.addEventListener("click", revealSource);
    preview.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") revealSource(event);
    });

    const render = () => {
      this.renderToken += 1;
      const token = this.renderToken;
      const theme = mermaidThemeFromElement(preview);
      preview.setAttribute("aria-busy", "true");
      this.renderMermaid({ source: this.source, theme, view })
        .then((svg) => {
          if (token !== this.renderToken) return;
          this.closeViewer();
          preview.innerHTML = svg;
          this.appendZoomButton(view, preview, wrapper);
          preview.setAttribute("aria-busy", "false");
        })
        .catch(() => {
          if (token !== this.renderToken) return;
          preview.textContent = this.labels.mermaidError;
          preview.dataset.error = "true";
          preview.setAttribute("aria-busy", "false");
        });
    };
    render();

    const MutationObserverConstructor = document.defaultView?.MutationObserver;
    if (MutationObserverConstructor) {
      this.observer = new MutationObserverConstructor(render);
      const options = {
        attributeFilter: ["data-editor-theme", "data-theme"],
        attributes: true,
      };
      const paper = view.dom.closest(".markdown-paper");
      if (paper) this.observer.observe(paper, options);
      this.observer.observe(document.documentElement, options);
    }
    wrapper.append(preview);
    return wrapper;
  }

  destroy() {
    this.renderToken += 1;
    this.closeViewer();
    this.observer?.disconnect();
    this.observer = null;
  }
}

function codeBlockParts(
  state: EditorState,
  node: MarkraSyntaxNode,
): CodeBlockParts {
  const codeNode = node.getChild("CodeText");
  const infoNode = node.getChild("CodeInfo");
  const openingMark = node.getChildren("CodeMark")[0];
  const info = infoNode
    ? state.sliceDoc(infoNode.from, infoNode.to).trim()
    : "";
  const rawLanguage = info.split(/\s+/u)[0] ?? "";
  return {
    code: codeNode ? state.sliceDoc(codeNode.from, codeNode.to) : "",
    codeNode,
    hasClosingFence: node.getChildren("CodeMark").length > 1,
    language: normalizeMarkraCodeLanguage(rawLanguage),
    languageFrom: infoNode?.from ?? openingMark?.to ?? node.from,
    languageTo: infoNode ? infoNode.from + rawLanguage.length : openingMark?.to ?? node.from,
    openingMarkTo: openingMark?.to ?? node.from,
  };
}

function normalizeHighlights(
  spans: readonly CodeBlockHighlightSpan[],
  codeLength: number,
) {
  return spans.flatMap((span) => {
    const className = span.className.trim();
    if (
      !className ||
      !Number.isInteger(span.from) ||
      !Number.isInteger(span.to) ||
      span.from < 0 ||
      span.from >= span.to ||
      span.to > codeLength
    ) {
      return [];
    }
    return [{ ...span, className }];
  });
}

function lineIntersects(
  line: Readonly<{ from: number; to: number }>,
  range: Readonly<{ from: number; to: number }>,
) {
  return line.from < range.to && line.to >= range.from;
}

function fencedCodeAt(view: CodeMirrorView) {
  let node: ReturnType<typeof syntaxTree>["topNode"] | null =
    syntaxTree(view.state).resolveInner(view.state.selection.main.head, -1);
  while (node) {
    if (node.name === "FencedCode") return node as MarkraSyntaxNode;
    node = node.parent;
  }
  return null;
}

function selectCurrentCodeBlockContent(view: CodeMirrorView) {
  const node = fencedCodeAt(view);
  const code = node?.getChild("CodeText");
  if (!code) return false;
  const selection = view.state.selection.main;
  if (selection.from === code.from && selection.to === code.to) return false;

  view.dispatch({
    scrollIntoView: true,
    selection: EditorSelection.range(code.from, code.to),
  });
  return true;
}

function handleCodeBlockEnter(view: CodeMirrorView) {
  const selection = view.state.selection.main;
  if (!selection.empty || view.state.readOnly) return false;
  const node = fencedCodeAt(view);
  if (!node) return false;
  const parts = codeBlockParts(view.state, node);
  const cursorLine = view.state.doc.lineAt(selection.head);
  const openingMark = parts.hasClosingFence
    ? undefined
    : node.getChildren("CodeMark")[0];
  const openingLine = openingMark
    ? view.state.doc.lineAt(openingMark.from)
    : undefined;
  const closingFence = openingMark && openingLine
    ? `${view.state.sliceDoc(
        openingLine.from,
        openingMark.from,
      )}${view.state.sliceDoc(openingMark.from, openingMark.to)}`
    : undefined;

  if (
    openingLine &&
    closingFence &&
    cursorLine.number === openingLine.number &&
    selection.head === cursorLine.to
  ) {
    // Pair on Enter so an info string such as ```sh can still be typed before
    // the editor creates the content line and matching closing fence.
    view.dispatch({
      changes: {
        from: cursorLine.to,
        insert: `\n\n${closingFence}`,
      },
      scrollIntoView: true,
      selection: EditorSelection.cursor(cursorLine.to + 1),
    });
    view.focus();
    return true;
  }

  if (cursorLine.text.trim()) return false;

  if (!parts.hasClosingFence) {
    if (
      cursorLine.number !== view.state.doc.lines ||
      selection.head !== cursorLine.to ||
      !closingFence
    ) {
      return false;
    }

    view.dispatch({
      changes: {
        from: cursorLine.from,
        insert: `${closingFence}\n`,
        to: cursorLine.to,
      },
      scrollIntoView: true,
      selection: EditorSelection.cursor(
        cursorLine.from + closingFence.length + 1,
      ),
    });
    view.focus();
    return true;
  }

  const closingLine = view.state.doc.lineAt(node.to);
  if (cursorLine.number + 1 !== closingLine.number) return false;

  // The first Enter creates this trailing empty code line. The next Enter
  // exits. Unfinished blocks are closed first so the new cursor position is
  // structurally outside the fence instead of extending code forever.
  moveSelectionAfterCodeBlock(view, node.to);
  return true;
}

function exitMermaidSource(view: CodeMirrorView) {
  const node = fencedCodeAt(view);
  if (!node) return false;
  const parts = codeBlockParts(view.state, node);
  if (!isMermaidLanguage(parts.language)) return false;

  view.dispatch({
    selection: EditorSelection.cursor(
      Math.min(view.state.doc.length, node.to + 1),
    ),
  });
  return true;
}

const codeBlockKeymap = Prec.high(
  keymap.of([
    { key: "Enter", run: handleCodeBlockEnter },
    { key: "Mod-a", run: selectCurrentCodeBlockContent },
    { key: "Escape", run: exitMermaidSource },
  ]),
);

const codeBlockPointerHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0 || !(event.target instanceof Element)) return false;
    const closingLine = event.target.closest<HTMLElement>(
      ".cm-markra-code-closing-line",
    );
    const rawAfterFence = closingLine?.dataset.codeBlockEnd;
    if (!closingLine || rawAfterFence === undefined) return false;
    const afterFence = Number(rawAfterFence);
    if (!Number.isInteger(afterFence)) return false;

    event.preventDefault();
    event.stopPropagation();
    moveSelectionAfterCodeBlock(view, afterFence);
    return true;
  },
});

export function codeBlockPreviewPlugin(
  options: CodeBlockPreviewPluginOptions = {},
) {
  const plainTextLabel = options.plainTextLabel?.trim() || "Plain text";
  const labels = { ...defaultLabels, ...options.labels };
  const languages = options.languages ?? markraCodeLanguageOptions;
  const highlight = options.highlight ?? ((context: CodeBlockHighlightContext) =>
    highlightMarkraCode(context.language, context.code));
  const renderMermaid = options.renderMermaid ?? ((context: CodeBlockMermaidContext) =>
    renderMermaidToSvg(context.source, {
      idPrefix: "markra-codemirror-mermaid",
      theme: context.theme,
    }));
  const highlightCache = new WeakMap<
    Text,
    Map<string, readonly CodeBlockHighlightSpan[]>
  >();

  const highlightsFor = (
    context: MarkraRendererContext,
    parts: CodeBlockParts,
  ) => {
    if (!parts.codeNode) return [];
    let documentCache = highlightCache.get(context.state.doc);
    if (!documentCache) {
      documentCache = new Map();
      highlightCache.set(context.state.doc, documentCache);
    }
    const key = `${context.node.from}:${context.node.to}:${parts.language}`;
    const cached = documentCache.get(key);
    if (cached) return cached;

    let highlighted: readonly CodeBlockHighlightSpan[] = [];
    try {
      highlighted = normalizeHighlights(
        highlight({
          code: parts.code,
          language: parts.language,
          state: context.state,
          view: context.view,
        }),
        parts.code.length,
      );
    } catch {
      highlighted = [];
    }
    documentCache.set(key, highlighted);
    return highlighted;
  };

  return defineMarkraPlugin({
    id: "markra.code-block-preview",
    extension: [
      // Vertical margins and padding on editable lines are not part of
      // CodeMirror's height map in every WebView. State-field block widgets
      // are measured explicitly, so repeated blocks cannot accumulate a
      // pointer-to-caret offset.
      codeBlockTopGapField,
      markraRenderer({
        id: "markra.code-block-preview",
        nodeNames: ["FencedCode"],
        scope: "visible-range",
        render(context) {
          const { node, state, visibleRange } = context;
          const parts = codeBlockParts(state, node);
          const firstLine = state.doc.lineAt(node.from);
          const lastLine = state.doc.lineAt(node.to);
          if (
            !parts.hasClosingFence &&
            firstLine.number === lastLine.number
          ) {
            // Keep a newly typed fence visible until Enter pairs it. Folding
            // its only line would leave a zero-height block with no caret.
            return false;
          }
          const revealed = context.revealed("line");
          // A Mermaid source selection must not collapse as soon as dragging
          // makes it non-empty. Anchor-only matching preserves drags that
          // start inside the block without revealing source for selections
          // that merely pass over the preview from outside.
          const selectionAnchoredInside =
            context.view.hasFocus &&
            state.selection.ranges.some(
              (selection) =>
                !selection.empty &&
                selection.anchor >= node.from &&
                selection.anchor <= node.to,
            );
          const sourceRevealed =
            isMermaidLanguage(parts.language) &&
            (revealed || selectionAnchoredInside);
          if (
            !sourceRevealed &&
            parts.codeNode &&
            parts.code.trim() &&
            isMermaidLanguage(parts.language)
          ) {
            const firstLine = state.doc.lineAt(node.from);
            const lastLine = state.doc.lineAt(node.to);
            context.add(
              Decoration.replace({
                widget: new MermaidPreviewWidget(
                  parts.codeNode.from,
                  labels,
                  renderMermaid,
                  parts.code,
                ),
              }).range(firstLine.from, firstLine.to),
            );
            for (
              let lineNumber = firstLine.number + 1;
              lineNumber <= lastLine.number;
              lineNumber += 1
            ) {
              context.add(
                Decoration.line({
                  class: "cm-markra-mermaid-hidden-line",
                }).range(state.doc.line(lineNumber).from),
              );
            }
            return false;
          }
          const visibleFrom = Math.max(node.from, visibleRange.from);
          const visibleTo = Math.min(node.to, visibleRange.to);
          if (visibleFrom >= visibleTo) return false;

          const firstVisibleLine = state.doc.lineAt(visibleFrom).number;
          const lastVisibleLine = state.doc.lineAt(visibleTo - 1).number;
          let codeLineNumber = 0;
          for (
            let lineNumber = firstVisibleLine;
            lineNumber <= lastVisibleLine;
            lineNumber += 1
          ) {
            const line = state.doc.line(lineNumber);
            const roleClass =
              line.number === firstLine.number
                ? sourceRevealed
                  ? "cm-markra-code-source-line"
                  : "cm-markra-code-header-line"
                : parts.hasClosingFence && line.number === lastLine.number
                  ? sourceRevealed
                    ? "cm-markra-code-source-line"
                    : "cm-markra-code-closing-line"
                  : "cm-markra-code-content-line";
            const codeContentLine = roleClass === "cm-markra-code-content-line";
            if (codeContentLine) codeLineNumber += 1;
            context.add(
              Decoration.line({
                attributes: codeContentLine
                  ? { "data-code-line-number": String(codeLineNumber) }
                  : roleClass === "cm-markra-code-closing-line"
                    ? {
                        "data-code-block-active": String(revealed),
                        "data-code-block-end": String(node.to),
                      }
                    : undefined,
                class: `cm-markra-code-line ${roleClass}`,
              }).range(line.from),
            );
          }

          if (!sourceRevealed && lineIntersects(firstLine, visibleRange)) {
            context.add(
              Decoration.replace({
                widget: new CodeBlockHeaderWidget(
                  parts.code,
                  parts.language || plainTextLabel,
                  labels,
                  parts.language,
                  parts.languageFrom,
                  parts.languageTo,
                  languages,
                  parts.openingMarkTo,
                ),
              }).range(node.from, firstLine.to),
            );
          }
          if (
            !sourceRevealed &&
            parts.hasClosingFence &&
            lineIntersects(lastLine, visibleRange)
          ) {
            context.add(
              Decoration.replace({
                widget: new CodeBlockExitWidget(node.to),
              }).range(lastLine.from, node.to),
            );
          }

          if (parts.codeNode) {
            const contentFrom = Math.max(
              parts.codeNode.from,
              visibleRange.from,
            );
            const contentTo = Math.min(parts.codeNode.to, visibleRange.to);
            if (contentFrom < contentTo) {
              context.add(
                Decoration.mark({ class: "cm-markra-code-content" }).range(
                  contentFrom,
                  contentTo,
                ),
              );
            }

            for (const span of highlightsFor(context, parts)) {
              const from = Math.max(
                parts.codeNode.from + span.from,
                visibleRange.from,
              );
              const to = Math.min(
                parts.codeNode.from + span.to,
                visibleRange.to,
              );
              if (from >= to) continue;
              context.add(
                Decoration.mark({
                  class: `cm-markra-code-token ${span.className}`,
                }).range(from, to),
              );
            }
          }

          return false;
        },
      }),
      codeBlockKeymap,
      codeBlockPointerHandlers,
      codeBlockTheme,
    ],
  });
}
