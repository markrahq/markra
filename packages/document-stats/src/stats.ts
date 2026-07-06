export type DocumentStatsOptions = {
  countCodeBlocks: boolean;
  countFrontmatter: boolean;
  readingSpeed: number;
};

export type DocumentStats = {
  characters: number;
  headings: number;
  paragraphs: number;
  readingTimeMinutes: number;
  words: number;
};

export const defaultDocumentStatsOptions: DocumentStatsOptions = {
  countCodeBlocks: false,
  countFrontmatter: false,
  readingSpeed: 250
};

const minReadingSpeed = 50;
const maxReadingSpeed = 1000;

export function normalizeDocumentStatsOptions(value: unknown): DocumentStatsOptions {
  if (!isRecord(value)) return defaultDocumentStatsOptions;

  return {
    countCodeBlocks: typeof value.countCodeBlocks === "boolean"
      ? value.countCodeBlocks
      : defaultDocumentStatsOptions.countCodeBlocks,
    countFrontmatter: typeof value.countFrontmatter === "boolean"
      ? value.countFrontmatter
      : defaultDocumentStatsOptions.countFrontmatter,
    readingSpeed: normalizeReadingSpeed(value.readingSpeed)
  };
}

export function analyzeMarkdown(
  markdown: string,
  options: DocumentStatsOptions = defaultDocumentStatsOptions
): DocumentStats {
  const normalizedOptions = normalizeDocumentStatsOptions(options);
  let content = markdown;
  if (!normalizedOptions.countFrontmatter) content = removeFrontmatter(content);
  if (!normalizedOptions.countCodeBlocks) content = removeFencedCode(content);

  const headings = countHeadings(content);
  const paragraphs = countParagraphs(content);
  const plainText = markdownToPlainText(content);
  const words = countWords(plainText);
  const characters = plainText.replace(/\s/g, "").length;

  return {
    characters,
    headings,
    paragraphs,
    readingTimeMinutes: Math.max(1, Math.ceil(words / normalizedOptions.readingSpeed)),
    words
  };
}

export function formatDocumentStatsMarkdown(stats: DocumentStats, documentName: string) {
  return [
    "## Document Stats",
    "",
    `- Document: ${documentName}`,
    `- Words: ${stats.words}`,
    `- Characters: ${stats.characters}`,
    `- Paragraphs: ${stats.paragraphs}`,
    `- Headings: ${stats.headings}`,
    `- Reading time: ${stats.readingTimeMinutes} ${stats.readingTimeMinutes === 1 ? "min" : "mins"}`
  ].join("\n");
}

function normalizeReadingSpeed(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultDocumentStatsOptions.readingSpeed;

  return Math.min(maxReadingSpeed, Math.max(minReadingSpeed, Math.round(value)));
}

function removeFrontmatter(markdown: string) {
  return markdown.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");
}

function removeFencedCode(markdown: string) {
  return markdown.replace(/(^|\r?\n)(`{3,}|~{3,})[^\n]*(?:\r?\n[\s\S]*?\r?\n)\2[ \t]*(?=\r?\n|$)/g, "$1");
}

function countHeadings(markdown: string) {
  return markdown.match(/^\s{0,3}#{1,6}\s+\S.*$/gm)?.length ?? 0;
}

function countParagraphs(markdown: string) {
  return markdown
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, "")
    .split(/\r?\n\s*\r?\n/g)
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(block))
    .length;
}

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^(`{3,}|~{3,})[^\n]*$/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[`*_~|:[\]()>-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string) {
  if (!text) return 0;

  return text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
