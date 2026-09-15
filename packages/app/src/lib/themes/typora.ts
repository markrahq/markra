import { lexer } from "css-tree";
import lightTemplate from "../../themes/light.css?raw";
import darkTemplate from "../../themes/dark.css?raw";
import { readTyporaCascade, type ThemeRole, type TyporaWarning } from "./typora-cascade";

export type ThemeCompatibility = { kind: "native" | "typora"; warnings: TyporaWarning[] };
export type AdaptedTheme = ThemeCompatibility & { css: string };

const rootSelector = ':root[data-theme="custom"]';
const paperSelector = `${rootSelector} .markdown-paper[data-editor-theme="custom"]`;
const palette = {
  "--bg-color": "--bg-primary", "--text-color": "--text-primary", "--primary-color": "--accent",
  "--side-bar-bg-color": "--bg-secondary", "--md-char-color": "--text-md-char",
  "--control-text-color": "--text-secondary",
  "--item-hover-bg-color": "--bg-hover", "--active-file-bg-color": "--bg-active"
};

function rule(selector: string, values: Map<string, string>) {
  return values.size ? `${selector} {\n${[...values].map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}` : "";
}

export function adaptTyporaTheme(css: string, appearance: "light" | "dark" = "light"): AdaptedTheme {
  const cascade = readTyporaCascade(css);
  if (!cascade) return { css, kind: "native", warnings: [] };
  const root = new Map<string, string>();
  const paper = new Map<string, string>();
  const scoped: string[] = [];
  const set = (values: Map<string, string>, name: string, value: string | undefined) => {
    if (value !== undefined) values.set(name, value);
  };
  const variable = (name: string, property: string, role: ThemeRole = "body") => {
    const value = cascade.value(role, name);
    if (value === undefined) return undefined;
    if (lexer.matchProperty(property, value).matched) return value;
    cascade.warnings.add("unsupported");
    return undefined;
  };

  for (const [source, target] of Object.entries(palette)) set(root, target, variable(source, "color"));
  set(root, "--bg-primary", cascade.background("body") ?? cascade.background("html"));
  set(root, "--text-primary", cascade.validated("body", "color"));
  set(root, "--text-heading", root.get("--text-primary"));
  set(root, "color-scheme", cascade.validated("body", "color-scheme", true));
  set(paper, "--editor-paper-bg", cascade.background("write"));
  set(paper, "--editor-text-primary", cascade.validated("write", "color"));
  set(paper, "--editor-text-heading", paper.get("--editor-text-primary"));
  set(paper, "--editor-font-family", cascade.validated("write", "font-family"));
  set(paper, "--editor-code-font-family", variable("--monospace", "font-family", "write"));
  set(paper, "--editor-link-color", cascade.validated("link", "color", false));
  set(paper, "--editor-inline-code-text", cascade.validated("inline", "color", false));
  set(paper, "--editor-inline-code-bg", cascade.background("inline"));
  set(paper, "--editor-code-text", cascade.validated("code", "color", false));
  set(paper, "--editor-code-bg", cascade.background("code"));

  for (const role of ["h1", "h2", "h3", "h4", "h5", "h6"] as const) {
    set(paper, `--editor-${role}-color`, cascade.validated(role, "color", false));
    set(paper, `--editor-${role}-font-weight`, cascade.validated(role, "font-weight", false));
    const pixels = cascade.fontSize(role);
    if (pixels !== undefined) {
      const size = `${pixels}px`;
      set(paper, `--editor-${role}-font-size`, size);
      if (role === "h1" || role === "h2") set(paper, `--editor-${role}-font-size-compact`, size);
    }
    const heading = new Map<string, string>();
    set(heading, "--editor-heading-font-family", cascade.validated(role, "font-family", false));
    set(heading, "--editor-heading-letter-spacing", cascade.validated(role, "letter-spacing", false));
    scoped.push(rule(`${paperSelector} :is(.cm-markra-${role}, ${role})`, heading));
  }
  for (const role of ["keyword", "string", "number", "title", "type", "meta"] as const) {
    set(paper, `--editor-hl-${role}`, cascade.validated(role, "color", false));
  }
  for (const [role, selector] of [
    ["code", ":is(.cm-markra-code-content-line, pre code)"],
    ["inline", ":is(.cm-markra-inline-code, :not(pre) > code)"]
  ] as const) {
    const font = new Map<string, string>();
    set(font, "--editor-code-font-family", cascade.validated(role, "font-family", false));
    scoped.push(rule(`${paperSelector} ${selector}`, font));
  }
  const comment = new Map<string, string>();
  set(comment, "--editor-text-secondary", cascade.validated("comment", "color", false));
  scoped.push(rule(`${paperSelector} :is(.hljs-comment, .hljs-quote)`, comment));

  // Only emitted semantic variables reach the editor; arbitrary source layout rules never touch CM-managed lines.
  const converted = [appearance === "dark" ? darkTemplate : lightTemplate, rule(rootSelector, root), rule(paperSelector, paper), ...scoped];
  return { css: converted.filter(Boolean).join("\n\n"), kind: "typora", warnings: [...cascade.warnings].sort() };
}
