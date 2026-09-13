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
