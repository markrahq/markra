import { common, createLowlight } from "lowlight";

type HighlightAstNode = {
  children?: HighlightAstNode[];
  properties?: { className?: unknown };
  type: string;
  value?: string;
};

export interface MarkraCodeHighlightSpan {
  readonly className: string;
  readonly from: number;
  readonly to: number;
}

export interface MarkraCodeLanguageOption {
  readonly label: string;
  readonly value: string;
}

export const markraCodeLanguageOptions: readonly MarkraCodeLanguageOption[] = [
  { label: "Plain Text", value: "" },
  { label: "Bash", value: "bash" },
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
  { label: "C#", value: "csharp" },
  { label: "CSS", value: "css" },
  { label: "Diff", value: "diff" },
  { label: "Dockerfile", value: "dockerfile" },
  { label: "Go", value: "go" },
  { label: "GraphQL", value: "graphql" },
  { label: "HTML", value: "html" },
  { label: "INI", value: "ini" },
  { label: "Java", value: "java" },
  { label: "JavaScript", value: "javascript" },
  { label: "JSX", value: "jsx" },
  { label: "JSON", value: "json" },
  { label: "Kotlin", value: "kotlin" },
  { label: "Less", value: "less" },
  { label: "Lua", value: "lua" },
  { label: "Makefile", value: "makefile" },
  { label: "Markdown", value: "markdown" },
  { label: "Mermaid", value: "mermaid" },
  { label: "Nginx", value: "nginx" },
  { label: "Objective-C", value: "objectivec" },
  { label: "Perl", value: "perl" },
  { label: "PHP", value: "php" },
  { label: "PowerShell", value: "powershell" },
  { label: "Python", value: "python" },
  { label: "R", value: "r" },
  { label: "Ruby", value: "ruby" },
  { label: "Rust", value: "rust" },
  { label: "SCSS", value: "scss" },
  { label: "Shell", value: "sh" },
  { label: "SQL", value: "sql" },
  { label: "Svelte", value: "svelte" },
  { label: "Swift", value: "swift" },
  { label: "TOML", value: "toml" },
  { label: "TSX", value: "tsx" },
  { label: "TypeScript", value: "ts" },
  { label: "Vue", value: "vue" },
  { label: "XML", value: "xml" },
  { label: "YAML", value: "yaml" },
];

const lowlight = createLowlight(common);

export function normalizeMarkraCodeLanguage(language: unknown) {
  if (typeof language !== "string") return "";
  return language.trim().replace(/[\s`]+/gu, "-");
}

function highlightClassNames(node: HighlightAstNode) {
  const className = node.properties?.className;
  if (!Array.isArray(className)) return [];
  return className.filter((value): value is string => typeof value === "string");
}

function collectHighlightRanges(
  node: HighlightAstNode,
  offset: number,
  inheritedClassNames: string[],
  ranges: MarkraCodeHighlightSpan[],
) {
  if (node.type === "text") {
    const value = node.value ?? "";
    if (value.length > 0 && inheritedClassNames.length > 0) {
      ranges.push({
        className: inheritedClassNames.join(" "),
        from: offset,
        to: offset + value.length,
      });
    }
    return offset + value.length;
  }

  const classNames = [...inheritedClassNames, ...highlightClassNames(node)];
  let cursor = offset;
  for (const child of node.children ?? []) {
    cursor = collectHighlightRanges(child, cursor, classNames, ranges);
  }
  return cursor;
}

export function highlightMarkraCode(language: string, code: string) {
  if (!code.trim()) return [];

  const normalizedLanguage = normalizeMarkraCodeLanguage(language);
  const ranges: MarkraCodeHighlightSpan[] = [];
  try {
    const tree = normalizedLanguage && lowlight.registered(normalizedLanguage)
      ? lowlight.highlight(normalizedLanguage, code)
      : lowlight.highlightAuto(code);
    collectHighlightRanges(tree as HighlightAstNode, 0, [], ranges);
  } catch {
    return [];
  }
  return ranges;
}
