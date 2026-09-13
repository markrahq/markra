import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../../runtime";
import { getStoredThemeFiles, normalizeThemeFiles, saveStoredThemeFiles } from "./theme-files";

afterEach(resetAppRuntimeForTests);

it("accepts only CSS file names and preserves independent appearance choices", () => {
  expect(normalizeThemeFiles({ light: "Mock Light.css", dark: "mock-dark.CSS" })).toEqual({
    light: "Mock Light.css", dark: "mock-dark.CSS"
  });
  for (const value of [null, 12, "../mock.css", "a/b.css", "a\\b.css", "/mock.css", "mock.txt", "mock\0.css"]) {
    expect(normalizeThemeFiles({ light: value }).light).toBeNull();
  }
});

it("persists local file selections separately from portable theme CSS", async () => {
  configureAppRuntime(createDefaultAppRuntime());
  expect(await getStoredThemeFiles()).toEqual({ light: null, dark: null });
  await saveStoredThemeFiles({ light: "mock.css", dark: null });
  expect(await getStoredThemeFiles()).toEqual({ light: "mock.css", dark: null });
  await saveStoredThemeFiles({ light: null, dark: "night.css" });
  expect(await getStoredThemeFiles()).toEqual({ light: null, dark: "night.css" });
});
