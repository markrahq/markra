type MarkraMermaidTheme = "base" | "dark" | "default" | "forest" | "neutral";
type MermaidRenderer = typeof import("mermaid")["default"];

type RenderMermaidOptions = {
  idPrefix?: string;
  theme?: MarkraMermaidTheme | string | null;
};

const darkMermaidThemeNames = new Set([
  "dark",
  "github-dark",
  "night",
  "one-dark",
  "one-dark-pro",
  "solarized-dark",
  "nord",
  "catppuccin-mocha"
]);

let configuredTheme: MarkraMermaidTheme | null = null;
let mermaidRenderer: Promise<MermaidRenderer> | null = null;
let mermaidRenderSequence = 0;

export function isMermaidLanguage(language: string) {
  return language.toLowerCase() === "mermaid";
}

function isDarkMermaidThemeName(theme: string) {
  return darkMermaidThemeNames.has(theme.toLowerCase());
}

export function mermaidThemeFromElement(element: Element | null): MarkraMermaidTheme {
  const theme = element?.closest(".markdown-paper")?.getAttribute("data-editor-theme") ??
    element?.ownerDocument.documentElement.getAttribute("data-theme") ??
    "";

  return isDarkMermaidThemeName(theme) ? "dark" : "default";
}

function normalizeMermaidTheme(theme: RenderMermaidOptions["theme"]): MarkraMermaidTheme {
  if (theme === "base" || theme === "dark" || theme === "forest" || theme === "neutral") return theme;
  return "default";
}

function loadMermaidRenderer() {
  mermaidRenderer ??= import("mermaid").then((module) => module.default);
  return mermaidRenderer;
}

function configureMermaid(renderer: MermaidRenderer, theme: MarkraMermaidTheme) {
  if (configuredTheme === theme) return;

  renderer.initialize({
    flowchart: {
      htmlLabels: true
    },
    securityLevel: "antiscript",
    startOnLoad: false,
    theme
  });
  configuredTheme = theme;
}

export async function renderMermaidToSvg(source: string, options: RenderMermaidOptions = {}) {
  const definition = source.trim();
  if (!definition) return "";

  const theme = normalizeMermaidTheme(options.theme);
  const renderer = await loadMermaidRenderer();
  configureMermaid(renderer, theme);

  const idPrefix = options.idPrefix ?? "markra-mermaid";
  mermaidRenderSequence += 1;
  const result = await renderer.render(`${idPrefix}-${mermaidRenderSequence}`, definition);

  return result.svg;
}
