import type { Plugin } from "vite";

const katexFontFacePattern = /@font-face\s*\{[^}]*font-family\s*:\s*["']?KaTeX_[^}]*\}/g;
const fontSourcePattern = /src\s*:\s*([\s\S]*?);(?=\s*(?:font-|}))/;
const legacyKatexFontAssetPattern = /(?:^|\/)KaTeX_[^/]+\.(?:ttf|woff)$/i;

export function keepWoff2KatexFontSources(css: string) {
  return css.replace(katexFontFacePattern, (fontFace) => {
    return fontFace.replace(fontSourcePattern, (declaration, sources: string) => {
      const woff2Sources = sources
        .split(/,\s*(?=url\()/)
        .filter((source) =>
          /\.woff2(?:["')?#]|$)/i.test(source)
          || /format\(\s*["']?woff2["']?\s*\)/i.test(source)
        );

      return woff2Sources.length > 0
        ? `src: ${woff2Sources.join(", ")};`
        : declaration;
    });
  });
}

export function isLegacyKatexFontAsset(fileName: string) {
  return legacyKatexFontAssetPattern.test(fileName);
}

export function canDeleteLegacyKatexFontAsset(fileName: string, cssSources: string[]) {
  return isLegacyKatexFontAsset(fileName)
    && cssSources.every((css) => !css.includes(fileName));
}

export function katexFontsPlugin(): Plugin {
  return {
    apply: "build",
    enforce: "post",
    name: "markra-katex-fonts",
    generateBundle(_options, bundle) {
      const cssSources: string[] = [];

      for (const output of Object.values(bundle)) {
        if (output.type !== "asset" || !output.fileName.endsWith(".css")) continue;

        const css = typeof output.source === "string"
          ? output.source
          : new TextDecoder().decode(output.source);
        const optimizedCss = keepWoff2KatexFontSources(css);
        output.source = optimizedCss;
        cssSources.push(optimizedCss);
      }

      for (const fileName of Object.keys(bundle)) {
        // Keep any fallback that a future KaTeX or Vite output still references;
        // deleting is safe only after the rewritten CSS has stopped using it.
        if (canDeleteLegacyKatexFontAsset(fileName, cssSources)) delete bundle[fileName];
      }
    }
  };
}
