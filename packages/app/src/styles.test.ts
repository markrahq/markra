import { readFileSync } from "node:fs";

describe("editor stylesheet", () => {
  it("includes the shared app source files in Tailwind generation", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain('@source "."');
    expect(styles).toContain('@source "../../../packages/ui/src"');
  });

  it("uses the bundled UI font for app chrome and default editor themes", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain('@import "@fontsource-variable/noto-sans-sc/wght.css";');
    expect(styles).toContain('--font-ui: "Noto Sans SC Variable"');
    expect(styles).toContain("font-family: var(--font-ui);");
    expect(styles).toContain("--editor-font-family: var(--font-ui);");
  });

  it("uses theme-aware custom text cursors for visual editor text surfaces", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain("--editor-text-cursor:");
    expect(styles).toContain(".markdown-paper .cm-editor");
    expect(styles).toContain(".markdown-paper[data-editor-theme=\"solarized-dark\"]");
    expect(styles).toContain("cursor: var(--editor-text-cursor)");
    expect(styles).toContain("%231a1c1e");
    expect(styles).toContain("%23ffffff");
    expect(styles).not.toContain(".markdown-source-input");
  });

  it("applies selected visual editor fonts to the editable CodeMirror surface", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const surfaceRuleStart = styles.indexOf(".markdown-paper .cm-editor {");
    const surfaceRuleEnd = styles.indexOf(".markdown-paper .cm-content {", surfaceRuleStart);
    const surfaceRule = styles.slice(surfaceRuleStart, surfaceRuleEnd);

    expect(surfaceRuleStart).toBeGreaterThanOrEqual(0);
    expect(surfaceRuleEnd).toBeGreaterThan(surfaceRuleStart);
    expect(surfaceRule).toContain("font-family: var(--editor-font-family);");
  });

  it("maps Markra document typography onto CodeMirror without styling its widget buffers as content images", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(".markdown-paper img:not(.cm-widgetBuffer)");
    expect(styles).toContain(".markdown-paper .cm-widgetBuffer");
    expect(styles).toContain("margin: 0 !important");
    expect(styles).toContain(".markdown-paper .cm-line.cm-markra-h1");
    expect(styles).toContain("font-size: 44px");
    expect(styles).toContain(".markdown-paper .cm-line.cm-markra-h2");
    expect(styles).toContain("font-size: 31px");
    expect(styles).toContain(".markdown-paper .cm-line.cm-markra-h3");
    expect(styles).toContain("font-size: 24px");
    expect(styles).toContain(".markdown-paper .cm-line.cm-markra-empty-line");
    expect(styles).toContain(".markdown-paper .cm-line.cm-markra-list-item");
    expect(styles).toContain('[data-markra-list-source="hidden"]::before');
    expect(styles).toContain('content: "" !important');
    expect(styles).toContain("opacity: 0 !important");
  });

  it("exposes shared per-level heading theme tokens for CodeMirror and rendered headings", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const headingDefaults = [
      { fontSize: "44px", level: 1, lineHeight: "1.15" },
      { fontSize: "31px", level: 2, lineHeight: "1.22" },
      { fontSize: "24px", level: 3, lineHeight: "1.28" },
      { fontSize: "19px", level: 4, lineHeight: "1.35" },
      { fontSize: "16px", level: 5, lineHeight: "1.45" },
      { fontSize: "16px", level: 6, lineHeight: "1.45" }
    ];

    expect(styles).toContain("--editor-heading-font-weight: 760;");
    expect(styles).toContain("--editor-heading-letter-spacing: 0;");
    expect(styles).toContain("--editor-h1-font-size-compact: 34px;");
    expect(styles).toContain("--editor-h2-font-size-compact: 26px;");

    for (const { fontSize, level, lineHeight } of headingDefaults) {
      const colorVariable = `--editor-h${level}-color`;
      const fontSizeVariable = `--editor-h${level}-font-size`;
      const fontWeightVariable = `--editor-h${level}-font-weight`;
      const lineHeightVariable = `--editor-h${level}-line-height`;

      expect(styles).toContain(`${colorVariable}: var(--editor-text-heading);`);
      expect(styles).toContain(`${fontSizeVariable}: ${fontSize};`);
      expect(styles).toContain(`${fontWeightVariable}: var(--editor-heading-font-weight);`);
      expect(styles).toContain(`${lineHeightVariable}: ${lineHeight};`);
      expect(styles).toContain(`color: var(${colorVariable}) !important;`);
      expect(styles).toContain(`font-size: var(${fontSizeVariable}) !important;`);
      expect(styles).toContain(`font-weight: var(${fontWeightVariable}) !important;`);
      expect(styles).toContain(`line-height: var(${lineHeightVariable}) !important;`);
      expect(styles).toContain(`color: var(${colorVariable});`);
      expect(styles).toContain(`font-size: var(${fontSizeVariable});`);
      expect(styles).toContain(`font-weight: var(${fontWeightVariable});`);
      expect(styles).toContain(`line-height: var(${lineHeightVariable});`);
    }
  });

  it("keeps CodeMirror's preview selection theme-aware and readable", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const selectionStart = styles.indexOf(
      ".markdown-paper .cm-selectionBackground {",
    );
    const selectionEnd = styles.indexOf("\n  }", selectionStart);
    const selectionRule = styles.slice(selectionStart, selectionEnd);

    expect(selectionStart).toBeGreaterThanOrEqual(0);
    expect(selectionRule).toContain(
      "background: color-mix(in srgb, var(--editor-caret-color, var(--accent)) 20%, transparent) !important;",
    );
  });

  it("keeps code block selections between the background and foreground", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const codeLineStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-code-content-line {",
    );
    const codeLineEnd = styles.indexOf("\n  }", codeLineStart);
    const codeLineRule = styles.slice(codeLineStart, codeLineEnd);
    const backdropStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-code-content-line::after {",
    );
    const backdropEnd = styles.indexOf("\n  }", backdropStart);
    const backdropRule = styles.slice(backdropStart, backdropEnd);
    const lineNumberStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-code-content-line[data-code-line-number]::before {",
    );
    const lineNumberEnd = styles.indexOf("\n  }", lineNumberStart);
    const lineNumberRule = styles.slice(lineNumberStart, lineNumberEnd);

    expect(styles).not.toContain(".markdown-paper .cm-selectionLayer {");
    expect(styles).not.toContain(".markdown-paper .cm-cursorLayer {");
    expect(codeLineRule).toContain("position: relative");
    expect(codeLineRule).toContain("background: transparent !important");
    expect(codeLineRule).toContain("padding-inline: 16px 16px !important");
    expect(codeLineRule).toContain("padding-block: 0 !important");
    expect(codeLineRule).toContain("text-indent: 0");
    expect(codeLineRule).toContain("line-height: 24px !important");
    expect(backdropStart).toBeGreaterThanOrEqual(0);
    expect(backdropRule).toContain("z-index: -2");
    expect(backdropRule).toContain("background: var(--editor-code-bg)");
    expect(lineNumberRule).toContain("position: relative");
    expect(lineNumberRule).toContain("z-index: 1");
    expect(lineNumberRule).toContain("border-left: 1px solid var(--editor-border)");
    expect(lineNumberRule).toContain("background: var(--editor-code-line-bg)");
    expect(lineNumberRule).not.toContain("border-right:");
    expect(lineNumberRule).not.toContain("box-shadow:");
  });

  it("removes code block gutter geometry when line numbers are hidden", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const ruleFor = (selector: string) => {
      const start = styles.indexOf(selector);
      const end = styles.indexOf("\n  }", start);

      expect(start).toBeGreaterThanOrEqual(0);
      return styles.slice(start, end);
    };
    const contentLineRule = ruleFor(
      ".markdown-paper .cm-line.cm-markra-code-content-line {",
    );
    const numberedContentLineRule = ruleFor(
      '.markdown-paper .cm-line.cm-markra-code-content-line[data-code-line-numbers="true"] {',
    );
    const contentBackdropRule = ruleFor(
      ".markdown-paper .cm-line.cm-markra-code-content-line::after {",
    );
    const numberedContentBackdropRule = ruleFor(
      '.markdown-paper .cm-line.cm-markra-code-content-line[data-code-line-numbers="true"]::after {',
    );
    const topGapRule = ruleFor(
      ".markdown-paper .cm-markra-code-top-gap {",
    );
    const numberedTopGapRule = ruleFor(
      '.markdown-paper .cm-markra-code-top-gap[data-code-line-numbers="true"] {',
    );
    const closingLineRule = ruleFor(
      ".markdown-paper .cm-line.cm-markra-code-closing-line {",
    );
    const numberedClosingLineRule = ruleFor(
      '.markdown-paper .cm-line.cm-markra-code-closing-line[data-code-line-numbers="true"] {',
    );

    expect(contentLineRule).toContain(
      "padding-inline: 16px 16px !important",
    );
    expect(contentLineRule).toContain("text-indent: 0");
    expect(numberedContentLineRule).toContain(
      "padding-inline: 59px 16px !important",
    );
    expect(numberedContentLineRule).toContain("text-indent: -59px");
    expect(contentBackdropRule).toContain(
      "background: var(--editor-code-bg)",
    );
    expect(numberedContentBackdropRule).toContain(
      "background: linear-gradient(",
    );
    expect(topGapRule).toContain("background: var(--editor-code-bg)");
    expect(numberedTopGapRule).toContain("background: linear-gradient(");
    expect(closingLineRule).toContain(
      "background: var(--editor-code-bg) !important",
    );
    expect(numberedClosingLineRule).toContain(
      "background: linear-gradient(",
    );
  });

  it("keeps the typewriter active-line highlight visible inside rich blocks", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const activeLineSelector =
      '.markdown-paper .cm-editor[data-typewriter-mode="true"].cm-focused\n' +
      "    .cm-line.cm-activeLine {";
    const codeHighlightSelector =
      '.markdown-paper .cm-editor[data-typewriter-mode="true"].cm-focused\n' +
      "    .cm-line.cm-activeLine.cm-markra-code-content-line::after {";
    const calloutHighlightSelector =
      '.markdown-paper .cm-editor[data-typewriter-mode="true"].cm-focused\n' +
      "    .cm-line.cm-activeLine.cm-markra-callout {";
    const activeLineStart = styles.indexOf(activeLineSelector);
    const activeLineEnd = styles.indexOf("\n  }", activeLineStart);
    const codeHighlightStart = styles.indexOf(codeHighlightSelector);
    const codeHighlightEnd = styles.indexOf("\n  }", codeHighlightStart);
    const calloutHighlightStart = styles.indexOf(calloutHighlightSelector);
    const calloutHighlightEnd = styles.indexOf(
      "\n  }",
      calloutHighlightStart,
    );
    const activeLineRule = styles.slice(activeLineStart, activeLineEnd);
    const codeHighlightRule = styles.slice(
      codeHighlightStart,
      codeHighlightEnd,
    );
    const calloutHighlightRule = styles.slice(
      calloutHighlightStart,
      calloutHighlightEnd,
    );

    expect(activeLineStart).toBeGreaterThanOrEqual(0);
    expect(activeLineRule).toContain("--typewriter-active-line-offset: 0px");
    expect(activeLineRule).toContain("currentColor 8%");
    expect(activeLineRule).toContain("/ 100% 1lh no-repeat");
    expect(codeHighlightStart).toBeGreaterThanOrEqual(0);
    expect(codeHighlightRule).toContain("background:");
    expect(codeHighlightRule).toContain("var(--typewriter-active-line-color)");
    expect(codeHighlightRule).toContain("var(--editor-code-bg)");
    expect(calloutHighlightStart).toBeGreaterThanOrEqual(0);
    expect(calloutHighlightRule).toContain("background:");
    expect(calloutHighlightRule).toContain(
      "var(--typewriter-active-line-color)",
    );
    expect(calloutHighlightRule).toContain("var(--callout-bg)");
  });

  it("aligns the typewriter highlight with text inside padded visual lines", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(
      ".cm-line.cm-markra-h1.cm-activeLine {\n" +
      "    --typewriter-active-line-offset: -8px;",
    );
    expect(styles).toContain(
      ".cm-line.cm-markra-h2.cm-activeLine {\n" +
      "    --typewriter-active-line-offset: 8px;",
    );
    expect(styles).toContain(
      ".cm-line.cm-markra-list-item.cm-activeLine {\n" +
      "    --typewriter-active-line-offset: 4px;",
    );
    expect(styles).toContain(
      ".cm-line.cm-activeLine.markra-callout-last {\n" +
      "    --typewriter-active-line-offset: -7px;",
    );
    expect(styles).toContain(
      ".cm-line.cm-activeLine.markra-callout-first.markra-callout-last {\n" +
      "    --typewriter-active-line-offset: 0px;",
    );
    expect(styles).not.toContain(
      ".cm-line.cm-markra-code-header-line +\n" +
      "    .cm-line.cm-activeLine.cm-markra-code-content-line {",
    );
    expect(styles).not.toContain(
      ".cm-line.cm-activeLine.cm-markra-code-content-line:has(+ .cm-markra-code-closing-line) {",
    );
  });

  it("progressively reveals themed code block controls without inserting a blank header line", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const headerLineStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-code-header-line {",
    );
    const headerLineEnd = styles.indexOf("\n  }", headerLineStart);
    const headerLineRule = styles.slice(headerLineStart, headerLineEnd);
    const headerWrapStart = styles.indexOf(
      ".markdown-paper .cm-markra-code-header-wrap {",
    );
    const headerWrapEnd = styles.indexOf("\n  }", headerWrapStart);
    const headerWrapRule = styles.slice(headerWrapStart, headerWrapEnd);
    const topGapStart = styles.indexOf(
      ".markdown-paper .cm-markra-code-top-gap {",
    );
    const topGapEnd = styles.indexOf("\n  }", topGapStart);
    const topGapRule = styles.slice(topGapStart, topGapEnd);
    const headerActionsStart = styles.indexOf(
      ".markdown-paper .cm-markra-code-header-actions {",
    );
    const headerActionsEnd = styles.indexOf("\n  }", headerActionsStart);
    const headerActionsRule = styles.slice(
      headerActionsStart,
      headerActionsEnd,
    );
    const hoveredHeaderSelector =
      '.markdown-paper .cm-line.cm-markra-code-header-line[data-code-block-hovered="true"]\n' +
      "    .cm-markra-code-header-actions,";
    const activeHeaderSelector =
      '.markdown-paper .cm-line.cm-markra-code-header-line[data-code-block-active="true"]';
    const focusedHeaderSelector =
      ".markdown-paper .cm-markra-code-header-actions:focus-within {";
    const closingLineStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-code-closing-line {",
    );
    const closingLineEnd = styles.indexOf("\n  }", closingLineStart);
    const closingLineRule = styles.slice(closingLineStart, closingLineEnd);
    const languageControlStart = styles.indexOf(
      ".markdown-paper .cm-markra-code-header-actions .markra-code-language-control {",
    );
    const languageControlEnd = styles.indexOf("\n  }", languageControlStart);
    const languageControlRule = styles.slice(
      languageControlStart,
      languageControlEnd,
    );
    const languageSelectStart = styles.indexOf(
      ".markdown-paper .cm-markra-code-header-actions .markra-code-language-select {",
    );
    const languageSelectEnd = styles.indexOf("\n  }", languageSelectStart);
    const languageSelectRule = styles.slice(
      languageSelectStart,
      languageSelectEnd,
    );
    const languageSelectFocusStart = styles.indexOf(
      ".markdown-paper .markra-code-language-select:focus {",
    );
    const languageSelectFocusEnd = styles.indexOf(
      "\n  }",
      languageSelectFocusStart,
    );
    const languageSelectFocusRule = styles.slice(
      languageSelectFocusStart,
      languageSelectFocusEnd,
    );
    const copyButtonStart = styles.indexOf(
      ".markdown-paper .cm-markra-code-header-actions .markra-code-copy-button {",
    );
    const copyButtonEnd = styles.indexOf("\n  }", copyButtonStart);
    const copyButtonRule = styles.slice(copyButtonStart, copyButtonEnd);
    const firstContentLineStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-code-header-line +\n" +
      "    .cm-line.cm-markra-code-content-line {",
    );
    const firstContentLineEnd = styles.indexOf(
      "\n  }",
      firstContentLineStart,
    );
    const firstContentLineRule = styles.slice(
      firstContentLineStart,
      firstContentLineEnd,
    );
    const firstContentBackdropStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-code-header-line +\n" +
      "    .cm-line.cm-markra-code-content-line::after {",
    );
    const lastContentBackdropStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-code-content-line:has(+ .cm-markra-code-closing-line)::after {",
    );

    expect(headerLineStart).toBeGreaterThanOrEqual(0);
    expect(headerLineRule).toContain("height: 0 !important");
    expect(headerLineRule).toContain("min-height: 0 !important");
    expect(headerLineRule).toContain(
      "--markra-block-toolbar-block-offset: 12px;",
    );
    expect(headerLineRule).toContain("margin-block: 0 !important");
    expect(headerLineRule).not.toContain("margin-block-start: 8px");
    expect(headerLineRule).toContain("border: 0 !important");
    expect(headerLineRule).toContain("background: transparent !important");
    expect(headerWrapRule).toContain("height: 0 !important");
    expect(topGapStart).toBeGreaterThanOrEqual(0);
    expect(topGapRule).toContain("height: 12px !important");
    expect(topGapRule).toContain("margin: 0 !important");
    expect(topGapRule).toContain("pointer-events: none");
    expect(topGapRule).toContain(
      "border-top: 1px solid var(--editor-border)",
    );
    expect(topGapRule).toContain("border-radius: 4px 4px 0 0");
    expect(topGapRule).toContain("background: var(--editor-code-bg)");
    expect(headerActionsRule).toContain("opacity: 0 !important");
    expect(headerActionsRule).toContain("pointer-events: none !important");
    expect(headerActionsRule).toContain("transform: translateY(-2px)");
    expect(headerActionsRule).toContain("top: 0");
    expect(styles).toContain(hoveredHeaderSelector);
    expect(styles).not.toContain(activeHeaderSelector);
    expect(styles).toContain(focusedHeaderSelector);
    expect(closingLineRule).toContain("position: relative");
    expect(closingLineRule).toContain("height: 12px");
    expect(closingLineRule).toContain("min-height: 12px");
    expect(languageControlStart).toBeGreaterThanOrEqual(0);
    expect(languageControlRule).toContain("position: relative");
    expect(languageControlRule).toContain("padding: 0");
    expect(languageControlRule).toContain("opacity: 1 !important");
    expect(languageControlRule).toContain("pointer-events: auto !important");
    expect(languageSelectRule).toContain("width: 160px !important");
    expect(languageSelectRule).toContain("height: 24px !important");
    expect(languageSelectRule).toContain("min-height: 24px !important");
    expect(languageSelectRule).toContain("appearance: none");
    expect(languageSelectRule).toContain("-webkit-appearance: none");
    expect(languageSelectRule).toContain("text-align: center");
    expect(languageSelectRule).toContain("text-align-last: center");
    expect(languageSelectFocusRule).toContain(
      "background: var(--editor-code-control-bg)",
    );
    expect(languageSelectFocusRule).toContain(
      "color: var(--editor-text-primary)",
    );
    expect(copyButtonRule).toContain("width: 24px !important");
    expect(copyButtonRule).toContain("height: 24px !important");
    expect(firstContentLineStart).toBeGreaterThanOrEqual(0);
    expect(firstContentLineRule).not.toContain("padding-block");
    expect(firstContentLineRule).toContain(
      "padding-inline-end: 220px !important",
    );
    expect(firstContentBackdropStart).toBe(-1);
    expect(lastContentBackdropStart).toBe(-1);
    expect(closingLineRule).toContain(
      "border-bottom: 1px solid var(--editor-border)",
    );
    expect(closingLineRule).toContain("border-radius: 0 0 4px 4px");
    expect(closingLineRule).toContain(
      "background: var(--editor-code-bg) !important",
    );
    expect(styles).toContain(
      "--editor-code-control-bg: color-mix(in srgb, var(--editor-code-bg)",
    );
    expect(styles).not.toContain(
      ".markdown-paper .cm-line.cm-markra-code-content-line:has(+ .cm-markra-code-closing-line) {\n" +
      "    padding-block-end:",
    );
    expect(styles).not.toContain(
      ".markdown-paper .cm-line.cm-markra-code-closing-line .markra-code-language-control {",
    );
  });

  it("keeps hidden Markdown empty lines available for pointer hit testing", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const emptyLineBreakRule = [
      '.markdown-paper .cm-line.cm-markra-empty-line[data-markra-empty-source="hidden"] > br {',
      "    display: none;",
      "  }",
    ].join("\n");

    expect(styles).not.toContain(emptyLineBreakRule);
  });

  it("keeps paragraph spacing separate from authored blank lines", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).not.toContain(
      ".markdown-paper .cm-line.cm-markra-empty-line {",
    );
    expect(styles).toContain(
      ".markdown-paper .cm-line.cm-markra-paragraph-end {",
    );
    expect(styles).toContain(
      "padding-block-end: var(--editor-paragraph-spacing) !important;",
    );
    expect(styles).not.toContain("cm-markra-paragraph-separator");
    expect(styles).not.toContain(
      '.cm-markra-empty-line[data-markra-empty-source="hidden"] {',
    );
  });

  it("keeps CodeMirror block rhythm aligned with the original visual editor", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(
      ".cm-line.cm-markra-empty-line + .cm-line.cm-markra-blockquote",
    );
    expect(styles).toContain(
      '.cm-line.cm-markra-list-item[data-list-depth="0"] +',
    );
    expect(styles).toContain(
      '.cm-line.cm-markra-list-item[data-list-depth="1"]',
    );
    expect(styles).toContain("padding-block-start: 4px !important");
    expect(styles).toContain("padding-block-start: 8px !important");
    expect(styles).toContain("padding-block-start: 12px !important");
    expect(styles).not.toContain("padding-block-start: 24px !important");
    expect(styles).toContain(".markdown-paper .cm-line.cm-markra-code-content-line");
    expect(styles).toContain("font-size: 14.4px !important");
    expect(styles).toContain(".markdown-paper .cm-markra-code-header-actions");
    expect(styles).toContain("opacity: 0 !important");
    expect(styles).toContain(".markdown-paper .cm-markra-table-wrap");
    expect(styles).toContain("padding: 20px 36px 12px 0 !important");
    expect(styles).toContain(
      ".markdown-paper .cm-line:has(> .cm-markra-table-wrap)",
    );
    expect(styles).toContain("margin: 0 !important");
    expect(styles).toContain(
      '.markdown-paper .cm-markra-table[data-width-mode="auto"]',
    );
    expect(styles).toContain(
      '.markdown-paper .cm-markra-table[data-width-mode="even"]',
    );
    expect(styles).toContain(
      '.markdown-paper[data-editor-theme="github"] .cm-markra-table-wrap',
    );
    expect(styles).toContain(
      '.markdown-paper[data-editor-theme="github-dark"] .cm-markra-table th',
    );
    expect(styles).toContain(".markdown-paper .cm-markra-table th");
    expect(styles).toContain("padding: 8px 12px !important");
    expect(styles).toContain(
      ".markdown-paper .cm-line:has(> .cm-markra-horizontal-rule)",
    );
    expect(styles).toContain("margin: 16px 0 12px !important");
  });

  it("uses a white CodeMirror caret on dark editor themes", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain("--editor-caret-color: var(--accent)");
    expect(styles).toContain("--editor-caret-color: #ffffff");
    expect(styles).toContain(".markdown-paper .cm-cursor");
    expect(styles).toContain(
      "border-left-color: var(--editor-caret-color) !important",
    );
  });

  it("uses theme colors for the focused Vim block cursor and hides it when unfocused", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(
      ".markdown-paper .cm-vimMode .cm-fat-cursor",
    );
    expect(styles).toContain(
      ".markdown-source-paper .cm-vimMode .cm-fat-cursor",
    );
    expect(styles).toContain("background: var(--accent) !important");
    expect(styles).toContain("color: var(--bg-primary) !important");

    const unfocusedRuleStart = styles.indexOf(
      ".markdown-paper .cm-editor:not(.cm-focused) .cm-vimMode .cm-fat-cursor",
    );
    const unfocusedRuleEnd = styles.indexOf("\n  }", unfocusedRuleStart);
    const unfocusedRule = styles.slice(unfocusedRuleStart, unfocusedRuleEnd);
    expect(unfocusedRule).toContain("display: none !important");
  });

  it("styles the Vim mode panel with editor theme colors", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(".markdown-paper .cm-vim-panel");
    expect(styles).toContain(".markdown-source-paper .cm-vim-panel");
    expect(styles).toContain(".markra-vim-hint");
    expect(styles).toContain(".markra-vim-feedback");
    expect(styles).toContain("background: var(--editor-bg-secondary)");
    expect(styles).toContain("color: var(--accent)");
  });

  it("reveals inline CodeMirror block controls when their block is hovered", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const blockLineRuleStart = styles.indexOf(
      ".markdown-paper .cm-line[data-markra-block-from] {",
    );
    const blockLineRuleEnd = styles.indexOf("\n  }", blockLineRuleStart);
    const blockLineRule = styles.slice(blockLineRuleStart, blockLineRuleEnd);
    const toolbarRuleStart = styles.indexOf(
      ".markdown-paper .cm-markra-block-toolbar {",
    );
    const toolbarRuleEnd = styles.indexOf("\n  }", toolbarRuleStart);
    const toolbarRule = styles.slice(toolbarRuleStart, toolbarRuleEnd);
    const revealRuleStart = styles.indexOf(
      ".markdown-paper .cm-line:hover > .cm-markra-block-toolbar",
    );
    const revealRuleEnd = styles.indexOf("\n  }", revealRuleStart);
    const revealRule = styles.slice(revealRuleStart, revealRuleEnd);

    expect(blockLineRuleStart).toBeGreaterThanOrEqual(0);
    expect(blockLineRule).toContain("position: relative");
    expect(toolbarRuleStart).toBeGreaterThanOrEqual(0);
    expect(toolbarRule).toContain("position: absolute !important");
    expect(toolbarRule).toContain("inset-inline-start: -54px");
    expect(toolbarRule).toContain(
      "top: calc(0.5lh + var(--markra-block-toolbar-block-offset, 0px))",
    );
    expect(toolbarRule).toContain("margin: 0 !important");
    expect(toolbarRule).toContain("transform: translateY(-50%)");
    expect(toolbarRule).toContain("opacity: 0 !important");
    expect(toolbarRule).toContain("pointer-events: auto");
    expect(styles).toContain(
      ".markdown-paper .cm-markra-block-toolbar::after",
    );
    expect(styles).toContain("inset-inline-end: -12px");
    expect(styles).toContain("width: 12px");
    expect(revealRuleStart).toBeGreaterThanOrEqual(0);
    expect(revealRule).toContain("opacity: 0.58 !important");
    expect(revealRule).toContain("pointer-events: auto");
  });

  it("keeps terminal heading tools centered and in separate horizontal slots", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const terminalHeadingToolbarRuleStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-h1 > .cm-markra-block-toolbar,",
    );
    const terminalHeadingToolbarRuleEnd = styles.indexOf(
      "\n  }",
      terminalHeadingToolbarRuleStart,
    );
    const terminalHeadingToolbarRule = styles.slice(
      terminalHeadingToolbarRuleStart,
      terminalHeadingToolbarRuleEnd,
    );

    expect(terminalHeadingToolbarRuleStart).toBeGreaterThanOrEqual(0);
    expect(terminalHeadingToolbarRule).toContain(
      ".markdown-paper .cm-line.cm-markra-h6 > .cm-markra-block-toolbar",
    );
    expect(terminalHeadingToolbarRule).toContain(
      "top: calc(50% + var(--markra-heading-control-center-offset));",
    );
    expect(terminalHeadingToolbarRule).toContain(
      "inset-inline-start: var(--markra-heading-toolbar-inline-start);",
    );
    expect(styles).toContain(
      "--markra-heading-toolbar-inline-start: -78px;",
    );
    expect(styles).toContain(
      ".markdown-paper .cm-line.cm-markra-h6 > .cm-markra-block-toolbar::after {",
    );
    expect(styles).toContain(
      ".markdown-paper .cm-line.cm-markra-h1 {\n" +
      "    --markra-heading-control-center-offset: -5.5px;",
    );
    expect(styles).toContain(
      ".markdown-paper .cm-line.cm-markra-h2 {\n" +
      "    --markra-heading-control-center-offset: 8px;",
    );
    expect(styles).toContain(
      ".markdown-paper .cm-line.cm-markra-h3 {\n" +
      "    --markra-heading-control-center-offset: 9px;",
    );
    expect(styles).toContain(
      ".markdown-paper .cm-line.cm-markra-h4 {\n" +
      "    --markra-heading-control-center-offset: 8px;",
    );
    expect(styles).toContain(
      "--markra-heading-control-center-offset: 7px;\n" +
      "    padding-block-start: 14px !important;",
    );
    expect(styles).not.toContain(
      ".cm-line.cm-markra-h3.markra-heading-toggle-heading {\n" +
      "    --markra-heading-control-center-offset:",
    );
  });

  it("reserves a third heading-control slot when folding is available", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const foldableHeadingRuleStart = styles.indexOf(
      ".markdown-paper .cm-line.markra-heading-toggle-heading {",
    );
    const foldableHeadingRuleEnd = styles.indexOf(
      "\n  }",
      foldableHeadingRuleStart,
    );
    const foldableHeadingRule = styles.slice(
      foldableHeadingRuleStart,
      foldableHeadingRuleEnd,
    );

    expect(foldableHeadingRuleStart).toBeGreaterThanOrEqual(0);
    expect(foldableHeadingRule).toContain(
      "--markra-heading-toolbar-inline-start: -104px",
    );
    expect(foldableHeadingRule).not.toContain("top:");
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
    const autoTableRuleStart = styles.indexOf(
      ".markdown-paper .markra-table-controls-wrapper[data-width-mode=\"auto\"] .markra-table-scroll > table"
    );
    const autoTableRuleEnd = styles.indexOf(
      ".markdown-paper .markra-table-controls-wrapper[data-width-mode=\"auto\"][data-table-alignment=\"center\"]",
      autoTableRuleStart
    );
    const autoTableRule = styles.slice(autoTableRuleStart, autoTableRuleEnd);

    expect(styles).toContain(".markdown-paper table");
    expect(styles).toContain("table-layout: fixed");
    expect(styles).toContain(".markdown-paper .markra-table-scroll");
    expect(styles).toContain("@apply overflow-x-auto");
    expect(styles).toContain(".markdown-paper .markra-table-controls-wrapper[data-width-mode=\"auto\"] .markra-table-scroll > table");
    expect(styles).toContain("table-layout: auto");
    expect(styles).toContain("width: 100%");
    expect(styles).toContain("max-width: 100%");
    expect(styles).toContain("margin-inline: auto");
    expect(styles).toContain("margin-left: auto");
    expect(styles).toContain("overflow-wrap: anywhere");
    expect(styles).toContain("word-break: normal");
    expect(styles).not.toContain("display: inline-table");
    expect(autoTableRuleStart).toBeGreaterThanOrEqual(0);
    expect(autoTableRuleEnd).toBeGreaterThan(autoTableRuleStart);
    expect(autoTableRule).not.toContain("width: max-content");
    expect(styles).not.toContain("markra-table-short-column");
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

  it("keeps editor scrollbars below the titlebar tab area", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const scrollRuleStart = styles.indexOf(".editor-content-slot .paper-scroll {");
    const scrollRuleEnd = styles.indexOf(".editor-content-slot .markdown-paper,", scrollRuleStart);
    const scrollRule = styles.slice(scrollRuleStart, scrollRuleEnd);
    const paperRuleStart = styles.indexOf(".editor-content-slot .markdown-paper,");
    const paperRuleEnd = styles.indexOf("@media (max-width: 900px)", paperRuleStart);
    const paperRule = styles.slice(paperRuleStart, paperRuleEnd);

    expect(scrollRuleStart).toBeGreaterThanOrEqual(0);
    expect(scrollRuleEnd).toBeGreaterThan(scrollRuleStart);
    expect(scrollRule).toContain("height: calc(100% - 2.5rem);");
    expect(scrollRule).toContain("margin-top: 2.5rem;");
    expect(paperRuleStart).toBeGreaterThanOrEqual(0);
    expect(paperRuleEnd).toBeGreaterThan(paperRuleStart);
    expect(paperRule).toContain("padding-top: 1rem;");
  });

  it("keeps visible scrollbars for the macOS 27 WebKit scrolling workaround", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const workaroundStart = styles.indexOf('html[data-webkit-scroll-workaround="macos-27"]');
    const workaroundEnd = styles.indexOf("  html,\n  body,", workaroundStart);
    const workaroundStyles = styles.slice(workaroundStart, workaroundEnd);

    expect(workaroundStart).toBeGreaterThanOrEqual(0);
    expect(workaroundEnd).toBeGreaterThan(workaroundStart);
    expect(workaroundStyles).toContain('html[data-webkit-scroll-workaround="macos-27"]');
    expect(workaroundStyles).toContain('html[data-webkit-scroll-workaround="macos-27"] *');
    expect(workaroundStyles).toContain("scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track)");
    expect(workaroundStyles).toContain("scrollbar-width: thin");
    expect(workaroundStyles).toContain('html[data-webkit-scroll-workaround="macos-27"] *::-webkit-scrollbar');
    expect(workaroundStyles).toContain("width: 10px");
    expect(workaroundStyles).toContain("height: 10px");
    expect(workaroundStyles).not.toContain("scrollbar-color: auto");
    expect(workaroundStyles).not.toContain("width: auto");
    expect(workaroundStyles).not.toContain("height: auto");
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
    expect(headingStyles).toContain("font-size: var(--editor-h1-font-size)");
    expect(headingStyles).toContain("font-size: var(--editor-h2-font-size)");
  });

  it("uses a paragraph spacing variable for visual editor paragraphs", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const paragraphStart = styles.indexOf(".markdown-paper p {");
    const paragraphEnd = styles.indexOf(".markdown-paper blockquote", paragraphStart);
    const paragraphStyles = styles.slice(paragraphStart, paragraphEnd);

    expect(paragraphStart).toBeGreaterThanOrEqual(0);
    expect(paragraphEnd).toBeGreaterThan(paragraphStart);
    expect(paragraphStyles).toContain("margin-block: 0 var(--editor-paragraph-spacing);");
    expect(paragraphStyles).not.toContain("@apply m-0");
  });

  it("adds GitHub heading dividers and sizes in GitHub editor themes", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const githubHeadingStart = styles.indexOf('.markdown-paper[data-editor-theme="github"] h1,');
    const githubHeadingEnd = styles.indexOf(".markdown-paper .markra-heading-editing", githubHeadingStart);
    const githubHeadingStyles = styles.slice(githubHeadingStart, githubHeadingEnd);

    expect(githubHeadingStart).toBeGreaterThanOrEqual(0);
    expect(githubHeadingEnd).toBeGreaterThan(githubHeadingStart);
    expect(githubHeadingStyles).toContain('.markdown-paper[data-editor-theme="github-dark"] h1');
    expect(githubHeadingStyles).toContain('.markdown-paper[data-editor-theme="github"] h2');
    expect(githubHeadingStyles).toContain("border-bottom: 1px solid var(--editor-border);");
    expect(githubHeadingStyles).toContain("padding-bottom: 0.3em;");
    expect(githubHeadingStyles).toContain("font-size: 2em;");
    expect(githubHeadingStyles).toContain("font-size: 1.5em;");
    expect(githubHeadingStyles).toContain("font-weight: 600;");
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

  it("centers task list checkboxes against the current text line", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const checkboxStart = styles.indexOf(".markdown-paper .markra-task-list-checkbox {");
    const checkboxEnd = styles.indexOf(".markdown-paper .markra-task-list-checkbox:disabled", checkboxStart);
    const checkboxStyles = styles.slice(checkboxStart, checkboxEnd);

    expect(checkboxStart).toBeGreaterThanOrEqual(0);
    expect(checkboxEnd).toBeGreaterThan(checkboxStart);
    expect(checkboxStyles).toContain("line-height: inherit;");
    expect(checkboxStyles).toContain("margin-top: calc((1lh - 1rem) / 2);");
    expect(checkboxStyles).not.toContain("mt-1");
  });

  it("uses distinct unordered list markers for nested editor lists", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(".markdown-paper ul ul {");
    expect(styles).toContain("list-style-type: circle;");
    expect(styles).toContain(".markdown-paper ul ul ul {");
    expect(styles).toContain("list-style-type: square;");
  });

  it("keeps the active heading-level control out of the editable text layout", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const labelStart = styles.indexOf(".markdown-paper .markra-heading-level-control {");
    const labelEnd = styles.indexOf(".markdown-paper .markra-heading-toggle-heading");
    const labelStyles = styles.slice(labelStart, labelEnd);
    const foldButtonStart = styles.indexOf(
      ".markdown-paper .markra-heading-toggle-button {",
    );
    const foldButtonEnd = styles.indexOf(
      ".markdown-paper .markra-heading-toggle-heading:hover",
      foldButtonStart,
    );
    const foldButtonStyles = styles.slice(foldButtonStart, foldButtonEnd);

    expect(labelStart).toBeGreaterThanOrEqual(0);
    expect(labelEnd).toBeGreaterThan(labelStart);
    expect(labelStyles).toContain("position: absolute");
    expect(labelStyles).toContain("display: inline-grid");
    expect(labelStyles).toContain("left: -28px");
    expect(labelStyles).toContain("margin: 0");
    expect(labelStyles).toContain(
      "top: calc(50% + var(--markra-heading-control-center-offset))",
    );
    expect(labelStyles).toContain("transform: translateY(-50%)");
    expect(labelStyles).toContain(".markdown-paper .markra-heading-level-list");
    expect(labelStyles).toContain("[role=\"option\"]");
    expect(labelStyles).toContain(".markdown-paper .markra-heading-level-button::before");
    expect(labelStyles).toContain("color: color-mix");
    expect(foldButtonStyles).toContain("left: -54px");
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
    expect(styles).toContain(".markdown-paper .markra-table-width-button");
    expect(styles).toContain(".markdown-paper .markra-table-width-icon");
    expect(styles).toContain(".markdown-paper .markra-table-controls-wrapper[data-width-mode=\"auto\"]");
    expect(styles).toContain("width: 100%");
    expect(styles).toContain("max-width: 100%");
    expect(styles).toContain("table-layout: auto");
    expect(styles).toContain(".markdown-paper .markra-table-width-button[aria-pressed=\"true\"]");
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
    expect(tableControlStyles).not.toContain("container-type");
    expect(tableControlStyles).not.toContain("inline-table");
    expect(tableControlStyles).toContain("--accent");
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
    expect(imageSelectionStyles).toContain("outline:");
    expect(imageSelectionStyles).toContain("#8cf");
    expect(imageSelectionStyles).not.toContain("var(--accent)");
    expect(imageSelectionStyles).toContain("outline-offset");
    expect(imageSelectionStyles).not.toContain("outline-none");
  });

  it("keeps image Markdown source compact instead of inheriting heading typography", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const imageSourceStart = styles.indexOf(
      ".markdown-paper .markra-image-node-source {",
    );
    const imageSourceEnd = styles.indexOf(
      ".markdown-paper .markra-image-node-source:focus",
      imageSourceStart,
    );
    const imageSourceStyles = styles.slice(imageSourceStart, imageSourceEnd);

    expect(imageSourceStart).toBeGreaterThanOrEqual(0);
    expect(imageSourceEnd).toBeGreaterThan(imageSourceStart);
    expect(imageSourceStyles).toContain("font-size: 0.875rem");
    expect(imageSourceStyles).toContain("font-weight: 400");
    expect(imageSourceStyles).toContain("line-height: 1.5rem");
    expect(imageSourceStyles).not.toContain("text-[0.95em]");
    expect(imageSourceStyles).not.toContain("line-height: inherit");
  });

  it("lets rendered raw HTML collapse source newlines like browser HTML", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const rawHtmlStart = styles.indexOf(".markdown-paper .markra-html-node {");
    const rawHtmlEnd = styles.indexOf(".markdown-paper .markra-html-node img", rawHtmlStart);
    const rawHtmlStyles = styles.slice(rawHtmlStart, rawHtmlEnd);
    const rawHtmlPreStart = styles.indexOf(".markdown-paper .markra-html-node pre", rawHtmlEnd);
    const rawHtmlPreEnd = styles.indexOf(".markdown-paper .markra-html-node-source", rawHtmlPreStart);
    const rawHtmlPreStyles = styles.slice(rawHtmlPreStart, rawHtmlPreEnd);

    expect(rawHtmlStart).toBeGreaterThanOrEqual(0);
    expect(rawHtmlEnd).toBeGreaterThan(rawHtmlStart);
    expect(rawHtmlStyles).toContain("white-space: normal");
    expect(rawHtmlPreStart).toBeGreaterThanOrEqual(0);
    expect(rawHtmlPreEnd).toBeGreaterThan(rawHtmlPreStart);
    expect(rawHtmlPreStyles).toContain("white-space: pre-wrap");
  });

  it("gives horizontal rules a forgiving hit target without heavy selected-node feedback", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const renderedRuleStart = styles.indexOf(".markdown-paper .cm-markra-horizontal-rule {");
    const renderedRuleEnd = styles.indexOf(".markdown-paper .cm-markra-task-checkbox", renderedRuleStart);
    const renderedRuleStyles = styles.slice(renderedRuleStart, renderedRuleEnd);
    const renderedLineStart = styles.indexOf(
      ".markdown-paper .cm-line:has(> .cm-markra-horizontal-rule) {",
    );
    const renderedLineEnd = styles.indexOf("\n  }", renderedLineStart);
    const renderedLineStyles = styles.slice(renderedLineStart, renderedLineEnd);
    const ruleStart = styles.indexOf(".markdown-paper hr {");
    const ruleEnd = styles.indexOf(".ai-chat-markdown", ruleStart);
    const ruleStyles = styles.slice(ruleStart, ruleEnd);

    expect(renderedRuleStart).toBeGreaterThanOrEqual(0);
    expect(renderedRuleEnd).toBeGreaterThan(renderedRuleStart);
    expect(renderedRuleStyles).toContain("border-top: 0 !important");
    expect(renderedLineStyles).toContain(
      "--markra-block-toolbar-block-offset: 22px;",
    );
    expect(ruleStart).toBeGreaterThanOrEqual(0);
    expect(ruleEnd).toBeGreaterThan(ruleStart);
    expect(ruleStyles).toContain("@apply my-5 border-0");
    expect(ruleStyles).not.toContain("@apply my-8 border-0");
    expect(ruleStyles).toContain("height:");
    expect(ruleStyles).toContain("cursor: pointer");
    expect(ruleStyles).toContain("background:");
    expect(ruleStyles).toContain(".markdown-paper hr:hover");
    expect(ruleStyles).toContain("100% 2px");
  });

  it("extends range-selection feedback to hidden visual list markers", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const selectedMarkerStart = styles.indexOf(
      '.markdown-paper .cm-line.cm-markra-list-item[data-markra-list-marker-selected="true"]::before {',
    );
    const selectedMarkerEnd = styles.indexOf("\n  }", selectedMarkerStart);
    const selectedMarkerRule = styles.slice(
      selectedMarkerStart,
      selectedMarkerEnd,
    );

    expect(selectedMarkerStart).toBeGreaterThanOrEqual(0);
    expect(selectedMarkerRule).toContain(
      "background: color-mix(in srgb, var(--editor-caret-color, var(--accent)) 20%, transparent);",
    );
  });

  it("suppresses editor selection chrome while document search is open", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const searchChromeStart = styles.indexOf(".editor-content-slot[data-document-search-open=\"true\"]");
    const searchChromeEnd = styles.indexOf(".ai-command-thinking-text");
    const searchChromeStyles = styles.slice(searchChromeStart, searchChromeEnd);

    expect(searchChromeStart).toBeGreaterThanOrEqual(0);
    expect(searchChromeEnd).toBeGreaterThan(searchChromeStart);
    expect(searchChromeStyles).toContain("caret-color: transparent");
    expect(searchChromeStyles).toContain(".markra-image-node.markra-image-node-selected");
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

  it("styles finalized and live CodeMirror emphasis marks in the editor", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

    expect(styles).toContain(".markdown-paper em");
    expect(styles).toContain("@apply italic");
    expect(styles).toContain("font-synthesis: style");

    const codeMirrorEmphasisStart = styles.indexOf(
      ".markdown-paper .cm-markra-emphasis {",
    );
    const codeMirrorEmphasisEnd = styles.indexOf(
      ".markdown-paper .cm-markra-inline-code {",
    );
    const codeMirrorEmphasisStyles = styles.slice(
      codeMirrorEmphasisStart,
      codeMirrorEmphasisEnd,
    );

    expect(codeMirrorEmphasisStart).toBeGreaterThanOrEqual(0);
    expect(codeMirrorEmphasisEnd).toBeGreaterThan(codeMirrorEmphasisStart);
    expect(codeMirrorEmphasisStyles).toContain("font-style: italic");
    expect(codeMirrorEmphasisStyles).toContain("font-synthesis: style");
  });

  it("preserves the original link preview and source-editing affordances", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const sourceLabelStart = styles.indexOf(
      ".markdown-paper .cm-markra-link-source-label {",
    );
    const sourceStart = styles.indexOf(
      ".markdown-paper .cm-markra-link-source,\n",
    );
    const sourceLabelEnd = styles.indexOf(
      ".markdown-paper .cm-markra-link-icon {",
    );
    const sourceLabelStyles = styles.slice(sourceLabelStart, sourceLabelEnd);
    const iconStyles = styles.slice(
      sourceLabelEnd,
      styles.indexOf(".markra-document-link-menu", sourceLabelEnd),
    );

    expect(sourceLabelStart).toBeGreaterThanOrEqual(0);
    expect(sourceStart).toBeGreaterThanOrEqual(0);
    expect(sourceLabelEnd).toBeGreaterThan(sourceLabelStart);
    expect(styles).toContain(
      ".markdown-paper .cm-markra-link-source,\n  .markdown-paper .cm-markra-link-source * {",
    );
    expect(styles.slice(sourceStart, sourceLabelStart)).toContain(
      "color: var(--editor-markdown-syntax-color)",
    );
    expect(styles.slice(sourceStart, sourceLabelStart)).toContain(
      "text-decoration: none !important",
    );
    expect(sourceLabelStyles).toContain("underline");
    expect(sourceLabelStyles).toContain("cursor: var(--editor-text-cursor)");
    expect(iconStyles).toContain('content: "↗"');
    expect(iconStyles).toContain("pointer-events: none");
  });

  it("keeps Markdown markers readable in dark themes", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const visualSyntaxColorStart = styles.indexOf(
      "--editor-markdown-syntax-color:",
    );
    const sourceSyntaxColorStart = styles.indexOf(
      "--source-markdown-syntax-color:",
    );
    const darkSyntaxStart = styles.indexOf(
      '.markdown-paper[data-editor-theme="dark"],',
    );
    const darkSyntaxEnd = styles.indexOf("\n  }", darkSyntaxStart);
    const darkSyntax = styles.slice(
      darkSyntaxStart,
      darkSyntaxEnd,
    );
    const visualSyntaxRuleStart = styles.indexOf(
      ".markdown-paper .cm-markra-syntax-character {",
    );
    const visualSyntaxRuleEnd = styles.indexOf(
      "\n  }",
      visualSyntaxRuleStart,
    );
    const visualSyntaxRule = styles.slice(
      visualSyntaxRuleStart,
      visualSyntaxRuleEnd,
    );
    const sourceSyntaxRuleStart = styles.indexOf(
      ".markdown-source-paper .cm-markra-syntax-character {",
    );
    const sourceSyntaxRuleEnd = styles.indexOf(
      "\n  }",
      sourceSyntaxRuleStart,
    );
    const sourceSyntaxRule = styles.slice(
      sourceSyntaxRuleStart,
      sourceSyntaxRuleEnd,
    );

    expect(visualSyntaxColorStart).toBeGreaterThanOrEqual(0);
    expect(
      styles.slice(visualSyntaxColorStart, visualSyntaxColorStart + 180),
    ).toContain(
      "color-mix(in srgb, var(--text-md-char) 72%, var(--editor-paper-bg, var(--bg-primary)))",
    );
    expect(sourceSyntaxColorStart).toBeGreaterThanOrEqual(0);
    expect(
      styles.slice(sourceSyntaxColorStart, sourceSyntaxColorStart + 120),
    ).toContain("var(--editor-markdown-syntax-color)");
    expect(darkSyntaxStart).toBeGreaterThanOrEqual(0);
    expect(darkSyntax).toContain(
      "--editor-markdown-syntax-color: var(--editor-text-primary)",
    );
    expect(darkSyntax).not.toContain(".markdown-source-paper");
    const darkSourceSyntaxStart = styles.indexOf(
      '[data-theme="dark"] .markdown-source-paper,',
    );
    const darkSourceSyntaxEnd = styles.indexOf("\n  }", darkSourceSyntaxStart);
    expect(styles.slice(darkSourceSyntaxStart, darkSourceSyntaxEnd)).toContain(
      "--source-markdown-syntax-color: var(--text-primary)",
    );
    expect(visualSyntaxRuleStart).toBeGreaterThanOrEqual(0);
    expect(visualSyntaxRule).toContain(
      "color: var(--editor-markdown-syntax-color) !important",
    );
    expect(sourceSyntaxRuleStart).toBeGreaterThanOrEqual(0);
    expect(sourceSyntaxRule).toContain(
      "color: var(--source-markdown-syntax-color) !important",
    );
    expect(styles).toContain(
      ".markdown-paper .markra-md-delimiter {\n    @apply text-(--editor-markdown-syntax-color);",
    );
  });

  it("keeps secondary text readable in the low-contrast dark themes", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const sharedDarkStart = styles.indexOf('[data-theme="dark"],');
    const sharedDarkEnd = styles.indexOf("\n  }", sharedDarkStart);
    const oneDarkStart = styles.indexOf('[data-theme="one-dark"] {');
    const oneDarkEnd = styles.indexOf("\n  }", oneDarkStart);
    const oneDarkProStart = styles.indexOf('[data-theme="one-dark-pro"] {');
    const oneDarkProEnd = styles.indexOf("\n  }", oneDarkProStart);
    const oneDarkEditorStart = styles.indexOf(
      ':root:not([data-theme="dark"]) .markdown-paper[data-editor-theme="one-dark"] {',
    );
    const oneDarkEditorEnd = styles.indexOf("\n  }", oneDarkEditorStart);
    const oneDarkProEditorStart = styles.indexOf(
      ':root:not([data-theme="dark"]) .markdown-paper[data-editor-theme="one-dark-pro"] {',
    );
    const oneDarkProEditorEnd = styles.indexOf(
      "\n  }",
      oneDarkProEditorStart,
    );

    expect(styles.slice(sharedDarkStart, sharedDarkEnd)).toContain(
      "--text-secondary: #858585;",
    );
    expect(styles.slice(oneDarkStart, oneDarkEnd)).toContain(
      "--text-secondary: #8f96a3;",
    );
    expect(styles.slice(oneDarkProStart, oneDarkProEnd)).toContain(
      "--text-secondary: #8f96a3;",
    );
    expect(styles.slice(oneDarkEditorStart, oneDarkEditorEnd)).toContain(
      "--editor-text-secondary: #8f96a3;",
    );
    expect(
      styles.slice(oneDarkProEditorStart, oneDarkProEditorEnd),
    ).toContain("--editor-text-secondary: #8f96a3;");
  });

  it("removes CodeMirror's inline baseline around standalone image editors", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const imageLineStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-image-line {",
    );
    const imageNodeStart = styles.indexOf(
      ".markdown-paper .markra-image-node {",
      imageLineStart,
    );
    const imageLineStyles = styles.slice(imageLineStart, imageNodeStart);
    const standaloneNodeStart = styles.indexOf(
      ".markdown-paper .cm-line.cm-markra-image-line > .markra-image-node {",
      imageLineStart,
    );
    const standaloneNodeStyles = styles.slice(
      standaloneNodeStart,
      imageNodeStart,
    );
    const imageNodeImageStart = styles.indexOf(
      ".markdown-paper .markra-image-frame > img {",
      imageNodeStart,
    );
    const imageNodeImageStyles = styles.slice(
      imageNodeImageStart,
      styles.indexOf(".markdown-paper .markra-image-upload-placeholder", imageNodeImageStart),
    );

    expect(imageLineStart).toBeGreaterThanOrEqual(0);
    expect(imageLineStyles).toContain("line-height: 0");
    expect(standaloneNodeStart).toBeGreaterThan(imageLineStart);
    expect(standaloneNodeStyles).toContain("display: inline-block");
    expect(standaloneNodeStyles).toContain("vertical-align: top");
    expect(standaloneNodeStyles).toContain("width: 100%");
    expect(imageNodeImageStart).toBeGreaterThan(imageNodeStart);
    expect(imageNodeImageStyles).toContain("@apply my-0");
    expect(imageNodeImageStyles).toContain("display: block");
  });

  it("keeps hidden markdown delimiters available as zero-width caret anchors", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const delimiterStart = styles.indexOf(".markdown-paper .markra-md-hidden-delimiter {");
    const delimiterEnd = styles.indexOf(".markdown-paper .markra-math-source-hidden-display.markra-md-hidden-delimiter {");
    const delimiterStyles = styles.slice(delimiterStart, delimiterEnd);

    expect(delimiterStart).toBeGreaterThanOrEqual(0);
    expect(delimiterEnd).toBeGreaterThan(delimiterStart);
    expect(delimiterStyles).toContain("display: inline-block");
    expect(delimiterStyles).toContain("width: 0");
    expect(delimiterStyles).toContain("overflow: hidden");
    expect(delimiterStyles).toContain("-webkit-text-fill-color: transparent");
    expect(delimiterStyles).not.toContain("@apply hidden");
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
    const mermaidZoomButtonStart = styles.indexOf(".markdown-paper .markra-mermaid-zoom-button {");
    const mermaidZoomButtonEnd =
      styles.indexOf("\n  }\n", mermaidZoomButtonStart) + "\n  }\n".length;
    const mermaidZoomButtonStyles = styles.slice(mermaidZoomButtonStart, mermaidZoomButtonEnd);
    const mermaidZoomHoverStart = styles.indexOf(".markdown-paper .markra-mermaid-zoom-button:hover");
    const mermaidZoomHoverEnd = styles.indexOf("\n  }\n", mermaidZoomHoverStart) + "\n  }\n".length;
    const mermaidZoomHoverStyles = styles.slice(mermaidZoomHoverStart, mermaidZoomHoverEnd);
    const mermaidZoomCloseHoverStart = styles.indexOf(".markra-media-viewer-close-button:hover");
    const mermaidZoomCloseHoverEnd =
      styles.indexOf("\n  }\n", mermaidZoomCloseHoverStart) + "\n  }\n".length;
    const mermaidZoomCloseHoverStyles = styles.slice(mermaidZoomCloseHoverStart, mermaidZoomCloseHoverEnd);

    expect(mermaidFoldStyles).toContain(".markra-code-line-numbers");
    expect(mermaidFoldStyles).toContain("pre");
    expect(mermaidFoldStyles).toContain("display: none");
    expect(mermaidFoldStyles).toContain("background: transparent");
    expect(mermaidFoldStyles).toContain("border-color: transparent");
    expect(mermaidFoldStyles).toContain("contain: layout paint style");
    expect(mermaidFoldStyles).toContain("will-change: transform");
    expect(mermaidFoldStyles).toContain("transform: translateZ(0)");
    expect(mermaidFoldStyles).toContain(".markra-code-language-control");
    expect(styles).toContain(
      ".markdown-paper .cm-markra-code-top-gap:has(+ .cm-line .markra-code-block[data-mermaid-mode=\"preview\"]) {\n" +
      "    display: none;",
    );
    expect(styles).toContain(".markdown-paper .markra-mermaid-preview-button");
    expect(styles).toContain(".markdown-paper .markra-mermaid-zoom-button");
    expect(mermaidZoomButtonStyles).toContain("top-4");
    expect(mermaidZoomRevealStyles).not.toContain(":focus-within");
    expect(mermaidZoomRevealStyles).toContain("opacity: 1");
    expect(mermaidZoomRevealStyles).toContain("pointer-events: auto");
    expect(mermaidZoomHoverStyles).not.toContain(":focus-visible");
    expect(mermaidZoomHoverStyles).not.toContain("box-shadow");
    expect(mermaidZoomCloseHoverStyles).not.toContain(":focus-visible");
    expect(mermaidZoomCloseHoverStyles).not.toContain("box-shadow");
    expect(styles).toContain(".markra-media-viewer-dialog");
    expect(styles).toContain(".markra-media-viewer-dialog[data-fullscreen=\"true\"]");
    expect(styles).toContain(".markra-media-viewer-toolbar");
    expect(styles).toContain(".markra-media-viewer-control-button");
    expect(styles).toContain(".markra-media-viewer-content[data-dragging=\"true\"]");
    expect(styles).toContain(".markra-media-viewer-canvas");
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
    const commentStart = styles.indexOf(
      ".markdown-paper .hljs-comment,",
    );
    const commentEnd = styles.indexOf("\n  }", commentStart);
    const commentStyles = styles.slice(commentStart, commentEnd);

    expect(inlineCodeStyles).toContain("color: oklch");
    expect(inlineCodeStyles).toContain("box-shadow");
    expect(activeInlineCodeStyles).toContain("background: transparent");
    expect(activeInlineCodeStyles).toContain("box-shadow: none");
    expect(preCodeStyles).toContain("color: inherit");
    expect(preCodeStyles).toContain("box-shadow: none");
    expect(styles).toContain(".markdown-paper .hljs-meta");
    expect(styles).toContain(".markdown-paper .hljs-symbol");
    expect(styles).toContain(".markdown-paper .hljs-type");
    expect(commentStart).toBeGreaterThanOrEqual(0);
    expect(commentStyles).toContain("font-style: normal");
    expect(commentStyles).not.toContain("font-style: italic");
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
    expect(styles).not.toContain(".markdown-paper[data-editor-theme=\"night\"] .cm-editor");
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

  it("keeps GitHub editor tables aligned with Primer Markdown spacing", () => {
    const styles = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    const wrapperStart = styles.indexOf(".markdown-paper[data-editor-theme=\"github\"] .tableWrapper,");
    const wrapperEnd = styles.indexOf(".markdown-paper[data-editor-theme=\"github\"] table,", wrapperStart);
    const wrapperStyles = styles.slice(wrapperStart, wrapperEnd);
    const tableStart = wrapperEnd;
    const tableEnd = styles.indexOf(".markdown-paper[data-editor-theme=\"github\"] th,", tableStart);
    const tableStyles = styles.slice(tableStart, tableEnd);
    const cellStart = tableEnd;
    const cellEnd = styles.indexOf(".markdown-paper .markra-table-controls-wrapper[data-width-mode=\"auto\"]", cellStart);
    const cellStyles = styles.slice(cellStart, cellEnd);
    const headerStart = styles.indexOf(".markdown-paper[data-editor-theme=\"github\"] th,", cellEnd);
    const headerEnd = styles.indexOf(".markdown-paper td {", headerStart);
    const headerStyles = styles.slice(headerStart, headerEnd);

    expect(wrapperStart).toBeGreaterThanOrEqual(0);
    expect(wrapperEnd).toBeGreaterThan(wrapperStart);
    expect(wrapperStyles).toContain("margin-block: 1rem;");
    expect(wrapperStyles).toContain("padding: 0;");
    expect(tableStyles).toContain("font-size: 1em;");
    expect(tableStyles).toContain("font-variant: tabular-nums;");
    expect(tableStyles).toContain("line-height: 1.5;");
    expect(cellStyles).toContain("padding: 6px 13px;");
    expect(cellStyles).toContain("border-color: var(--editor-border);");
    expect(headerStyles).toContain("font-weight: 600;");
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
    expect(styles).toContain(".markdown-paper a");
  });
});
