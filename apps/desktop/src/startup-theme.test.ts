import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const startupScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!startupScript) throw new Error("Desktop startup script is missing");

function runStartupTheme(search: string, systemDark: boolean) {
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  const styles: Array<{ textContent?: string }> = [];
  runInNewContext(startupScript!, {
    URLSearchParams,
    window: { location: { search }, matchMedia: () => ({ matches: systemDark }) },
    document: {
      documentElement: root,
      createElement: () => ({}),
      head: { append: (style: { textContent?: string }) => styles.push(style) }
    }
  });
  return { root, styles };
}

describe("desktop startup theme", () => {
  it.each([
    ["light", true, "sepia", "#ffffff"],
    ["dark", false, "night", "#1e1e1e"]
  ])("uses saved %s appearance before React on the opposite system theme", (appearance, systemDark, theme, background) => {
    const { root, styles } = runStartupTheme(
      `?startupAppearanceMode=${appearance}&startupLightTheme=sepia&startupDarkTheme=night`,
      systemDark
    );
    expect(root.dataset.theme).toBe(theme);
    expect(root.style.backgroundColor).toBe(background);
    expect(root.style.colorScheme).toBe(appearance);
    expect(styles[0]?.textContent).toContain(`background:${background}`);
    expect(root.dataset.window).toBeUndefined();
  });

  it.each([true, false])("resolves system appearance from the current system (dark=%s)", (systemDark) => {
    const { root } = runStartupTheme("?startupAppearanceMode=system", systemDark);
    expect(root.dataset.theme).toBe(systemDark ? "dark" : "light");
  });

  it("defaults a settings window without startup preferences to the system appearance", () => {
    const { root } = runStartupTheme("?settings=1", false);
    expect(root.dataset.window).toBe("settings");
    expect(root.dataset.theme).toBe("light");
  });
});
