import { looksLikeMarkdownSource } from "../markdown-source-detection.ts";

export interface CodePasteSource {
  readonly editorData?: string;
  readonly html?: string;
  readonly text: string;
}

export interface DetectedCodePaste {
  readonly code: string;
  readonly language: string;
}

const codeFontPattern = /(?:monospace|menlo|monaco|consolas|courier|sfmono|fira code|jetbrains mono|cascadia code|source code pro)/iu;
const preformattedWhitespacePattern = /white-space\s*:\s*(?:pre|pre-wrap|break-spaces)/iu;
const fencedMarkdownPattern = /^\s*(?:```|~~~)/u;

const languageAliases: Readonly<Record<string, string>> = {
  "c#": "csharp",
  "c++": "cpp",
  "objective-c": "objectivec",
  "shellscript": "bash",
  "javascriptreact": "jsx",
  "typescript": "ts",
  "typescriptreact": "tsx",
  "plaintext": "",
  "text": "",
  "js": "javascript",
  "py": "python",
  "rb": "ruby",
  "rs": "rust",
  "sh": "bash",
  "yml": "yaml",
};

function normalizeCode(text: string) {
  return text.replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
}

function normalizeLanguage(language: unknown) {
  if (typeof language !== "string") return "";
  const normalized = language.trim().toLowerCase();
  const aliased = languageAliases[normalized] ?? normalized;
  return /^[a-z0-9_+#.-]*$/u.test(aliased) ? aliased : "";
}

function editorCodeDetails(editorData: string | undefined) {
  if (!editorData) return { explicit: false, language: "" };
  try {
    const data = JSON.parse(editorData) as { mode?: unknown };
    if (typeof data.mode !== "string") {
      return { explicit: false, language: "" };
    }
    return { explicit: true, language: normalizeLanguage(data.mode) };
  } catch {
    return { explicit: false, language: "" };
  }
}

function languageFromClassName(className: string) {
  for (const name of className.split(/\s+/u)) {
    const match = /^(?:lang(?:uage)?)-(.+)$/iu.exec(name);
    if (match?.[1]) return normalizeLanguage(match[1]);
  }
  return "";
}

function htmlCodeDetails(html: string | undefined, plainText: string) {
  if (!html?.trim() || typeof DOMParser === "undefined") {
    return { explicit: false, language: "", mixed: false, styled: false };
  }
  const document = new DOMParser().parseFromString(html, "text/html");
  const pre = document.querySelector("pre");
  const code = pre?.querySelector("code") ?? document.querySelector("code[class]");
  const language = code
    ? languageFromClassName(code.getAttribute("class") ?? "")
    : "";
  const styledCode = Array.from(document.querySelectorAll<HTMLElement>("[style]"))
    .filter((element) => {
      const style = element.getAttribute("style") ?? "";
      return codeFontPattern.test(style) || preformattedWhitespacePattern.test(style);
    });
  const normalizedPlainText = normalizeCode(plainText);
  const structuredCode = pre ?? code;
  const explicit = structuredCode !== null &&
    normalizeCode(structuredCode.textContent ?? "") === normalizedPlainText;
  const meaningfulTopLevelNodes = Array.from(document.body.childNodes).filter(
    (node) => node.nodeType === 1 ||
      (node.nodeType === 3 && Boolean(node.textContent?.trim())),
  );
  const styled = styledCode.some(
    (element) => meaningfulTopLevelNodes.every(
      (node) => node === element || element.contains(node),
    ),
  );
  return {
    explicit,
    language,
    mixed: (structuredCode !== null || styledCode.length > 0) &&
      !explicit && !styled,
    styled,
  };
}

function jsonLanguage(code: string) {
  if (!/^[\[{]/u.test(code.trim())) return "";
  try {
    const value = JSON.parse(code) as unknown;
    return value !== null && typeof value === "object" ? "json" : "";
  } catch {
    return "";
  }
}

function scoredLanguage(code: string) {
  const json = jsonLanguage(code);
  if (json) return json;

  if (
    /(?:^|\n)\s*(?:interface|type|enum|namespace)\s+[A-Za-z_$][\w$]*/u.test(code) ||
    /(?:^|\n)\s*(?:import|export)\s+type\b/u.test(code)
  ) return "ts";

  let javascriptScore = 0;
  if (/(?:^|\n)\s*(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=/u.test(code)) javascriptScore += 2;
  if (/\b(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/u.test(code) || /=>/u.test(code)) javascriptScore += 2;
  if (/(?:^|\n)\s*(?:if|for|while|switch)\s*\(/u.test(code)) javascriptScore += 1;
  if (/\b(?:console|document|window)\.[A-Za-z_$][\w$]*\s*\(/u.test(code)) javascriptScore += 1;
  if (/===|!==|\?\?|\?\./u.test(code)) javascriptScore += 1;
  if (javascriptScore >= 3) return "javascript";

  let pythonScore = 0;
  if (/(?:^|\n)\s*(?:async\s+)?def\s+\w+\s*\([^\n]*\)\s*:/u.test(code)) pythonScore += 3;
  if (/(?:^|\n)\s*class\s+\w+(?:\([^\n]*\))?\s*:/u.test(code)) pythonScore += 2;
  if (/(?:^|\n)\s*(?:from\s+\S+\s+import|import\s+\S+)/u.test(code)) pythonScore += 1;
  if (/(?:^|\n)[ \t]+(?:return|yield|raise|print)\b/u.test(code)) pythonScore += 1;
  const pythonCalls = code.split("\n").filter((line) =>
    /^\s*(?:print|len|range|open|enumerate|zip)\s*\(/u.test(line)
  ).length;
  if (pythonCalls > 0) pythonScore += pythonCalls > 1 ? 3 : 2;
  if (pythonScore >= 3) return "python";

  if (/^\s*<!doctype\s+html/iu.test(code) || /<([A-Za-z][\w-]*)\b[^>]*>[\s\S]*<\/\1>/u.test(code)) return "html";
  if (/(?:^|\n)\s*(?:[#.][\w-]+|[a-z][\w-]*(?:\s+[a-z][\w-]*)?|:[\w-]+)\s*\{\s*\n\s*(?:--)?[\w-]+\s*:[^\n;]+;?/iu.test(code)) return "css";
  if (/(?:^|\n)\s*(?:SELECT\b[\s\S]+\bFROM\b|INSERT\s+INTO\b|CREATE\s+TABLE\b|UPDATE\b[\s\S]+\bSET\b)/iu.test(code)) return "sql";
  if (/^\s*#!\s*\/.*\b(?:bash|sh|zsh)\b/u.test(code)) return "bash";
  const shellCommands = code.split("\n").filter((line) =>
    /^\s*(?:\$\s*)?(?:npm|pnpm|yarn|bun|git|cd|mkdir|rm|cp|mv|curl|wget|docker|cargo|go|python|node|npx)\b/u.test(line)
  ).length;
  if (shellCommands >= 2) return "bash";
  if (/(?:^|\n)\s*(?:package\s+\w+|func\s+\w+\s*\()/u.test(code)) return "go";
  if (/(?:^|\n)\s*(?:fn\s+\w+\s*\(|let\s+mut\b|impl\s+\w+|use\s+[\w:]+::)/u.test(code)) return "rust";
  return "";
}

function genericCodeScore(code: string) {
  const lines = code.split("\n");
  let score = 0;
  if (/[{}]/u.test(code) && code.includes("{") && code.includes("}")) score += 2;
  if (lines.filter((line) => /;\s*$/u.test(line)).length >= 2) score += 2;
  if (lines.some((line) => /^[ \t]{2,}\S/u.test(line))) score += 1;
  if (/(?:^|\n)\s*(?:class|def|fn|func|function|if|for|while|return|import|export|package|public|private|protected)\b/u.test(code)) score += 2;
  if (/=>|===|!==|:=|::|->/u.test(code)) score += 2;
  if (/\w+\s*\([^\n)]*\)/u.test(code)) score += 1;
  return score;
}

export function detectCodePaste(source: CodePasteSource): DetectedCodePaste | null {
  const code = normalizeCode(source.text);
  if (!code.trim()) return null;

  const editor = editorCodeDetails(source.editorData);
  const html = htmlCodeDetails(source.html, code);
  if (html.mixed && !editor.explicit) return null;
  const language = editor.language || html.language || scoredLanguage(code);
  const score = genericCodeScore(code);
  // Rich articles often contain one inline monospace span; styled HTML alone
  // is not strong enough evidence to turn the whole paste into a code block.
  const explicit = editor.explicit || html.explicit ||
    (html.styled && (Boolean(language) || score >= 4));
  const lines = code.split("\n").filter((line) => line.trim()).length;

  if (!explicit) {
    if (!code.includes("\n") || lines < 2) return null;
    if (fencedMarkdownPattern.test(code) || looksLikeMarkdownSource(code)) return null;
  } else if (lines < 1) {
    return null;
  }

  if (!explicit && !language && score < 4) return null;
  return { code, language };
}
