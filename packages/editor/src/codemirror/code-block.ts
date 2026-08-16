import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type Range,
  type EditorState,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  ViewPlugin,
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
import { syntaxTreeChanged } from "./changes.ts";
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
  showLineNumbers?: boolean;
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
  ".cm-markra-code-content-line[data-code-line-number]::before": {
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
  // An inline-block avoids the empty line boxes WebKit can produce around
  // CodeMirror's widget buffers while still letting the preview fill the row.
  ".markra-code-block[data-mermaid-mode='preview']": {
    boxSizing: "border-box",
    display: "inline-block",
    margin: "0",
    maxWidth: "100%",
    verticalAlign: "top",
    width: "100%",
  },
  ".markra-code-block[data-mermaid-mode='preview'] .markra-mermaid-render": {
    background: "transparent",
    border: "0",
    margin: "0",
    padding: "0",
  },
  ".markra-mermaid-render svg": {
    height: "auto",
    maxWidth: "100%",
  },
});

class CodeBlockTopGapWidget extends WidgetType {
  constructor(readonly showLineNumbers: boolean) {
    super();
  }

  eq(other: WidgetType) {
    return other instanceof CodeBlockTopGapWidget &&
      other.showLineNumbers === this.showLineNumbers;
  }

  get estimatedHeight() {
    return 12;
  }

  toDOM(view: CodeMirrorView) {
    const gap = view.dom.ownerDocument.createElement("div");
    gap.className = "cm-markra-code-top-gap";
    gap.setAttribute("aria-hidden", "true");
    gap.setAttribute(
      "data-code-line-numbers",
      String(this.showLineNumbers),
    );
    return gap;
  }
}

function codeBlockTopGapDecorations(
  state: EditorState,
  showLineNumbers: boolean,
) {
  const gaps: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.name !== "FencedCode") return;
      const firstLine = state.doc.lineAt(node.from);
      const lastLine = state.doc.lineAt(node.to);
      if (firstLine.number === lastLine.number) return;
      const fencedLanguage = /^\s*(?:`{3,}|~{3,})\s*([^\s`]*)/u
        .exec(firstLine.text)?.[1] ?? "";
      if (isMermaidLanguage(normalizeMarkraCodeLanguage(fencedLanguage))) {
        return;
      }
      // Fenced code may be indented by up to three spaces. Block widgets
      // anchored after that indentation split the folded header in WebKit.
      gaps.push(
        Decoration.widget({
          block: true,
          side: -100,
          widget: new CodeBlockTopGapWidget(showLineNumbers),
        }).range(firstLine.from),
      );
    },
  });
  return Decoration.set(gaps, true);
}

function createCodeBlockTopGapField(showLineNumbers: boolean) {
  return StateField.define<DecorationSet>({
    create: (state) => codeBlockTopGapDecorations(state, showLineNumbers),
    update(gaps, transaction) {
      // Background parsing commits a new tree without changing Markdown.
      // Re-scan so blocks discovered after initial load receive their chrome.
      const treeChanged = syntaxTreeChanged(
        transaction.startState,
        transaction.state,
      );
      return transaction.docChanged || treeChanged
        ? codeBlockTopGapDecorations(transaction.state, showLineNumbers)
        : gaps;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

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

interface MermaidPreviewRuntime {
  mediaViewer: MediaViewerHandle | null;
  observer: MutationObserver | null;
  renderToken: number;
}

const mermaidPreviewRuntimes = new WeakMap<
  HTMLElement,
  MermaidPreviewRuntime
>();

function removeEmptyMermaidLabels(preview: HTMLElement) {
  for (const emptyLabel of preview.querySelectorAll(
    'foreignObject[width="0"][height="0"]',
  )) {
    const label = emptyLabel.parentElement;
    if (
      label?.classList.contains("label") &&
      label.childElementCount === 1 &&
      !label.textContent?.trim()
    ) {
      label.remove();
      continue;
    }
    emptyLabel.remove();
  }
}

class MermaidPreviewWidget extends WidgetType {
  constructor(
    readonly sourceOffset: number,
    readonly labels: CodeBlockPreviewLabels,
    readonly renderMermaid: NonNullable<CodeBlockPreviewPluginOptions["renderMermaid"]>,
    readonly source: string,
  ) {
    super();
  }

  eq(other: MermaidPreviewWidget) {
    return (
      this.source === other.source &&
      this.sourceOffset === other.sourceOffset
    );
  }

  ignoreEvent() {
    return true;
  }

  private closeViewer(runtime: MermaidPreviewRuntime) {
    runtime.mediaViewer?.close({ restoreFocus: false });
    runtime.mediaViewer = null;
  }

  private openZoom(
    runtime: MermaidPreviewRuntime,
    view: CodeMirrorView,
    preview: HTMLElement,
    trigger: HTMLButtonElement,
  ) {
    const sourceSvg = preview.querySelector("svg");
    if (!sourceSvg) return;
    this.closeViewer(runtime);
    runtime.mediaViewer = openMediaViewer({
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
    runtime: MermaidPreviewRuntime,
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
      this.openZoom(runtime, view, preview, button);
    });
    wrapper.append(button);
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const wrapper = document.createElement("div");
    const preview = document.createElement("div");
    const runtime: MermaidPreviewRuntime = {
      mediaViewer: null,
      observer: null,
      renderToken: 0,
    };
    mermaidPreviewRuntimes.set(wrapper, runtime);
    wrapper.className = "markra-code-block";
    wrapper.dataset.mermaidMode = "preview";
    preview.className = "markra-mermaid-render";
    preview.tabIndex = 0;
    preview.ariaLabel = this.labels.mermaidDiagram;
    preview.setAttribute("aria-busy", "true");

    const revealSource = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      let anchor = this.sourceOffset;
      try {
        // The widget may move when text is inserted before an unchanged
        // diagram. Resolve its current document position from the reused DOM.
        anchor = view.posAtDOM(wrapper) + this.sourceOffset;
      } catch {
        // Fall back to the creation position if the DOM was already detached.
      }
      view.dispatch({
        scrollIntoView: true,
        selection: { anchor },
      });
      view.focus();
    };
    preview.addEventListener("click", revealSource);
    preview.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") revealSource(event);
    });

    const render = () => {
      runtime.renderToken += 1;
      const token = runtime.renderToken;
      const theme = mermaidThemeFromElement(preview);
      preview.setAttribute("aria-busy", "true");
      this.renderMermaid({ source: this.source, theme, view })
        .then((svg) => {
          if (token !== runtime.renderToken) return;
          this.closeViewer(runtime);
          preview.innerHTML = svg;
          removeEmptyMermaidLabels(preview);
          this.appendZoomButton(runtime, view, preview, wrapper);
          preview.setAttribute("aria-busy", "false");
        })
        .catch(() => {
          if (token !== runtime.renderToken) return;
          preview.textContent = this.labels.mermaidError;
          preview.dataset.error = "true";
          preview.setAttribute("aria-busy", "false");
        });
    };
    render();

    const MutationObserverConstructor = document.defaultView?.MutationObserver;
    if (MutationObserverConstructor) {
      runtime.observer = new MutationObserverConstructor(render);
      const options = {
        attributeFilter: ["data-editor-theme", "data-theme"],
        attributes: true,
      };
      const paper = view.dom.closest(".markdown-paper");
      if (paper) runtime.observer.observe(paper, options);
      runtime.observer.observe(document.documentElement, options);
    }
    wrapper.append(preview);
    return wrapper;
  }

  destroy(dom: HTMLElement) {
    const runtime = mermaidPreviewRuntimes.get(dom);
    if (!runtime) return;

    runtime.renderToken += 1;
    this.closeViewer(runtime);
    runtime.observer?.disconnect();
    runtime.observer = null;
    mermaidPreviewRuntimes.delete(dom);
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

const setMermaidPreviewFocusedEffect = StateEffect.define<boolean>();

interface MermaidPreviewState {
  readonly blocks: readonly MermaidPreviewBlock[];
  readonly decorations: DecorationSet;
  readonly focused: boolean;
}

interface MermaidPreviewBlock {
  readonly from: number;
  readonly source: string;
  readonly sourceOffset: number;
  readonly to: number;
}

function mermaidSourceRevealed(
  state: EditorState,
  from: number,
  to: number,
  focused: boolean,
) {
  if (!focused) return false;
  return state.selection.ranges.some((selection) =>
    selection.empty
      ? selection.head > from && selection.head <= to
      : selection.anchor > from && selection.anchor <= to
  );
}

function readMermaidPreviewBlocks(state: EditorState) {
  const blocks: MermaidPreviewBlock[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.type.name !== "FencedCode") return;
      const parts = codeBlockParts(state, node.node as MarkraSyntaxNode);
      if (
        !parts.codeNode ||
        !parts.code.trim() ||
        !isMermaidLanguage(parts.language)
      ) {
        return;
      }
      blocks.push({
        from: node.from,
        source: parts.code,
        sourceOffset: parts.codeNode.from - node.from,
        to: node.to,
      });
    },
  });
  return blocks;
}

function mermaidPreviewDecorationsFromBlocks(
  state: EditorState,
  focused: boolean,
  blocks: readonly MermaidPreviewBlock[],
  labels: CodeBlockPreviewLabels,
  renderMermaid: NonNullable<CodeBlockPreviewPluginOptions["renderMermaid"]>,
) {
  const previews: Range<Decoration>[] = [];
  for (const block of blocks) {
    if (mermaidSourceRevealed(state, block.from, block.to, focused)) continue;
    // Replace the complete fence with one block widget. Splitting the preview
    // across a first-line widget and hidden source lines makes CodeMirror
    // remount the expensive SVG while it reconciles the block's height map.
    previews.push(
      Decoration.replace({
        block: true,
        widget: new MermaidPreviewWidget(
          block.sourceOffset,
          labels,
          renderMermaid,
          block.source,
        ),
      }).range(block.from, block.to),
    );
  }
  return Decoration.set(previews, true);
}

function createMermaidPreviewState(
  state: EditorState,
  focused: boolean,
  labels: CodeBlockPreviewLabels,
  renderMermaid: NonNullable<CodeBlockPreviewPluginOptions["renderMermaid"]>,
): MermaidPreviewState {
  const blocks = readMermaidPreviewBlocks(state);
  return {
    blocks,
    decorations: mermaidPreviewDecorationsFromBlocks(
      state,
      focused,
      blocks,
      labels,
      renderMermaid,
    ),
    focused,
  };
}

function mapMermaidPreviewBlocks(
  blocks: readonly MermaidPreviewBlock[],
  transaction: Transaction,
) {
  return blocks.map((block) => ({
    ...block,
    from: transaction.changes.mapPos(block.from, 1),
    to: transaction.changes.mapPos(block.to, -1),
  }));
}

function changesTouchMermaidBlocks(
  transaction: Transaction,
  blocks: readonly MermaidPreviewBlock[],
) {
  let touched = false;
  transaction.changes.iterChangedRanges((fromA, toA) => {
    touched ||= blocks.some((block) =>
      fromA === toA
        ? fromA > block.from && fromA < block.to
        : fromA < block.to && toA > block.from
    );
  });
  return touched;
}

function changesMayAffectMermaidFences(transaction: Transaction) {
  let mayAffect = false;
  transaction.changes.iterChanges(
    (fromA, toA, fromB, _toB, inserted) => {
      if (fromA < toA || /[`~\r\n]/u.test(inserted.toString())) {
        mayAffect = true;
        return;
      }
      const line = transaction.state.doc.lineAt(fromB);
      mayAffect ||= /^\s*(?:`{3,}|~{3,})/u.test(line.text);
    },
  );
  return mayAffect;
}

function revealedMermaidBlocksKey(
  state: EditorState,
  focused: boolean,
  blocks: readonly MermaidPreviewBlock[],
) {
  return blocks.map((block) =>
    mermaidSourceRevealed(state, block.from, block.to, focused) ? "1" : "0"
  ).join("");
}

function createMermaidPreviewField(
  labels: CodeBlockPreviewLabels,
  renderMermaid: NonNullable<CodeBlockPreviewPluginOptions["renderMermaid"]>,
) {
  const field = StateField.define<MermaidPreviewState>({
    create(state) {
      return createMermaidPreviewState(
        state,
        true,
        labels,
        renderMermaid,
      );
    },
    update(previous, transaction) {
      // A long document can finish parsing in a later, document-neutral
      // transaction. Rebuild so newly discovered Mermaid fences get previews.
      const treeChanged = syntaxTreeChanged(
        transaction.startState,
        transaction.state,
      );
      const focusEffect = transaction.effects.find((effect) =>
        effect.is(setMermaidPreviewFocusedEffect)
      );
      const focused = focusEffect?.value ?? previous.focused;
      if (!transaction.docChanged) {
        if (treeChanged) {
          return createMermaidPreviewState(
            transaction.state,
            focused,
            labels,
            renderMermaid,
          );
        }
        const revealChanged =
          revealedMermaidBlocksKey(
            transaction.startState,
            previous.focused,
            previous.blocks,
          ) !== revealedMermaidBlocksKey(
            transaction.state,
            focused,
            previous.blocks,
          );
        return {
          ...previous,
          decorations: revealChanged
            ? mermaidPreviewDecorationsFromBlocks(
                transaction.state,
                focused,
                previous.blocks,
                labels,
                renderMermaid,
              )
            : previous.decorations,
          focused,
        };
      }

      if (
        treeChanged ||
        changesTouchMermaidBlocks(transaction, previous.blocks) ||
        changesMayAffectMermaidFences(transaction)
      ) {
        return createMermaidPreviewState(
          transaction.state,
          focused,
          labels,
          renderMermaid,
        );
      }

      const blocks = mapMermaidPreviewBlocks(previous.blocks, transaction);
      const revealChanged = revealedMermaidBlocksKey(
        transaction.startState,
        previous.focused,
        previous.blocks,
      ) !== revealedMermaidBlocksKey(
        transaction.state,
        focused,
        blocks,
      );
      return {
        blocks,
        decorations: revealChanged
          ? mermaidPreviewDecorationsFromBlocks(
              transaction.state,
              focused,
              blocks,
              labels,
              renderMermaid,
            )
          : previous.decorations.map(transaction.changes),
        focused,
      };
    },
    provide: (mermaidField) => Prec.highest(
      EditorView.decorations.from(
        mermaidField,
        (value) => value.decorations,
      ),
    ),
  });
  const mountedViews = new WeakSet<CodeMirrorView>();
  const lifecycle = ViewPlugin.define((view) => {
    mountedViews.add(view);
    return {
      destroy() {
        mountedViews.delete(view);
      },
    };
  });

  const syncFocusedState = (view: CodeMirrorView) => {
    // Focus events can fire inside toolbar and widget handlers that already
    // dispatch a transaction. Defer this independent UI state update so it
    // cannot interrupt the originating command or its React subscribers.
    queueMicrotask(() => {
      if (!mountedViews.has(view)) return;
      const focused = view.hasFocus;
      const previewState = view.state.field(field, false);
      if (!previewState || previewState.focused === focused) return;
      view.dispatch({ effects: setMermaidPreviewFocusedEffect.of(focused) });
    });
  };

  return [
    field,
    lifecycle,
    EditorView.domEventHandlers({
      blur(_event, view) {
        syncFocusedState(view);
      },
      focus(_event, view) {
        syncFocusedState(view);
      },
    }),
  ];
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

function fencedCodeAtPosition(state: EditorState, position: number) {
  let node: ReturnType<typeof syntaxTree>["topNode"] | null =
    syntaxTree(state).resolveInner(position, -1);
  while (node) {
    if (node.name === "FencedCode") return node as MarkraSyntaxNode;
    node = node.parent;
  }
  return null;
}

function fencedCodeStartingAt(state: EditorState, from: number) {
  const position = Math.min(state.doc.length, from + 1);
  const node = fencedCodeAtPosition(state, position);
  return node?.from === from ? node : null;
}

interface HoveredCodeBlockState {
  readonly decorations: DecorationSet;
  readonly from: number | null;
}

// Keep hover block-scoped in editor state: a container-level CSS hover would
// reveal every code toolbar, while this line decoration leaves CM geometry alone.
const setHoveredCodeBlockEffect = StateEffect.define<number | null>({
  map(value, changes) {
    return value === null ? null : changes.mapPos(value, 1);
  },
});

function hoveredCodeBlockState(
  state: EditorState,
  from: number | null,
): HoveredCodeBlockState {
  if (from === null) {
    return { decorations: Decoration.none, from: null };
  }
  const node = fencedCodeStartingAt(state, from);
  if (!node) return { decorations: Decoration.none, from: null };
  const firstLine = state.doc.lineAt(node.from);
  return {
    decorations: Decoration.set([
      Decoration.line({
        attributes: { "data-code-block-hovered": "true" },
      }).range(firstLine.from),
    ]),
    from: node.from,
  };
}

const hoveredCodeBlockField = StateField.define<HoveredCodeBlockState>({
  create(state) {
    return hoveredCodeBlockState(state, null);
  },
  update(previous, transaction) {
    let from = transaction.docChanged && previous.from !== null
      ? transaction.changes.mapPos(previous.from, 1)
      : previous.from;
    for (const effect of transaction.effects) {
      if (effect.is(setHoveredCodeBlockEffect)) from = effect.value;
    }
    if (
      !transaction.docChanged &&
      !syntaxTreeChanged(transaction.startState, transaction.state) &&
      from === previous.from
    ) return previous;
    return hoveredCodeBlockState(transaction.state, from);
  },
  provide: (field) => EditorView.decorations.from(
    field,
    (value) => value.decorations,
  ),
});

function fencedCodeAt(view: CodeMirrorView) {
  return fencedCodeAtPosition(
    view.state,
    view.state.selection.main.head,
  );
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

function unwrapCodeBlockBackward(view: CodeMirrorView) {
  if (
    view.state.readOnly ||
    view.state.selection.ranges.some((selection) => !selection.empty)
  ) {
    return false;
  }

  const unwrapped = view.state.selection.ranges.map((selection) => {
    const node = fencedCodeAtPosition(view.state, selection.head);
    if (!node) return null;
    const parts = codeBlockParts(view.state, node);
    if (!parts.codeNode || selection.head !== parts.codeNode.from) return null;

    const openingLine = view.state.doc.lineAt(node.from);
    const firstCodeLine = view.state.doc.lineAt(parts.codeNode.from);
    const changes = [{
      from: openingLine.from,
      to: firstCodeLine.from,
    }];
    if (parts.hasClosingFence) {
      const closingLine = view.state.doc.lineAt(node.to);
      changes.push({
        // Delete the separator before the closing fence so unwrapping keeps
        // exactly the paragraph break that originally followed the block.
        from: closingLine.from - 1,
        to: closingLine.to,
      });
    }
    return { changes, cursor: openingLine.from };
  });
  if (unwrapped.some((candidate) => candidate === null)) return false;

  const codeBlocks = unwrapped.filter((candidate) => candidate !== null);
  const changeSet = view.state.changes(
    codeBlocks.flatMap((codeBlock) => codeBlock.changes),
  );

  view.dispatch({
    changes: changeSet,
    scrollIntoView: true,
    selection: EditorSelection.create(
      codeBlocks.map((codeBlock) =>
        EditorSelection.cursor(changeSet.mapPos(codeBlock.cursor, 1))
      ),
      view.state.selection.mainIndex,
    ),
    userEvent: "delete.backward",
  });
  view.focus();
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
    { key: "Backspace", run: unwrapCodeBlockBackward },
    { key: "Enter", run: handleCodeBlockEnter },
    { key: "Mod-a", run: selectCurrentCodeBlockContent },
    { key: "Escape", run: exitMermaidSource },
  ]),
);

function codeBlockFromPointer(
  event: MouseEvent,
  view: CodeMirrorView,
) {
  const target = event.target instanceof Element ? event.target : null;
  const rawFrom = target
    ?.closest<HTMLElement>("[data-code-block-from]")
    ?.dataset.codeBlockFrom;
  const targetFrom = rawFrom === undefined ? null : Number(rawFrom);
  if (
    targetFrom !== null &&
    Number.isInteger(targetFrom) &&
    fencedCodeStartingAt(view.state, targetFrom)
  ) {
    return targetFrom;
  }

  try {
    const position = view.posAtCoords({
      x: event.clientX,
      y: event.clientY,
    });
    return position === null
      ? null
      : fencedCodeAtPosition(view.state, position)?.from ?? null;
  } catch {
    return null;
  }
}

function syncHoveredCodeBlock(
  view: CodeMirrorView,
  from: number | null,
) {
  if (view.state.field(hoveredCodeBlockField).from === from) return;
  view.dispatch({ effects: setHoveredCodeBlockEffect.of(from) });
}

const codeBlockPointerHandlers = EditorView.domEventHandlers({
  mouseleave(_event, view) {
    syncHoveredCodeBlock(view, null);
    return false;
  },
  mousemove(event, view) {
    syncHoveredCodeBlock(view, codeBlockFromPointer(event, view));
    return false;
  },
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
  const showLineNumbers = options.showLineNumbers ?? true;
  const highlight = options.highlight ?? ((context: CodeBlockHighlightContext) =>
    highlightMarkraCode(context.language, context.code));
  const renderMermaid = options.renderMermaid ?? ((context: CodeBlockMermaidContext) =>
    renderMermaidToSvg(context.source, {
      idPrefix: "markra-codemirror-mermaid",
      theme: context.theme,
    }));
  const highlightCache: Array<{
    code: string;
    highlighted: readonly CodeBlockHighlightSpan[];
    language: string;
  }> = [];
  let cachedCodeCharacters = 0;
  const maxCachedCodeBlocks = 16;
  const maxCachedCodeCharacters = 1_000_000;

  const highlightsFor = (
    context: MarkraRendererContext,
    parts: CodeBlockParts,
  ) => {
    if (!parts.codeNode) return [];
    const cachedIndex = highlightCache.findIndex(
      (entry) =>
        entry.language === parts.language && entry.code === parts.code,
    );
    const cached = highlightCache[cachedIndex];
    if (cached) {
      highlightCache.splice(cachedIndex, 1);
      highlightCache.push(cached);
      return cached.highlighted;
    }

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

    // Edits outside a fenced block create a new EditorState while leaving its
    // source unchanged. Cache by the actual highlighter inputs so that common
    // typing does not synchronously re-highlight untouched blocks.
    highlightCache.push({
      code: parts.code,
      highlighted,
      language: parts.language,
    });
    cachedCodeCharacters += parts.code.length;
    while (
      highlightCache.length > maxCachedCodeBlocks ||
      cachedCodeCharacters > maxCachedCodeCharacters
    ) {
      const removed = highlightCache.shift();
      cachedCodeCharacters -= removed?.code.length ?? 0;
    }
    return highlighted;
  };

  return defineMarkraPlugin({
    id: "markra.code-block-preview",
    extension: [
      // Vertical margins and padding on editable lines are not part of
      // CodeMirror's height map in every WebView. State-field block widgets
      // are measured explicitly, so repeated blocks cannot accumulate a
      // pointer-to-caret offset.
      createMermaidPreviewField(labels, renderMermaid),
      createCodeBlockTopGapField(showLineNumbers),
      hoveredCodeBlockField,
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
            const codeBlockIdentity = {
              "data-code-block-from": String(node.from),
            };
            const lineNumberVisibility = {
              "data-code-line-numbers": String(showLineNumbers),
            };
            context.add(
              Decoration.line({
                attributes: codeContentLine
                  ? {
                      ...codeBlockIdentity,
                      ...lineNumberVisibility,
                      ...(showLineNumbers
                        ? { "data-code-line-number": String(codeLineNumber) }
                        : {}),
                    }
                  : roleClass === "cm-markra-code-closing-line"
                    ? {
                        ...codeBlockIdentity,
                        ...lineNumberVisibility,
                        "data-code-block-active": String(revealed),
                        "data-code-block-end": String(node.to),
                      }
                    : codeBlockIdentity,
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
              }).range(firstLine.from, firstLine.to),
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
