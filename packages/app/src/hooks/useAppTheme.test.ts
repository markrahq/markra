import { act, renderHook, waitFor } from "@testing-library/react";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../runtime";
import { saveStoredCustomThemeCss, saveStoredThemePreferences } from "../lib/settings/app-settings";
import { saveStoredThemeFiles } from "../lib/settings/theme-files";
import { useAppTheme } from "./useAppTheme";

afterEach(() => {
  resetAppRuntimeForTests();
  document.getElementById("markra-custom-theme-style")?.remove();
  delete document.documentElement.dataset.theme;
});

it("applies file CSS for each appearance and restores inline CSS when the file is unavailable", async () => {
  const read = vi.fn(async (file: string) => `/* ${file} */`);
  configureAppRuntime({ ...createDefaultAppRuntime(), themes: {
    chooseFolder: async () => null,
    list: async () => ({ directory: "/mock/themes", files: ["light.css", "dark.css"] }),
    read, openFolder: async () => undefined
  } });
  await saveStoredThemePreferences({ appearanceMode: "light", lightTheme: "light", darkTheme: "dark", customThemeEnabled: true });
  await saveStoredCustomThemeCss({ light: "/* inline light */", dark: "/* inline dark */" });
  await saveStoredThemeFiles({ light: "light.css", dark: "dark.css" });
  const { result } = renderHook(useAppTheme);
  await waitFor(() => expect(result.current.ready).toBe(true));
  const css = () => document.getElementById("markra-custom-theme-style")?.textContent;
  expect(css()).toBe("/* light.css */");
  act(() => result.current.selectAppearanceMode("dark"));
  expect(css()).toBe("/* dark.css */");
  read.mockRejectedValue(new Error("missing"));
  await act(() => result.current.themeFiles.refresh());
  expect(css()).toBe("/* inline dark */");
  act(() => result.current.toggleCustomTheme());
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(css()).toBeUndefined();
});

it("waits for selected file CSS on first paint and does not truncate large stylesheets", async () => {
  let resolveCss!: (css: string) => unknown;
  configureAppRuntime({ ...createDefaultAppRuntime(), themes: {
    chooseFolder: async () => null,
    list: async () => ({ directory: "/mock/themes", files: ["large.css"] }),
    read: () => new Promise<string>((resolve) => { resolveCss = resolve; }),
    openFolder: async () => undefined
  } });
  await saveStoredThemePreferences({ appearanceMode: "light", lightTheme: "light", darkTheme: "dark", customThemeEnabled: true });
  await saveStoredThemeFiles({ light: "large.css", dark: null });
  const { result } = renderHook(useAppTheme);
  await waitFor(() => expect(resolveCss).toBeDefined());
  expect(result.current.ready).toBe(false);
  const css = `/* ${"x".repeat(60_000)} */`;
  await act(async () => { resolveCss(css); });
  expect(result.current.ready).toBe(true);
  expect(document.getElementById("markra-custom-theme-style")?.textContent).toBe(css);
});

it("adapts Typora CSS from settings without changing the saved source", async () => {
  const runtime = createDefaultAppRuntime();
  configureAppRuntime(runtime);
  const source = '#write h1 { color: #aabbcc; } .cm-s-inner .cm-keyword { color: #bbccdd; }';
  await saveStoredThemePreferences({ appearanceMode: "light", lightTheme: "light", darkTheme: "dark", customThemeEnabled: true });
  await saveStoredCustomThemeCss({ light: source, dark: '#write { color: #ddeeff; }' });
  const { result } = renderHook(useAppTheme);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(document.getElementById("markra-custom-theme-style")?.textContent).toContain("--editor-h1-color: #aabbcc;");
  expect(result.current.lightCustomThemeCss).toBe(source);
  expect(result.current.themeCompatibility.light.kind).toBe("typora");
  act(() => result.current.selectAppearanceMode("dark"));
  expect(document.getElementById("markra-custom-theme-style")?.textContent).toContain("--editor-text-primary: #ddeeff;");
});

it("adapts refreshed Typora theme files and restores native CSS when their source changes", async () => {
  let css = '#write { color: #112233; }';
  configureAppRuntime({ ...createDefaultAppRuntime(), themes: {
    chooseFolder: async () => null,
    list: async () => ({ directory: "/mock/themes", files: ["typora.css"] }),
    read: async () => css, openFolder: async () => undefined
  } });
  await saveStoredThemePreferences({ appearanceMode: "light", lightTheme: "light", darkTheme: "dark", customThemeEnabled: true });
  await saveStoredThemeFiles({ light: "typora.css", dark: null });
  const { result } = renderHook(useAppTheme);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.themeCompatibility.light.kind).toBe("typora");
  expect(document.getElementById("markra-custom-theme-style")?.textContent).toContain("--editor-text-primary: #112233;");
  css = ':root[data-theme="custom"] { --accent: #556677; }';
  await act(() => result.current.themeFiles.refresh());
  expect(result.current.themeCompatibility.light.kind).toBe("native");
  expect(document.getElementById("markra-custom-theme-style")?.textContent).toBe(css);
});
