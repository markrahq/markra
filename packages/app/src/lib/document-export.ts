import katexStyles from "katex/dist/katex.css?raw";
import { isMarkraMathMacroDefinitionSource } from "@markra/editor";

export type ExportDocumentFormat = "html" | "pdf" | "docx" | "epub" | "latex";

const defaultPdfMarginMm = 18;
const defaultPdfPageHeightMm = 297;
const defaultPdfPageWidthMm = 210;

export type MarkdownExportStyleOptions = {
  pdfFooter?: string;
  pdfHeader?: string;
  pdfHeightMm?: number;
  pdfMarginMm?: number;
  pdfPageBreakOnH1?: boolean;
  pdfWidthMm?: number;
};

function normalizePdfMarginMm(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultPdfMarginMm;

  return Math.min(Math.max(Math.round(value), 0), 60);
}

function normalizePdfPageDimensionMm(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  return Math.min(Math.max(Math.round(value), 50), 2000);
}

export function createMarkdownExportStyles({
  pdfFooter,
  pdfHeader,
  pdfHeightMm,
  pdfMarginMm,
  pdfPageBreakOnH1,
  pdfWidthMm
}: MarkdownExportStyleOptions = {}) {
  const hasHeader = Boolean(pdfHeader?.trim());
  const hasFooter = Boolean(pdfFooter?.trim());
  const pageMarginMm = normalizePdfMarginMm(pdfMarginMm);
  const pageHeightMm = normalizePdfPageDimensionMm(pdfHeightMm, defaultPdfPageHeightMm);
  const pageWidthMm = normalizePdfPageDimensionMm(pdfWidthMm, defaultPdfPageWidthMm);
  const pageBreakStyles = pdfPageBreakOnH1
    ? `

  .markdown-export h1 {
    break-before: page;
  }

  .markdown-export h1:first-child {
    break-before: auto;
  }`
    : "";

  return `
${katexStyles}

:root {
  color: #222;
  background: #fff;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
}

/* Keep Han text and Latin numerals on one CJK-capable family when possible. */
:root:lang(zh-CN),
:root:lang(zh-SG),
:root:lang(zh-Hans) {
  font-family: "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", "Source Han Serif CN", "Songti SC", STSong, SimSun, ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
}

body {
  margin: 0;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.markdown-export {
  box-sizing: border-box;
  max-width: 860px;
  margin: 0 auto;
  padding: 48px 56px;
  font-size: 16px;
  line-height: 1.65;
  /* Serif export fonts may default to old-style figures with uneven heights. */
  font-variant-numeric: lining-nums;
}

.markdown-export h1,
.markdown-export h2,
.markdown-export h3,
.markdown-export h4,
.markdown-export h5,
.markdown-export h6 {
  color: #111;
  line-height: 1.25;
}

.markdown-export img {
  max-width: 100%;
  height: auto;
}

.markdown-export pre {
  overflow-x: auto;
  padding: 16px;
  background: #f6f6f6;
  border-radius: 6px;
}

.markdown-export code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.markdown-export table {
  width: 100%;
  border-collapse: collapse;
}

.markdown-export th,
.markdown-export td {
  padding: 8px 10px;
  border: 1px solid #ddd;
  text-align: left;
}

.markdown-export blockquote {
  margin: 1em 0;
  padding-left: 1em;
  border-left: 4px solid #d8d8d8;
  color: #555;
}

.markdown-export blockquote.markra-callout {
  --callout-color: oklch(52% 0.11 252);
  --callout-bg: color-mix(in srgb, var(--callout-color) 5%, #fbfbfb);
  --callout-border: color-mix(in srgb, var(--callout-color) 22%, #d8d8d8);
  margin: 1.1em 0;
  padding: 0.85em 1em 0.9em;
  border: 1px solid var(--callout-border);
  border-radius: 7px;
  background: var(--callout-bg);
  color: #222;
}

.markdown-export blockquote.markra-callout-tip {
  --callout-color: oklch(50% 0.11 154);
}

.markdown-export blockquote.markra-callout-important {
  --callout-color: oklch(50% 0.12 292);
}

.markdown-export blockquote.markra-callout-warning {
  --callout-color: oklch(54% 0.12 72);
}

.markdown-export blockquote.markra-callout-caution {
  --callout-color: oklch(52% 0.13 28);
}

.markdown-export .markra-callout-header {
  display: flex;
  min-height: 1.25em;
  align-items: center;
  gap: 0.5em;
  margin-bottom: 0.45em;
  color: var(--callout-color);
  font-size: 0.78em;
  font-weight: 700;
  line-height: 1.35;
}

.markdown-export .markra-callout-icon {
  position: relative;
  display: inline-grid;
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 11%, #fbfbfb);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 24%, transparent);
}

.markdown-export .markra-callout-icon::before {
  display: block;
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 999px;
  background: currentColor;
  content: "";
}

.markdown-export .markra-callout-tip .markra-callout-icon::before {
  width: 0.44rem;
  height: 0.44rem;
  border-radius: 2px;
  transform: rotate(45deg);
}

.markdown-export .markra-callout-important .markra-callout-icon::before {
  width: 0.25rem;
  height: 0.56rem;
  border-radius: 999px;
}

.markdown-export .markra-callout-warning .markra-callout-icon::before {
  width: 0.62rem;
  height: 0.62rem;
  border-radius: 0;
  clip-path: polygon(50% 4%, 96% 92%, 4% 92%);
}

.markdown-export .markra-callout-caution .markra-callout-icon::before {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 2px;
}

.markdown-export blockquote.markra-callout p {
  margin: 0 0 0.75em;
}

.markdown-export blockquote.markra-callout p:last-child {
  margin-bottom: 0;
}

.markdown-export .markra-math-render {
  color: #222;
  letter-spacing: 0;
}

.markdown-export .markra-math-render .katex {
  font-size: 1em;
}

.markdown-export .markra-math-render-inline {
  display: inline-flex;
  margin: 0 0.08em;
  vertical-align: -0.08em;
}

.markdown-export .markra-math-render-display {
  display: block;
  max-width: 100%;
  margin: 0.85em 0;
  overflow-x: auto;
  overflow-y: hidden;
  text-align: center;
}

.markdown-export .markra-math-render-display .katex-display {
  margin: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.markdown-export .markra-mermaid-render {
  max-width: 100%;
  margin: 1.15em 0;
  overflow-x: auto;
  text-align: center;
}

.markdown-export .markra-mermaid-render svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.markdown-export .markra-mermaid-render-invalid {
  padding: 0.75em 1em;
  border: 1px solid #d68a80;
  border-radius: 4px;
  background: #fff3f1;
  color: #9b2c20;
  text-align: left;
}

.markdown-export-page-header,
.markdown-export-page-footer {
  display: none;
}

@media print {
  .markdown-export {
    max-width: none;
    margin: 0;
    padding: 0;
  }

  .markdown-export h1,
  .markdown-export h2,
  .markdown-export h3,
  .markdown-export h4,
  .markdown-export h5,
  .markdown-export h6 {
    break-after: avoid-page;
    page-break-after: avoid;
  }

  .markdown-export pre,
  .markdown-export table,
  .markdown-export blockquote,
  .markdown-export blockquote.markra-callout,
  .markdown-export .markra-math-render-display,
  .markdown-export .markra-mermaid-render {
    break-inside: avoid-page;
    page-break-inside: avoid;
  }

  .markdown-export tr,
  .markdown-export img,
  .markdown-export svg {
    break-inside: avoid-page;
    page-break-inside: avoid;
  }

  .markdown-export thead {
    display: table-header-group;
  }

  .markdown-export tfoot {
    display: table-footer-group;
  }

  .markdown-export pre,
  .markdown-export pre code {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .markdown-export-page-header,
  .markdown-export-page-footer {
    position: fixed;
    right: 0;
    left: 0;
    display: block;
    color: #666;
    font-size: 10px;
    line-height: 1.4;
  }

  .markdown-export-page-header {
    top: 0;
    padding-bottom: 4mm;
    border-bottom: ${hasHeader ? "1px solid #ddd" : "0"};
  }

  .markdown-export-page-footer {
    bottom: 0;
    padding-top: 4mm;
    border-top: ${hasFooter ? "1px solid #ddd" : "0"};
  }${pageBreakStyles}
}

@page {
  size: ${pageWidthMm}mm ${pageHeightMm}mm;
  margin: ${pageMarginMm}mm;
}
`.trim();
}

export const markdownExportStyles = createMarkdownExportStyles();

type BuildMarkdownHtmlDocumentInput = {
  bodyHtml: string;
  language?: string;
  pdfAuthor?: string;
  pdfFooter?: string;
  pdfHeader?: string;
  pdfHeightMm?: number;
  pdfMarginMm?: number;
  pdfPageBreakOnH1?: boolean;
  pdfWidthMm?: number;
  styles?: string;
  title: string;
};

function escapeHtmlText(text: string) {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function renderedMathAnnotationSource(element: Element) {
  return element.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? "";
}

function removeRenderedMathElement(element: Element) {
  const parent = element.parentElement;
  element.remove();

  if (!parent || (parent.tagName !== "P" && parent.tagName !== "PRE")) return;
  if (parent.textContent?.trim()) return;
  if (parent.querySelector("img, svg, table, code, .markra-math-render, .markra-mermaid-render")) return;

  parent.remove();
}

function removeRenderedMathMacroDefinitionMarkers(bodyHtml: string) {
  if (!bodyHtml.includes("data-markra-math-macro-definition")) return bodyHtml;
  if (typeof document === "undefined") return bodyHtml;

  const template = document.createElement("template");
  template.innerHTML = bodyHtml;

  for (const marker of Array.from(template.content.querySelectorAll("[data-markra-math-macro-definition]"))) {
    removeRenderedMathElement(marker);
  }

  return template.innerHTML;
}

function removeRenderedMathMacroDefinitions(bodyHtml: string) {
  if (
    !bodyHtml.includes("markra-math-render") ||
    !/\\(?:newcommand|renewcommand|providecommand)/u.test(bodyHtml)
  ) {
    return bodyHtml;
  }
  if (typeof document === "undefined") return bodyHtml;

  const template = document.createElement("template");
  template.innerHTML = bodyHtml;

  for (const mathElement of Array.from(template.content.querySelectorAll(".markra-math-render"))) {
    const source = renderedMathAnnotationSource(mathElement);
    if (!isMarkraMathMacroDefinitionSource(source)) continue;

    removeRenderedMathElement(mathElement);
  }

  return template.innerHTML;
}

function encodeFileUrlPath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/%3A/giu, ":"))
    .join("/");
}

export function exportDocumentFileName(documentName: string, format: ExportDocumentFormat) {
  const trimmedName = documentName.trim();
  const baseName = (trimmedName || "Untitled")
    .replace(/\.(?:md|markdown|txt)$/iu, "")
    .trim() || "Untitled";
  const extension = format === "latex" ? "tex" : format;

  return `${baseName}.${extension}`;
}

export function localFileUrlFromPath(path: string) {
  const normalizedPath = path.replace(/\\/gu, "/");
  const absolutePath = /^[a-zA-Z]:\//u.test(normalizedPath)
    ? `/${normalizedPath}`
    : normalizedPath.startsWith("/")
      ? normalizedPath
      : `/${normalizedPath}`;

  return `file://${encodeFileUrlPath(absolutePath)}`;
}

export function buildMarkdownHtmlDocument({
  bodyHtml,
  language = "en",
  pdfAuthor,
  pdfFooter,
  pdfHeader,
  pdfHeightMm,
  pdfMarginMm,
  pdfPageBreakOnH1,
  pdfWidthMm,
  styles,
  title
}: BuildMarkdownHtmlDocumentInput) {
  const escapedTitle = escapeHtmlText(title.trim() || "Untitled");
  const escapedLanguage = escapeHtmlText(language.trim() || "en");
  const escapedAuthor = escapeHtmlText(pdfAuthor?.trim() ?? "");
  const escapedFooter = escapeHtmlText(pdfFooter?.trim() ?? "");
  const escapedHeader = escapeHtmlText(pdfHeader?.trim() ?? "");
  const exportBodyHtml = removeRenderedMathMacroDefinitions(removeRenderedMathMacroDefinitionMarkers(bodyHtml));
  const documentStyles = styles ?? createMarkdownExportStyles({
    pdfFooter,
    pdfHeader,
    pdfHeightMm,
    pdfMarginMm,
    pdfPageBreakOnH1,
    pdfWidthMm
  });

  return [
    "<!doctype html>",
    `<html lang="${escapedLanguage}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ...(escapedAuthor ? [`<meta name="author" content="${escapedAuthor}">`] : []),
    `<title>${escapedTitle}</title>`,
    "<style>",
    documentStyles,
    "</style>",
    "</head>",
    "<body>",
    ...(escapedHeader ? [`<header class="markdown-export-page-header">${escapedHeader}</header>`] : []),
    ...(escapedFooter ? [`<footer class="markdown-export-page-footer">${escapedFooter}</footer>`] : []),
    '<main class="markdown-export">',
    exportBodyHtml,
    "</main>",
    "</body>",
    "</html>"
  ].join("\n");
}
