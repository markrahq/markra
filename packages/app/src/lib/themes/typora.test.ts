import { generate, parse, walk } from "css-tree";
import { adaptTyporaTheme } from "./typora";

function variables(css: string, selectorIncludes?: string) {
  const values: Record<string, string> = {};
  const sheet = parse(css);
  walk(sheet, {
    visit: "Rule",
    enter(rule) {
      if (selectorIncludes && (!rule.prelude || !generate(rule.prelude).includes(selectorIncludes))) return;
      rule.block.children.forEach((node) => {
        if (node.type === "Declaration") values[node.property] = generate(node.value).trim();
      });
    }
  });
  return values;
}

describe("basic Typora theme compatibility", () => {
  it("leaves native CSS and marker text in comments or strings unchanged", () => {
    for (const css of [
      ':root[data-theme="custom"] { --bg-primary: #abcdef; }',
      '/* #write { color: red } */ p::before { content: "#write .md-fences"; }',
      '.markdown-paper { color: red; } #write { color: blue; }',
      'p { color:'
    ]) {
      expect(adaptTyporaTheme(css).css).toBe(css);
      expect(adaptTyporaTheme(css).kind).toBe("native");
    }
  });

  it("maps Typora palette variables and installed fonts without applying its global CSS", () => {
    const result = adaptTyporaTheme(`
      :root { --bg-color: #faf3e0; --text-color: #312a20; --primary-color: #965424;
        --side-bar-bg-color: #eee5cf; --control-text-color: #665544; --monospace: "Mock Mono", monospace; }
      body { font-family: "Mock Serif", serif; }
      #write { color: var(--text-color); }
    `);
    expect(result.kind).toBe("typora");
    expect(variables(result.css)).toMatchObject({
      "--bg-primary": "#faf3e0", "--text-primary": "#312a20", "--accent": "#965424",
      "--bg-secondary": "#eee5cf", "--text-secondary": "#665544", "--editor-code-font-family": '"Mock Mono",monospace',
      "--editor-font-family": '"Mock Serif",serif'
    });
    expect(result.css).not.toContain("#write");
    expect(result.css).not.toMatch(/(?:^|\})\s*(?:html|body)\s*\{/);
  });

  it("honors specificity, important declarations, and source order for grouped headings", () => {
    const result = adaptTyporaTheme(`
      #write h1 { color: #123456; }
      h1, h2 { color: #abcdef; font-weight: 600; }
      h2 { color: #222222 !important; }
      #write h2 { color: #999999; }
      h3 { color: #333333; } h3 { color: #444444; }
    `);
    expect(variables(result.css)).toMatchObject({
      "--editor-h1-color": "#123456", "--editor-h2-color": "#222222",
      "--editor-h3-color": "#444444", "--editor-h1-font-weight": "600"
    });
  });

  it("resolves inherited variables at their defining scope, including fallbacks", () => {
    const result = adaptTyporaTheme(`
      :root { --base: #123456; --heading: var(--base); }
      #write { --base: #abcdef; }
      h1 { color: var(--heading); }
      h2 { --base: #345678; color: var(--base); }
      h3 { color: var(--missing, var(--base)); }
    `);
    expect(variables(result.css)).toMatchObject({
      "--editor-h1-color": "#123456", "--editor-h2-color": "#345678", "--editor-h3-color": "#abcdef"
    });
  });

  it("resolves rem and em heading sizes against the source document without resizing app chrome", () => {
    const result = adaptTyporaTheme('html { font-size: 20px; } #write { font-size: 18px; } h1 { font-size: 2rem; } h2 { font-size: 1.5em; }');
    expect(variables(result.css)).toMatchObject({ "--editor-h1-font-size": "40px", "--editor-h2-font-size": "27px" });
    expect(result.css).not.toMatch(/(?:^|[;{])\s*font-size\s*:/);
  });

  it("preserves per-heading fonts and maps inline, fenced code and common syntax colors", () => {
    const result = adaptTyporaTheme(`
      #write h1 { font-family: "Mock Title", serif; }
      code { color: #112233; background: #eeeeee; }
      pre.md-fences { font-family: "Mock Code", monospace; background-color: #121212; color: #eeeeee; }
      .cm-s-inner .cm-keyword { color: #ff8844; }
      .cm-s-inner .cm-string { color: #66cc99; }
      .cm-s-inner .cm-number { color: #cc99ee; }
      a { color: #336699; }
    `);
    expect(variables(result.css, ".cm-markra-h1")["--editor-heading-font-family"]).toBe('"Mock Title",serif');
    expect(variables(result.css)).toMatchObject({
      "--editor-inline-code-text": "#112233", "--editor-inline-code-bg": "#eeeeee",
      "--editor-code-font-family": '"Mock Code",monospace', "--editor-code-bg": "#121212",
      "--editor-code-text": "#eeeeee", "--editor-hl-keyword": "#ff8844",
      "--editor-hl-string": "#66cc99", "--editor-hl-number": "#cc99ee", "--editor-link-color": "#336699"
    });
  });

  it("does not apply layout, pseudo-elements, conditional rules or external resources", () => {
    const result = adaptTyporaTheme(`
      @import url("https://example.test/theme.css");
      @font-face { font-family: "Mock Asset"; src: url("fonts/mock.woff2"); }
      #write { color: #123456; padding: 50px; height: 2px; background: url("mock.png"); }
      #write h1::before { content: "decoration"; }
      .cm-s-inner { line-height: 90px; display: none; }
      @media print { #write { color: #999999; } }
      @media (max-width: 700px) { h1 { font-size: 4px; } }
    `);
    expect(result.warnings).toEqual(expect.arrayContaining(["unsupported", "resources"]));
    expect(result.css).not.toMatch(/url\(|@import|@font-face|display\s*:|height\s*:2px|90px|#999999|decoration/);
    expect(variables(result.css)["--editor-text-primary"]).toBe("#123456");
  });

  it("reports unresolvable values and invalid declarations while retaining valid conversions", () => {
    const result = adaptTyporaTheme('#write { --a: var(--b); --b: var(--a); color: var(--a); } h1 { color: #123456; broken; }');
    expect(result.warnings).toContain("syntax");
    expect(result.warnings).toContain("unsupported");
    expect(variables(result.css)["--editor-h1-color"]).toBe("#123456");
    expect(result.css).not.toContain("var(--a)");
  });

  it("uses the requested appearance for missing palette values and generates idempotent CSS", () => {
    const result = adaptTyporaTheme('#write h1 { color: #aabbcc; }', "dark");
    expect(result.css).toContain("color-scheme: dark");
    expect(variables(result.css)["--bg-primary"]).toBe("#0d1117");
    expect(adaptTyporaTheme(result.css).css).toBe(result.css);
  });

  it("ignores invalid declarations before applying the cascade and skips unsupported heading sizes", () => {
    const result = adaptTyporaTheme('#write h1 { color: #123456; color: definitely-not-a-color; font-size: calc(2rem + 4px); }');
    expect(variables(result.css)["--editor-h1-color"]).toBe("#123456");
    expect(variables(result.css)["--editor-h1-font-size"]).toBe("44px");
    expect(result.warnings).toContain("unsupported");
  });

  it("treats variable cycles as invalid even when a cycle member has a fallback", () => {
    const result = adaptTyporaTheme(':root { --a: var(--b); --b: var(--a, #112233); } #write h1 { color: var(--a, #abcdef); }');
    expect(variables(result.css)["--editor-h1-color"]).toBe("#abcdef");
  });

  it("inherits computed font sizes without multiplying a parent's relative units again", () => {
    const result = adaptTyporaTheme('html { font-size: 16px; } body { font-size: 2em; } #write { font-size: inherit; } h1 { font-size: INHERIT; }');
    expect(variables(result.css)["--editor-h1-font-size"]).toBe("32px");
  });

  it("applies custom-property initial, inherit and unset before resolving var fallbacks", () => {
    const result = adaptTyporaTheme('#write { --tone: #123456; } h1 { --tone: initial; color: var(--tone, #abcdef); } h2 { --tone: inherit; color: var(--tone); } h3 { --tone: unset; color: var(--tone); }');
    expect(variables(result.css)).toMatchObject({
      "--editor-h1-color": "#abcdef", "--editor-h2-color": "#123456", "--editor-h3-color": "#123456"
    });
  });

  it("detects dependency cycles in unused fallbacks without invalidating their dependents", () => {
    const result = adaptTyporaTheme('#write { --safe:#aabbcc; --a:var(--safe,var(--a)); --dependent:var(--a,#445566); } h1 { color:var(--a,#112233); } h2 { color:var(--dependent); }');
    expect(variables(result.css)).toMatchObject({ "--editor-h1-color": "#112233", "--editor-h2-color": "#445566" });
  });
});
