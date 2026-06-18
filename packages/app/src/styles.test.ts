import { readFileSync } from "node:fs";

describe("editor stylesheet", () => {
  it("includes the shared app source files in Tailwind generation", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain('@source "."');
    expect(styles).toContain('@source "../../../packages/ui/src"');
  });

  it("uses theme-aware custom text cursors for visual editor text surfaces", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain("--editor-text-cursor:");
    expect(styles).toContain(".markdown-paper .ProseMirror");
    expect(styles).toContain(".markdown-paper[data-editor-theme=\"solarized-dark\"]");
    expect(styles).toContain("cursor: var(--editor-text-cursor)");
    expect(styles).toContain("%231a1c1e");
    expect(styles).toContain("%23ffffff");
    expect(styles).not.toContain(".markdown-source-input");
  });

  it("applies selected visual editor fonts to the editable ProseMirror surface", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const surfaceRuleStart = styles.indexOf(".markdown-paper [data-milkdown-root],");
    const surfaceRuleEnd = styles.indexOf(".markdown-paper .ProseMirror li", surfaceRuleStart);
    const surfaceRule = styles.slice(surfaceRuleStart, surfaceRuleEnd);

    expect(surfaceRuleStart).toBeGreaterThanOrEqual(0);
    expect(surfaceRuleEnd).toBeGreaterThan(surfaceRuleStart);
    expect(surfaceRule).toContain("font-family: var(--editor-font-family);");
  });

  it("forces a grabbing cursor during document tab pointer drags", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain('html[data-document-tab-dragging="true"]');
    expect(styles).toContain('html[data-document-tab-dragging="true"] *');
    expect(styles).toContain("cursor: grabbing !important");
    expect(styles).toContain("user-select: none");
  });

  it("includes readable Markdown table styles", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain('@import "@milkdown/kit/prose/tables/style/tables.css"');
    expect(styles).toContain(".markdown-paper table");
    expect(styles).toContain(".markdown-paper th");
    expect(styles).toContain(".markdown-paper td");
    expect(styles).toContain("background: var(--editor-bg-secondary)");
    expect(styles).toContain("color: var(--editor-text-heading)");
    expect(styles).toContain(".markdown-paper tbody tr:nth-child(even) td");
    expect(styles).toContain(".markdown-paper tbody tr:first-child:has(th) ~ tr:nth-child(even) td");
    expect(styles).toContain(".markdown-paper tbody tr:first-child:has(th) ~ tr:nth-child(odd) td");
  });

  it("uses app-themed custom scrollbars across scroll containers", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain("--scrollbar-thumb: color-mix");
    expect(styles).toContain("scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track)");
    expect(styles).toContain("scrollbar-width: thin");
    expect(styles).toContain("*::-webkit-scrollbar");
    expect(styles).toContain("width: 10px");
    expect(styles).toContain("height: 10px");
    expect(styles).toContain("*::-webkit-scrollbar-corner");
    expect(styles).toContain("*::-webkit-scrollbar-button");
    expect(styles).toContain("display: none");
    expect(styles).toContain("background-clip: content-box");
  });

  it("keeps primary editor headings free of divider underlines", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const headingStart = styles.indexOf(".markdown-paper h1 {");
    const headingEnd = styles.indexOf(".markdown-paper h3 {");
    const headingStyles = styles.slice(headingStart, headingEnd);

    expect(headingStart).toBeGreaterThanOrEqual(0);
    expect(headingEnd).toBeGreaterThan(headingStart);
    expect(headingStyles).not.toContain("border-b");
    expect(headingStyles).not.toContain("border-color: var(--editor-border)");
    expect(headingStyles).toContain("text-[44px]");
    expect(headingStyles).toContain("text-[31px]");
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

  it("uses distinct unordered list markers for nested editor lists", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(".markdown-paper ul ul {");
    expect(styles).toContain("list-style-type: circle;");
    expect(styles).toContain(".markdown-paper ul ul ul {");
    expect(styles).toContain("list-style-type: square;");
  });

  it("shows a quiet inline level list control for the active rendered heading", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const labelStart = styles.indexOf(".markdown-paper .markra-heading-level-control {");
    const labelEnd = styles.indexOf(".markdown-paper .markra-heading-toggle-heading");
    const labelStyles = styles.slice(labelStart, labelEnd);

    expect(labelStart).toBeGreaterThanOrEqual(0);
    expect(labelEnd).toBeGreaterThan(labelStart);
    expect(labelStyles).toContain("position: relative");
    expect(labelStyles).toContain("display: inline-grid");
    expect(labelStyles).toContain("margin-right");
    expect(labelStyles).toContain(".markdown-paper .markra-heading-level-list");
    expect(labelStyles).toContain("[role=\"option\"]");
    expect(labelStyles).toContain(".markdown-paper .markra-heading-level-button::before");
    expect(labelStyles).not.toContain("left:");
    expect(labelStyles).toContain("color: color-mix");
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
    expect(styles).toContain(".markra-table-size-popover");
    expect(styles).toContain(".markra-table-size-grid");
    expect(styles).toContain("grid-template-columns: repeat(8, 0.875rem)");
    expect(styles).toContain(".markra-table-size-cell-active");
    expect(styles).toContain(".markra-table-size-input");
    expect(styles).toContain(".markdown-paper .markra-table-align-button[aria-pressed=\"true\"]");
    expect(styles).toContain(".markdown-paper .markra-table-align-icon-left");
    expect(styles).toContain(".markdown-paper .markra-table-align-icon-center");
    expect(styles).toContain(".markdown-paper .markra-table-align-icon-right");
    expect(styles).toContain(".markdown-paper .markra-table-delete-control");
    expect(styles).toContain(".markdown-paper .markra-table-delete-column");
    expect(styles).toContain(".markdown-paper .markra-table-delete-row");
    expect(tableControlStyles).not.toContain("--accent");
  });

  it("draws finalized image selection with the editor default selected-node color", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const imageSelectionStart = styles.indexOf(
      ".markdown-paper .markra-image-node.markra-image-node-selected"
    );
    const imageSelectionEnd = styles.indexOf(".markdown-paper .markra-image-node-source-row");
    const imageSelectionStyles = styles.slice(imageSelectionStart, imageSelectionEnd);

    expect(imageSelectionStart).toBeGreaterThanOrEqual(0);
    expect(imageSelectionEnd).toBeGreaterThan(imageSelectionStart);
    expect(imageSelectionStyles).toContain(".markdown-paper .markra-image-node.ProseMirror-selectednode");
    expect(imageSelectionStyles).toContain("outline:");
    expect(imageSelectionStyles).toContain("#8cf");
    expect(imageSelectionStyles).not.toContain("var(--accent)");
    expect(imageSelectionStyles).toContain("outline-offset");
    expect(imageSelectionStyles).not.toContain("outline-none");
  });

  it("gives horizontal rules a forgiving hit target without heavy selected-node feedback", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const ruleStart = styles.indexOf(".markdown-paper hr {");
    const ruleEnd = styles.indexOf(".ai-chat-markdown", ruleStart);
    const ruleStyles = styles.slice(ruleStart, ruleEnd);

    expect(ruleStart).toBeGreaterThanOrEqual(0);
    expect(ruleEnd).toBeGreaterThan(ruleStart);
    expect(ruleStyles).toContain("height:");
    expect(ruleStyles).toContain("cursor: pointer");
    expect(ruleStyles).toContain("background:");
    expect(ruleStyles).toContain(".markdown-paper hr:hover");
    expect(ruleStyles).toContain(".markdown-paper hr.ProseMirror-selectednode");
    expect(ruleStyles).toContain("outline: none");
    expect(ruleStyles).toContain("100% 2px");
  });

  it("suppresses editor selection chrome while document search is open", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const searchChromeStart = styles.indexOf(".editor-content-slot[data-document-search-open=\"true\"]");
    const searchChromeEnd = styles.indexOf(".ai-command-thinking-text");
    const searchChromeStyles = styles.slice(searchChromeStart, searchChromeEnd);

    expect(searchChromeStart).toBeGreaterThanOrEqual(0);
    expect(searchChromeEnd).toBeGreaterThan(searchChromeStart);
    expect(searchChromeStyles).toContain("caret-color: transparent");
    expect(searchChromeStyles).toContain(".markra-math-caret-anchor");
    expect(searchChromeStyles).toContain(".markra-image-node.markra-image-node-selected");
    expect(searchChromeStyles).toContain(".ProseMirror-selectednode");
    expect(searchChromeStyles).toContain(".markra-image-node-source-row");
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

  it("styles active display math as editable source with a preview", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const activeSourceStart = styles.indexOf(".markdown-paper .markra-math-source-active {");
    const activeSourceEnd = styles.indexOf(".markdown-paper .markra-math-token-delimiter");
    const activeSourceStyles = styles.slice(activeSourceStart, activeSourceEnd);
    const activeBreakStart = styles.indexOf('.markdown-paper .markra-math-source-active[data-type="hardbreak"] {');
    const activeBreakEnd = styles.indexOf(".markdown-paper .markra-math-token-delimiter");
    const activeBreakStyles = styles.slice(activeBreakStart, activeBreakEnd);

    expect(activeSourceStart).toBeGreaterThanOrEqual(0);
    expect(activeSourceEnd).toBeGreaterThan(activeSourceStart);
    expect(activeSourceStyles).toContain("ui-monospace");
    expect(activeSourceStyles).toContain("box-decoration-break: clone");
    expect(activeBreakStart).toBeGreaterThanOrEqual(0);
    expect(activeBreakEnd).toBeGreaterThan(activeBreakStart);
    expect(activeBreakStyles).toContain("font-size: inherit");
    expect(activeBreakStyles).toContain("line-height: inherit");
    expect(activeBreakStyles).not.toContain('content: "\\A"');
    expect(activeBreakStyles).not.toContain("display: block");
    expect(styles).toContain(".markdown-paper .markra-math-render-active-preview");
    expect(styles).toContain("margin-top");
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

  it("wraps code block lines by default", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const codeStart = styles.indexOf(".markdown-paper .markra-code-block code {");
    const codeEnd = styles.indexOf(".markdown-paper[data-code-block-wrap=\"false\"] .markra-code-block pre");
    const codeStyles = styles.slice(codeStart, codeEnd);

    expect(codeStyles).toContain("white-space: pre-wrap");
    expect(codeStyles).toContain("overflow-wrap: anywhere");
  });

  it("allows code block wrapping to be disabled", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const preStart = styles.indexOf(".markdown-paper[data-code-block-wrap=\"false\"] .markra-code-block pre");
    const preEnd = styles.indexOf(".markdown-paper[data-code-block-wrap=\"false\"] .markra-code-block code");
    const preStyles = styles.slice(preStart, preEnd);
    const codeStart = styles.indexOf(".markdown-paper[data-code-block-wrap=\"false\"] .markra-code-block code");
    const codeEnd = styles.indexOf(".markdown-paper .hljs-keyword");
    const codeStyles = styles.slice(codeStart, codeEnd);

    expect(preStart).toBeGreaterThanOrEqual(0);
    expect(preEnd).toBeGreaterThan(preStart);
    expect(preStyles).toContain("overflow-x: auto");
    expect(codeStart).toBeGreaterThanOrEqual(0);
    expect(codeEnd).toBeGreaterThan(codeStart);
    expect(codeStyles).toContain("white-space: pre");
    expect(codeStyles).toContain("overflow-wrap: normal");
  });

  it("folds Mermaid code source while showing the rendered preview", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const mermaidFoldStart = styles.indexOf(".markdown-paper .markra-code-block[data-mermaid-mode=\"preview\"]");
    const mermaidFoldEnd = styles.indexOf(".markdown-paper .markra-mermaid-render {");
    const mermaidFoldStyles = styles.slice(mermaidFoldStart, mermaidFoldEnd);
    const mermaidZoomRevealStart = styles.indexOf(
      ".markdown-paper .markra-code-block[data-mermaid-mode=\"preview\"]:hover .markra-mermaid-zoom-button"
    );
    const mermaidZoomRevealEnd = styles.indexOf(".markdown-paper .markra-mermaid-zoom-button:hover");
    const mermaidZoomRevealStyles = styles.slice(mermaidZoomRevealStart, mermaidZoomRevealEnd);
    const mermaidZoomHoverStart = styles.indexOf(".markdown-paper .markra-mermaid-zoom-button:hover");
    const mermaidZoomHoverEnd = styles.indexOf("\n  }\n", mermaidZoomHoverStart) + "\n  }\n".length;
    const mermaidZoomHoverStyles = styles.slice(mermaidZoomHoverStart, mermaidZoomHoverEnd);
    const mermaidZoomCloseHoverStart = styles.indexOf(".markra-mermaid-zoom-close-button:hover");
    const mermaidZoomCloseHoverEnd =
      styles.indexOf("\n  }\n", mermaidZoomCloseHoverStart) + "\n  }\n".length;
    const mermaidZoomCloseHoverStyles = styles.slice(mermaidZoomCloseHoverStart, mermaidZoomCloseHoverEnd);

    expect(mermaidFoldStyles).toContain(".markra-code-line-numbers");
    expect(mermaidFoldStyles).toContain("pre");
    expect(mermaidFoldStyles).toContain("display: none");
    expect(mermaidFoldStyles).toContain("background: transparent");
    expect(mermaidFoldStyles).toContain("border-color: transparent");
    expect(mermaidFoldStyles).toContain(".markra-code-language-control");
    expect(styles).toContain(".markdown-paper .markra-mermaid-preview-button");
    expect(styles).toContain(".markdown-paper .markra-mermaid-zoom-button");
    expect(mermaidZoomRevealStyles).not.toContain(":focus-within");
    expect(mermaidZoomRevealStyles).toContain("opacity: 1");
    expect(mermaidZoomRevealStyles).toContain("pointer-events: auto");
    expect(mermaidZoomHoverStyles).not.toContain(":focus-visible");
    expect(mermaidZoomHoverStyles).not.toContain("box-shadow");
    expect(mermaidZoomCloseHoverStyles).not.toContain(":focus-visible");
    expect(mermaidZoomCloseHoverStyles).not.toContain("box-shadow");
    expect(styles).toContain(".markra-mermaid-zoom-dialog");
    expect(styles).toContain(
      ".markdown-paper .markra-code-block[data-mermaid-mode=\"preview\"] .markra-mermaid-render"
    );
    expect(styles).toContain(".markdown-paper .markra-code-block[data-mermaid-mode=\"source\"] .markra-code-copy-button");
  });

  it("uses a richer palette for inline code and syntax highlights", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const inlineCodeStart = styles.indexOf(".markdown-paper code {");
    const inlineCodeEnd = styles.indexOf(".markdown-paper pre {");
    const inlineCodeStyles = styles.slice(inlineCodeStart, inlineCodeEnd);
    const preCodeStart = styles.indexOf(".markdown-paper pre code {");
    const preCodeEnd = styles.indexOf(".markdown-paper .markra-code-block");
    const preCodeStyles = styles.slice(preCodeStart, preCodeEnd);
    const activeInlineCodeStart = styles.indexOf(".markdown-paper code .markra-live-mark-inlineCode {");
    const activeInlineCodeEnd = styles.indexOf(".markdown-paper .markra-ai-preview-delete");
    const activeInlineCodeStyles = styles.slice(activeInlineCodeStart, activeInlineCodeEnd);

    expect(inlineCodeStyles).toContain("color: oklch");
    expect(inlineCodeStyles).toContain("box-shadow");
    expect(activeInlineCodeStyles).toContain("background: transparent");
    expect(activeInlineCodeStyles).toContain("box-shadow: none");
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
      "github-dark",
      "one-dark",
      "one-light",
      "one-dark-pro",
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
    expect(styles).toContain("[data-theme=\"github-dark\"]");
    expect(styles).toContain("[data-theme=\"one-dark\"]");
    expect(styles).toContain("[data-theme=\"one-light\"]");
    expect(styles).toContain("[data-theme=\"one-dark-pro\"]");
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

  it("keeps GitHub Dark and One themes aligned with their source palettes", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const githubDarkStart = styles.indexOf("[data-theme=\"github-dark\"] {");
    const oneDarkStart = styles.indexOf("[data-theme=\"one-dark\"] {");
    const oneLightStart = styles.indexOf("[data-theme=\"one-light\"] {");
    const oneDarkProStart = styles.indexOf("[data-theme=\"one-dark-pro\"] {");
    const gothicStart = styles.indexOf("[data-theme=\"gothic\"] {");

    expect(githubDarkStart).toBeGreaterThanOrEqual(0);
    expect(oneDarkStart).toBeGreaterThan(githubDarkStart);
    expect(oneLightStart).toBeGreaterThan(oneDarkStart);
    expect(oneDarkProStart).toBeGreaterThan(oneLightStart);
    expect(gothicStart).toBeGreaterThan(oneDarkProStart);

    const githubDarkStyles = styles.slice(githubDarkStart, oneDarkStart);
    const oneDarkStyles = styles.slice(oneDarkStart, oneLightStart);
    const oneLightStyles = styles.slice(oneLightStart, oneDarkProStart);
    const oneDarkProStyles = styles.slice(oneDarkProStart, gothicStart);

    expect(githubDarkStyles).toContain("--bg-primary: #0d1117;");
    expect(githubDarkStyles).toContain("--text-primary: #e6edf3;");
    expect(githubDarkStyles).toContain("--accent: #2f81f7;");
    expect(oneDarkStyles).toContain("--bg-primary: #282c34;");
    expect(oneDarkStyles).toContain("--text-primary: #abb2bf;");
    expect(oneDarkStyles).toContain("--accent: #61afef;");
    expect(oneLightStyles).toContain("--bg-primary: #fafafa;");
    expect(oneLightStyles).toContain("--text-primary: #383a42;");
    expect(oneLightStyles).toContain("--accent: #4078f2;");
    expect(oneDarkProStyles).toContain("--bg-primary: #282c34;");
    expect(oneDarkProStyles).toContain("--text-primary: #abb2bf;");
    expect(oneDarkProStyles).toContain("--accent: #61afef;");
  });

  it("includes the inline AI loading shimmer used by compact quick actions", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain("@keyframes markra-ai-inline-shimmer");
    expect(styles).toContain(".ai-command-inline-loading-text");
    expect(styles).toContain(".ai-command-inline-loading-text::after");
  });

  it("includes the document history panel entrance animation", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain("@keyframes markra-history-panel-in");
    expect(styles).toContain("translateY(-4px)");
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
    expect(styles).toContain("color: var(--link-color);");
    expect(styles).toContain(".markdown-paper a[href]::after");
    expect(styles).toContain(".markdown-paper .markra-live-link-label::after");
    expect(styles).toContain("content: none !important");
    expect(styles).toContain(".markdown-paper .markra-live-link-icon::before");
    expect(styles).toContain("content: \"↗\"");
    expect(styles).toContain(".markdown-paper .markra-live-link-icon + .markra-live-link-icon");
    expect(styles).toContain("-webkit-user-drag: none");
    expect(styles).toContain("user-select: text");
    expect(styles).toContain("cursor: var(--editor-text-cursor)");
    expect(styles).toContain(".markdown-paper .ProseMirror.markra-link-open-modifier-active a");
    expect(styles).toContain(".markdown-paper .ProseMirror.markra-link-open-modifier-active .markra-live-link-label");
    expect(styles).toContain("cursor: pointer");
  });
});
