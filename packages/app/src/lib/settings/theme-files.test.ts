import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../../runtime";
import { getStoredThemeFiles, getStoredThemeSettings, normalizeThemeFiles, saveStoredThemeFiles, saveStoredThemeSettings } from "./theme-files";

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

it("migrates existing selections to the default folder and stores folder choices atomically", async () => {
  const runtime = createDefaultAppRuntime();
  configureAppRuntime(runtime);
  const store = await runtime.settings.loadStore("settings.json", { autoSave: false, defaults: {} });
  await store.set("themeFiles", { light: "legacy.css", dark: null });
  expect(await getStoredThemeSettings()).toEqual({ directory: null, selection: { light: "legacy.css", dark: null } });
  await saveStoredThemeSettings({ directory: "/mock/custom", selection: { light: "custom.css", dark: null } });
  expect(await getStoredThemeSettings()).toEqual({ directory: "/mock/custom", selection: { light: "custom.css", dark: null } });
  await saveStoredThemeFiles({ light: null, dark: "night.css" });
  expect(await getStoredThemeSettings()).toEqual({ directory: "/mock/custom", selection: { light: null, dark: "night.css" } });
});

it("restores the cached source when saving the new folder fails", async () => {
  const runtime = createDefaultAppRuntime();
  configureAppRuntime(runtime);
  const previous = { directory: "/mock/previous", selection: { light: "previous.css", dark: null } };
  await saveStoredThemeSettings(previous);
  const store = await runtime.settings.loadStore("settings.json", { autoSave: false, defaults: {} });
  configureAppRuntime({ ...runtime, settings: { loadStore: async () => ({ ...store, save: async () => { throw new Error("disk full"); } }) } });
  await expect(saveStoredThemeSettings({ directory: "/mock/new", selection: { light: null, dark: null } })).rejects.toThrow("disk full");
  expect(await getStoredThemeSettings()).toEqual(previous);
});

it("does not roll back a newer source after a failed save", async () => {
  const runtime = createDefaultAppRuntime();
  configureAppRuntime(runtime);
  const store = await runtime.settings.loadStore("settings.json", { autoSave: false, defaults: {} });
  configureAppRuntime({ ...runtime, settings: { loadStore: async () => ({ ...store, save: async () => {
    await store.set("themeFiles", { directory: "/mock/newer", light: "newer.css", dark: null });
    throw new Error("save failed");
  } }) } });
  await expect(saveStoredThemeSettings({ directory: "/mock/older", selection: { light: null, dark: null } })).rejects.toThrow("save failed");
  expect(await getStoredThemeSettings()).toEqual({ directory: "/mock/newer", selection: { light: "newer.css", dark: null } });
});
