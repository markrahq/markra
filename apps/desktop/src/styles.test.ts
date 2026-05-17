import { readFileSync } from "node:fs";

describe("editor stylesheet", () => {
  it("includes readable Markdown table styles", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain('@import "@milkdown/kit/prose/tables/style/tables.css"');
    expect(styles).toContain(".markdown-paper table");
    expect(styles).toContain(".markdown-paper th");
    expect(styles).toContain(".markdown-paper td");
    expect(styles).toContain(".markdown-paper tbody tr:nth-child(even)");
  });

  it("positions collapsible list controls", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const buttonStart = styles.indexOf(".markdown-paper .markra-list-toggle-button {");
    const buttonEnd = styles.indexOf(".markdown-paper .markra-list-toggle-item:hover");
    const buttonStyles = styles.slice(buttonStart, buttonEnd);

    expect(styles).toContain(".markdown-paper .markra-list-toggle-item");
    expect(buttonStyles).toContain("left: -2.2em");
    expect(buttonStyles).toContain("top: calc((1lh - 1rem) / 2);");
    expect(styles).toContain(".markdown-paper .markra-list-toggle-item:hover > .markra-list-toggle-button");
    expect(styles).toContain(".markdown-paper .markra-list-collapsed-content");
  });

  it("keeps table add controls hidden until table hover or focus", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const tableControlStart = styles.indexOf(".markdown-paper .markra-table-control {");
    const tableControlEnd = styles.indexOf(".markdown-paper .markra-table-add-column");
    const tableControlStyles = styles.slice(tableControlStart, tableControlEnd);

    expect(styles).toContain(".markdown-paper .markra-table-controls-wrapper");
    expect(styles).toContain("@apply relative overflow-visible pt-7 pr-9 pb-9");
    expect(styles).toContain(".markdown-paper .markra-table-control");
    expect(styles).toContain("opacity: 0");
    expect(styles).toContain(".markdown-paper .markra-table-controls-wrapper:hover .markra-table-control");
    expect(styles).toContain(".markdown-paper .markra-table-controls-wrapper:focus-within .markra-table-control");
    expect(styles).toContain(".markdown-paper .markra-table-add-column");
    expect(styles).toContain(".markdown-paper .markra-table-add-row");
    expect(styles).toContain(".markdown-paper .markra-table-align-controls");
    expect(styles).toContain(".markdown-paper .markra-table-size-controls");
    expect(styles).toContain(".markdown-paper .markra-table-size-button[aria-expanded=\"true\"]");
    expect(styles).toContain(".markdown-paper .markra-table-size-popover");
    expect(styles).toContain(".markdown-paper .markra-table-size-grid");
    expect(styles).toContain("grid-template-columns: repeat(8, 0.875rem)");
    expect(styles).toContain(".markdown-paper .markra-table-size-cell-active");
    expect(styles).toContain(".markdown-paper .markra-table-size-input");
    expect(styles).toContain(".markdown-paper .markra-table-align-button[aria-pressed=\"true\"]");
    expect(styles).toContain(".markdown-paper .markra-table-align-icon-left");
    expect(styles).toContain(".markdown-paper .markra-table-align-icon-center");
    expect(styles).toContain(".markdown-paper .markra-table-align-icon-right");
    expect(styles).toContain(".markdown-paper .markra-table-delete-control");
    expect(styles).toContain(".markdown-paper .markra-table-delete-column");
    expect(styles).toContain(".markdown-paper .markra-table-delete-row");
    expect(tableControlStyles).not.toContain("--accent");
  });

  it("lets AI insert previews inherit the current Markdown block typography", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(".markdown-paper .markra-ai-preview-insert");
    expect(styles).toContain("font-size: inherit");
    expect(styles).toContain("font-weight: inherit");
  });

  it("keeps AI selection holds from drawing connected borders across wrapped lines", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const selectionHoldStart = styles.indexOf(".markdown-paper .markra-ai-selection-hold {");
    const selectionHoldEnd = styles.indexOf(".markdown-paper .markra-ai-preview-widget");
    const selectionHoldStyles = styles.slice(selectionHoldStart, selectionHoldEnd);

    expect(selectionHoldStyles).toContain("box-decoration-break: clone");
    expect(selectionHoldStyles).toContain("-webkit-box-decoration-break: clone");
    expect(selectionHoldStyles).not.toContain("box-shadow");
  });

  it("styles finalized emphasis marks in the editor", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(".markdown-paper em");
    expect(styles).toContain("@apply italic");
    expect(styles).toContain("font-synthesis: style");
  });

  it("positions the native display math caret anchor at the formula block edge", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const anchorStart = styles.indexOf(".markdown-paper img.ProseMirror-separator.markra-math-caret-anchor {");
    const anchorEnd = styles.indexOf(".markdown-paper .markra-math-render-invalid");
    const anchorStyles = styles.slice(anchorStart, anchorEnd);

    expect(styles).toContain(".markdown-paper p:has(.markra-math-caret-anchor)");
    expect(anchorStyles).toContain("position: absolute");
    expect(anchorStyles).toContain("right: 0");
    expect(anchorStyles).toContain("width: 1px !important");
    expect(anchorStyles).not.toContain("opacity: 0");
  });

  it("keeps hidden display math source available for the native caret", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const sourceStart = styles.indexOf(".markdown-paper .markra-math-source-hidden-display.markra-md-hidden-delimiter {");
    const sourceEnd = styles.indexOf(".markdown-paper .markra-live-mark-strong");
    const sourceStyles = styles.slice(sourceStart, sourceEnd);

    expect(sourceStyles).toContain("display: inline-block");
    expect(sourceStyles).toContain("position: absolute");
    expect(sourceStyles).toContain("right: 0");
    expect(sourceStyles).toContain("-webkit-text-fill-color: transparent");
    expect(sourceStyles).not.toContain("@apply hidden");
  });

  it("keeps AI diff action controls visually quiet until interaction", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(".markdown-paper .markra-ai-preview-actions-quiet");
    expect(styles).toContain("opacity: 0.58");
    expect(styles).not.toContain("opacity-0");
    expect(styles).toContain(".markdown-paper .markra-ai-preview-widget:hover .markra-ai-preview-actions-quiet");
    expect(styles).toContain(".markdown-paper .markra-ai-preview-widget:focus-within .markra-ai-preview-actions-quiet");
  });

  it("keeps AI preview action controls above nearby Markdown content", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain("isolation: isolate");
    expect(styles).toContain("z-index: 30");
    expect(styles).toContain("z-index: 60");
  });

  it("reveals the code block language selector below the block without taking layout space", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const codeBlockStart = styles.indexOf(".markdown-paper .markra-code-block {");
    const codeBlockEnd = styles.indexOf(".markdown-paper .markra-code-language-control");
    const codeBlockStyles = styles.slice(codeBlockStart, codeBlockEnd);
    const languageControlStart = styles.indexOf(".markdown-paper .markra-code-language-control {");
    const languageControlEnd = styles.indexOf(".markdown-paper .markra-code-language-select");
    const languageControlStyles = styles.slice(languageControlStart, languageControlEnd);
    const languageRevealStart = styles.indexOf(".markdown-paper .markra-code-block:hover .markra-code-language-control");
    const languageRevealEnd = styles.indexOf(".markdown-paper .markra-code-language-select");
    const languageRevealStyles = styles.slice(languageRevealStart, languageRevealEnd);
    const languageSelectStart = styles.indexOf(".markdown-paper .markra-code-language-select {");
    const languageSelectEnd = styles.indexOf(".markdown-paper .markra-code-language-select:focus");
    const languageSelectStyles = styles.slice(languageSelectStart, languageSelectEnd);

    expect(codeBlockStyles).toContain("overflow-visible");
    expect(languageControlStyles).toContain("absolute");
    expect(languageControlStyles).toContain("top: 100%");
    expect(languageControlStyles).toContain("pt-1.5");
    expect(languageControlStyles).toContain("justify-end");
    expect(languageControlStyles).toContain("opacity: 0");
    expect(languageControlStyles).toContain("pointer-events: none");
    expect(languageControlStyles).not.toContain("border-t");
    expect(languageControlStyles).not.toContain("grid-column");
    expect(languageRevealStyles).not.toContain(":focus-within");
    expect(languageRevealStyles).toContain("opacity: 1");
    expect(languageRevealStyles).toContain("pointer-events: auto");
    expect(languageSelectStyles).toContain("border border-(--border-default)");
  });

  it("wraps code block lines instead of forcing horizontal scrolling", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const codeStart = styles.indexOf(".markdown-paper .markra-code-block code {");
    const codeEnd = styles.indexOf(".markdown-paper .hljs-keyword");
    const codeStyles = styles.slice(codeStart, codeEnd);

    expect(codeStyles).toContain("white-space: pre-wrap");
    expect(codeStyles).toContain("overflow-wrap: anywhere");
  });

  it("uses a richer palette for inline code and syntax highlights", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const inlineCodeStart = styles.indexOf(".markdown-paper code {");
    const inlineCodeEnd = styles.indexOf(".markdown-paper pre {");
    const inlineCodeStyles = styles.slice(inlineCodeStart, inlineCodeEnd);
    const preCodeStart = styles.indexOf(".markdown-paper pre code {");
    const preCodeEnd = styles.indexOf(".markdown-paper .markra-code-block");
    const preCodeStyles = styles.slice(preCodeStart, preCodeEnd);

    expect(inlineCodeStyles).toContain("color: oklch");
    expect(inlineCodeStyles).toContain("box-shadow");
    expect(preCodeStyles).toContain("color: inherit");
    expect(preCodeStyles).toContain("box-shadow: none");
    expect(styles).toContain(".markdown-paper .hljs-meta");
    expect(styles).toContain(".markdown-paper .hljs-symbol");
    expect(styles).toContain(".markdown-paper .hljs-type");
  });

  it("defines Typora-style editor themes and code block copy controls", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const paperStart = styles.indexOf(".markdown-paper {");
    const githubStart = styles.indexOf(".markdown-paper[data-editor-theme=\"github\"]");
    const paperStyles = styles.slice(paperStart, githubStart);

    for (const theme of [
      "github",
      "gothic",
      "newsprint",
      "night",
      "pixyll",
      "whitey",
      "sepia",
      "solarized-light",
      "solarized-dark",
      "nord",
      "catppuccin-latte",
      "catppuccin-mocha",
      "academic",
      "minimal",
      "custom"
    ]) {
      expect(styles).toContain(`.markdown-paper[data-editor-theme="${theme}"]`);
    }

    expect(paperStyles).not.toContain("background: var(--editor-paper-bg)");
    expect(styles).toContain(".markdown-paper[data-editor-theme=\"dark\"]");
    expect(styles).toContain(".markdown-paper[data-editor-theme=\"night\"]");
    expect(styles).not.toContain(".markdown-paper[data-editor-theme=\"night\"] .ProseMirror");
    expect(styles).toContain("[data-theme=\"newsprint\"]");
    expect(styles).toContain("[data-theme=\"night\"]");
    expect(styles).toContain("[data-theme=\"solarized-light\"]");
    expect(styles).toContain("[data-theme=\"solarized-dark\"]");
    expect(styles).toContain("[data-theme=\"catppuccin-mocha\"]");
    expect(styles).toContain(".markdown-paper .markra-code-copy-button");
    expect(styles).toContain(".markdown-paper .markra-code-block:hover .markra-code-copy-button");
    expect(styles).toContain(".markdown-paper .markra-code-block:focus-within .markra-code-copy-button");
    expect(styles).toContain(".markdown-paper .markra-code-copy-button[data-copied=\"true\"] .markra-code-copy-icon");
    expect(styles).toContain(".markdown-paper .markra-code-copy-button[data-copied=\"true\"] .markra-code-copy-check-icon");
  });

  it("keeps the GitHub theme aligned with Primer light Markdown colors", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const appThemeStart = styles.indexOf("[data-theme=\"github\"] {");
    const appThemeEnd = styles.indexOf("[data-theme=\"gothic\"] {");
    const appThemeStyles = styles.slice(appThemeStart, appThemeEnd);
    const editorThemeStart = styles.indexOf(".markdown-paper[data-editor-theme=\"github\"] {");
    const editorThemeEnd = styles.indexOf(":root:not([data-theme=\"dark\"]) .markdown-paper[data-editor-theme=\"gothic\"] {");
    const editorThemeStyles = styles.slice(editorThemeStart, editorThemeEnd);

    expect(appThemeStyles).toContain("--bg-primary: #ffffff;");
    expect(appThemeStyles).toContain("--bg-secondary: #f6f8fa;");
    expect(appThemeStyles).toContain("--text-primary: #1f2328;");
    expect(appThemeStyles).toContain("--text-secondary: #59636e;");
    expect(appThemeStyles).toContain("--border-default: #d1d9e0;");
    expect(appThemeStyles).toContain("--accent: #0969da;");
    expect(editorThemeStyles).toContain("--editor-paper-bg: #ffffff;");
    expect(editorThemeStyles).toContain("--editor-inline-code-bg: rgba(175, 184, 193, 0.2);");
    expect(editorThemeStyles).toContain("--editor-code-bg: #f6f8fa;");
    expect(editorThemeStyles).toContain("--editor-hl-keyword: #cf222e;");
    expect(editorThemeStyles).toContain("--editor-hl-string: #0a3069;");
    expect(editorThemeStyles).toContain("--editor-hl-number: #0550ae;");
    expect(editorThemeStyles).toContain("--editor-hl-title: #8250df;");
    expect(editorThemeStyles).toContain("--editor-hl-type: #116329;");
  });

  it("includes the inline AI loading shimmer used by compact quick actions", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain("@keyframes markra-ai-inline-shimmer");
    expect(styles).toContain(".ai-command-inline-loading-text");
    expect(styles).toContain(".ai-command-inline-loading-text::after");
  });

  it("draws the running AI agent composer border with a pseudo element", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(".ai-agent-composer-running::before");
    expect(styles).toContain("animation: markra-ai-agent-border-run");
    expect(styles).toContain("mask-composite: exclude");
  });

  it("keeps editor links selectable without generated drag artifacts", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain("--link-color: #2f56c6;");
    expect(styles).toContain("--link-color: #b7c5ff;");
    expect(styles).toContain("--editor-link-color: var(--link-color);");
    expect(styles).toContain(".markdown-source-token-link");
    expect(styles).toContain("color: var(--link-color);");
    expect(styles).toContain(".markdown-paper a[href]::after");
    expect(styles).toContain(".markdown-paper .markra-live-link-label::after");
    expect(styles).toContain("content: none !important");
    expect(styles).toContain(".markdown-paper .markra-live-link-icon::before");
    expect(styles).toContain("content: \"↗\"");
    expect(styles).toContain(".markdown-paper .markra-live-link-icon + .markra-live-link-icon");
    expect(styles).toContain("-webkit-user-drag: none");
    expect(styles).toContain("user-select: text");
    expect(styles).toContain("@apply cursor-text text-(--editor-link-color) underline underline-offset-2");
    expect(styles).toContain(".markdown-paper .ProseMirror.markra-link-open-modifier-active a");
    expect(styles).toContain(".markdown-paper .ProseMirror.markra-link-open-modifier-active .markra-live-link-label");
    expect(styles).toContain("cursor: pointer");
  });
});
