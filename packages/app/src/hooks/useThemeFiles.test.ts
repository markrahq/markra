import { act, renderHook, waitFor } from "@testing-library/react";
import { configureAppRuntime, createDefaultAppRuntime, getAppRuntime, resetAppRuntimeForTests, type RuntimeEvent } from "../runtime";
import { getStoredThemeSettings, saveStoredThemeFiles, saveStoredThemeSettings } from "../lib/settings/theme-files";
import { useThemeFiles } from "./useThemeFiles";

const list = vi.fn();
const read = vi.fn();
const openFolder = vi.fn();
const chooseFolder = vi.fn();
const emit = vi.fn();
const listeners = new Set<(event: RuntimeEvent<unknown>) => unknown>();

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  list.mockImplementation(async (directory?: string | null) => ({ directory: directory ?? "/mock/themes", files: ["light.css", "dark.css"] }));
  chooseFolder.mockResolvedValue(null);
  read.mockImplementation(async (name: string) => `/* ${name} */`);
  configureAppRuntime({
    ...createDefaultAppRuntime(),
    themes: { list, read, openFolder, chooseFolder },
    events: {
      isAvailable: () => true,
      emit,
      async listen(_event, handler) {
        listeners.add(handler as (event: RuntimeEvent<unknown>) => unknown);
        return () => listeners.delete(handler as (event: RuntimeEvent<unknown>) => unknown);
      }
    }
  });
});

afterEach(resetAppRuntimeForTests);

it("loads both selected files on startup and rereads edits on refresh", async () => {
  await saveStoredThemeFiles({ light: "light.css", dark: "dark.css" });
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.css).toEqual({ light: "/* light.css */", dark: "/* dark.css */" });
  read.mockResolvedValue("/* edited */");
  await act(() => result.current.refresh());
  expect(result.current.css.light).toBe("/* edited */");
  expect(emit).toHaveBeenCalledWith("markra://theme-files-changed", {
    directory: null,
    selection: { light: "light.css", dark: "dark.css" }
  });
});

it("selects a file without discarding the other appearance or inline CSS", async () => {
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(() => result.current.select("light", "light.css"));
  await act(() => result.current.select("dark", "dark.css"));
  await act(() => result.current.select("light", null));
  expect(result.current.selection).toEqual({ light: null, dark: "dark.css" });
  expect(result.current.css).toEqual({ light: null, dark: "/* dark.css */" });
});

it("falls back when a file is missing and recovers after it is restored", async () => {
  await saveStoredThemeFiles({ light: "light.css", dark: null });
  read.mockRejectedValue(new Error("missing file"));
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.css.light).toBeNull();
  expect(result.current.failedFiles).toEqual(["light.css"]);
  expect(result.current.selection.light).toBe("light.css");
  read.mockResolvedValue("/* restored */");
  await act(() => result.current.refresh());
  expect(result.current.css.light).toBe("/* restored */");
  expect(result.current.failedFiles).toEqual([]);
});

it("accepts cross-window selection changes without rereading stale store values", async () => {
  const { result, unmount } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => {
    for (const listener of listeners) listener({ payload: { selection: { light: "light.css", dark: null } } });
  });
  await waitFor(() => expect(result.current.css.light).toBe("/* light.css */"));
  unmount();
  expect(listeners.size).toBe(0);
});

it("ignores an old read that finishes after a newer refresh", async () => {
  await saveStoredThemeFiles({ light: "light.css", dark: null });
  let finishOldRead!: (css: string) => unknown;
  read.mockImplementationOnce(() => new Promise<string>((resolve) => { finishOldRead = resolve; }));
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(read).toHaveBeenCalled());
  read.mockResolvedValue("/* newest */");
  await act(() => result.current.refresh());
  await act(async () => { finishOldRead("/* stale */"); });
  expect(result.current.css.light).toBe("/* newest */");
});

it("keeps the editor ready when directory access fails", async () => {
  list.mockRejectedValue(new Error("permission denied"));
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.error).toBe(true);
  expect(result.current.loading).toBe(false);
});

it("does not read local themes in the web runtime", () => {
  configureAppRuntime(createDefaultAppRuntime());
  const { result } = renderHook(useThemeFiles);
  expect(result.current.available).toBe(false);
  expect(result.current.ready).toBe(true);
  expect(list).not.toHaveBeenCalled();
});

it("loads and opens the saved custom folder and reads files within that folder", async () => {
  await saveStoredThemeSettings({ directory: "/mock/custom", selection: { light: "light.css", dark: null } });
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(list).toHaveBeenCalledWith("/mock/custom");
  expect(read).toHaveBeenCalledWith("light.css", "/mock/custom");
  expect(result.current.directory).toBe("/mock/custom");
  await act(() => result.current.openFolder());
  expect(openFolder).toHaveBeenCalledWith("/mock/custom");
});

it("selects a new folder, clears old file choices and synchronizes the whole source", async () => {
  await saveStoredThemeFiles({ light: "light.css", dark: "dark.css" });
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  chooseFolder.mockResolvedValue("/mock/new");
  await act(() => result.current.chooseFolder("Choose theme folder"));
  expect(chooseFolder).toHaveBeenCalledWith({ title: "Choose theme folder", defaultPath: "/mock/themes" });
  expect(result.current.directory).toBe("/mock/new");
  expect(result.current.customDirectory).toBe("/mock/new");
  expect(result.current.selection).toEqual({ light: null, dark: null });
  expect(result.current.css).toEqual({ light: null, dark: null });
  expect(await getStoredThemeSettings()).toEqual({ directory: "/mock/new", selection: { light: null, dark: null } });
  expect(emit).toHaveBeenLastCalledWith("markra://theme-files-changed", { directory: "/mock/new", selection: { light: null, dark: null } });
  await act(() => result.current.select("light", "light.css"));
  expect(read).toHaveBeenLastCalledWith("light.css", "/mock/new");
  expect((await getStoredThemeSettings()).directory).toBe("/mock/new");
});

it("keeps the current folder and styles after cancellation or an invalid folder choice", async () => {
  await saveStoredThemeFiles({ light: "light.css", dark: null });
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(() => result.current.chooseFolder("Choose"));
  expect(list).toHaveBeenCalledTimes(1);
  expect(emit).not.toHaveBeenCalled();
  chooseFolder.mockResolvedValue("/mock/missing");
  list.mockRejectedValueOnce(new Error("missing folder"));
  await act(() => result.current.chooseFolder("Choose"));
  expect(result.current.directory).toBe("/mock/themes");
  expect(result.current.css.light).toBe("/* light.css */");
  expect(result.current.error).toBe(true);
  expect((await getStoredThemeSettings()).directory).toBeNull();
});

it("restores the default folder and lets unavailable custom folders recover", async () => {
  await saveStoredThemeSettings({ directory: "/mock/offline", selection: { light: "light.css", dark: null } });
  list.mockRejectedValueOnce(new Error("unavailable"));
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.customDirectory).toBe("/mock/offline");
  expect(result.current.directory).toBe("/mock/offline");
  expect(result.current.error).toBe(true);
  await act(() => result.current.resetFolder());
  expect(result.current.customDirectory).toBeNull();
  expect(result.current.directory).toBe("/mock/themes");
  expect(result.current.error).toBe(false);
  expect((await getStoredThemeSettings()).selection).toEqual({ light: null, dark: null });
});

it("applies cross-window directory and file choices as a single snapshot", async () => {
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => {
    for (const listener of listeners) listener({ payload: { directory: "/mock/other", selection: { light: "light.css", dark: null } } });
  });
  await waitFor(() => expect(result.current.directory).toBe("/mock/other"));
  expect(read).toHaveBeenLastCalledWith("light.css", "/mock/other");
});

it("keeps a late read from the previous directory from replacing the new folder", async () => {
  await saveStoredThemeFiles({ light: "light.css", dark: null });
  let finishOldRead!: (css: string) => unknown;
  read.mockImplementationOnce(() => new Promise<string>((resolve) => { finishOldRead = resolve; }));
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(read).toHaveBeenCalled());
  chooseFolder.mockResolvedValue("/mock/new");
  await act(() => result.current.chooseFolder("Choose"));
  await act(async () => { finishOldRead("/* stale */"); });
  expect(result.current.directory).toBe("/mock/new");
  expect(result.current.css.light).toBeNull();
});

it("preserves file choices when the chosen directory resolves to the current folder", async () => {
  await saveStoredThemeFiles({ light: "light.css", dark: null });
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  chooseFolder.mockResolvedValue("/mock/themes");
  await act(() => result.current.chooseFolder("Choose"));
  expect(result.current.selection.light).toBe("light.css");
  expect(result.current.css.light).toBe("/* light.css */");
});

it("accepts a confirmed folder even if themes were refreshed while the picker was open", async () => {
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  let finishPicker!: (directory: string) => unknown;
  chooseFolder.mockImplementationOnce(() => new Promise<string>((resolve) => { finishPicker = resolve; }));
  let picking!: Promise<unknown>;
  act(() => { picking = result.current.chooseFolder("Choose"); });
  await act(() => result.current.refresh());
  await act(async () => { finishPicker("/mock/new"); await picking; });
  expect(result.current.directory).toBe("/mock/new");
});

it("does not apply a folder picker result after unmount", async () => {
  const { result, unmount } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  let finishPicker!: (directory: string) => unknown;
  chooseFolder.mockImplementationOnce(() => new Promise<string>((resolve) => { finishPicker = resolve; }));
  const picking = result.current.chooseFolder("Choose");
  unmount();
  finishPicker("/mock/new");
  await picking;
  expect((await getStoredThemeSettings()).directory).toBeNull();
});


it.each(["folder", "file"])("finishes a %s save despite an old cross-window refresh", async (choice) => {
  const previous = { directory: "/mock/old", selection: { light: "light.css", dark: null } };
  await saveStoredThemeSettings(previous);
  const runtime = getAppRuntime();
  const store = await runtime.settings.loadStore("settings.json", { autoSave: false, defaults: {} });
  let finishSave!: () => unknown;
  const save = vi.fn(() => new Promise<unknown>((resolve) => { finishSave = () => resolve(undefined); }));
  configureAppRuntime({ ...runtime, settings: { loadStore: async () => ({ ...store, save }) } });
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  chooseFolder.mockResolvedValue("/mock/new");
  let changing!: Promise<unknown>;
  act(() => { changing = choice === "folder" ? result.current.chooseFolder("Choose") : result.current.select("light", "dark.css"); });
  await waitFor(() => expect(save).toHaveBeenCalled());
  await act(async () => {
    for (const listener of listeners) listener({ payload: previous });
  });
  expect(result.current.loading).toBe(true);
  await act(async () => { finishSave(); await changing; });
  const expected = choice === "folder"
    ? { directory: "/mock/new", selection: { light: null, dark: null } }
    : { directory: "/mock/old", selection: { light: "dark.css", dark: null } };
  expect(result.current.directory).toBe(expected.directory);
  expect(result.current.selection).toEqual(expected.selection);
  expect(await getStoredThemeSettings()).toEqual(expected);
  expect(emit).toHaveBeenLastCalledWith("markra://theme-files-changed", expected);
  expect(result.current.loading).toBe(false);
});

it("keeps a confirmed folder choice when another window refreshes during validation", async () => {
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  let finishListing!: (directory: { directory: string; files: string[] }) => unknown;
  list.mockImplementationOnce(() => new Promise((resolve) => { finishListing = resolve; }));
  chooseFolder.mockResolvedValue("/mock/new");
  let changing!: Promise<unknown>;
  act(() => { changing = result.current.chooseFolder("Choose"); });
  await waitFor(() => expect(list).toHaveBeenCalledWith("/mock/new"));
  await act(async () => {
    for (const listener of listeners) listener({ payload: { directory: null, selection: { light: null, dark: null } } });
    finishListing({ directory: "/mock/new", files: [] });
    await changing;
  });
  expect(result.current.directory).toBe("/mock/new");
  expect((await getStoredThemeSettings()).directory).toBe("/mock/new");
});

it("saves successive folder choices in order while the first save is pending", async () => {
  const runtime = getAppRuntime();
  const store = await runtime.settings.loadStore("settings.json", { autoSave: false, defaults: {} });
  let finishSave!: () => unknown;
  const save = vi.fn().mockImplementationOnce(() => new Promise<unknown>((resolve) => { finishSave = () => resolve(undefined); }));
  configureAppRuntime({ ...runtime, settings: { loadStore: async () => ({ ...store, save }) } });
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  chooseFolder.mockResolvedValueOnce("/mock/first").mockResolvedValueOnce("/mock/second");
  let first!: Promise<unknown>;
  let second!: Promise<unknown>;
  act(() => { first = result.current.chooseFolder("Choose"); });
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await act(async () => { second = result.current.chooseFolder("Choose"); });
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => { finishSave(); await first; await second; });
  expect(result.current.directory).toBe("/mock/second");
  expect((await getStoredThemeSettings()).directory).toBe("/mock/second");
  expect(emit).toHaveBeenLastCalledWith("markra://theme-files-changed", { directory: "/mock/second", selection: { light: null, dark: null } });
});

it("clears the old catalog when another window chooses an unavailable folder", async () => {
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.files).toContain("light.css");
  list.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    for (const listener of listeners) listener({ payload: { directory: "/mock/offline", selection: { light: "other.css", dark: null } } });
  });
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.directory).toBe("/mock/offline");
  expect(result.current.files).toEqual([]);
});

it("applies a deferred window update if the local save fails", async () => {
  const runtime = getAppRuntime();
  const store = await runtime.settings.loadStore("settings.json", { autoSave: false, defaults: {} });
  let rejectSave!: (error: Error) => unknown;
  const save = vi.fn(() => new Promise<unknown>((_resolve, reject) => { rejectSave = reject; }));
  configureAppRuntime({ ...runtime, settings: { loadStore: async () => ({ ...store, save }) } });
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  chooseFolder.mockResolvedValue("/mock/new");
  let changing!: Promise<unknown>;
  act(() => { changing = result.current.chooseFolder("Choose"); });
  await waitFor(() => expect(save).toHaveBeenCalled());
  await act(async () => {
    for (const listener of listeners) listener({ payload: { directory: "/mock/other", selection: { light: "dark.css", dark: null } } });
    rejectSave(new Error("disk full"));
    await changing;
  });
  expect(result.current.directory).toBe("/mock/other");
  expect(result.current.css.light).toBe("/* dark.css */");
  expect(result.current.error).toBe(true);
  expect(result.current.loading).toBe(false);
  expect(emit).not.toHaveBeenCalled();
});

it("ignores old refreshes throughout the post-save folder reload", async () => {
  const previous = { directory: "/mock/old", selection: { light: "light.css", dark: null } };
  await saveStoredThemeSettings(previous);
  const { result } = renderHook(useThemeFiles);
  await waitFor(() => expect(result.current.ready).toBe(true));
  let finishReload!: (directory: { directory: string; files: string[] }) => unknown;
  list.mockResolvedValueOnce({ directory: "/mock/new", files: [] });
  list.mockImplementationOnce(() => new Promise((resolve) => { finishReload = resolve; }));
  chooseFolder.mockResolvedValue("/mock/new");
  let changing!: Promise<unknown>;
  act(() => { changing = result.current.chooseFolder("Choose"); });
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
  await act(async () => {
    for (const listener of listeners) listener({ payload: previous });
    finishReload({ directory: "/mock/new", files: [] });
    await changing;
  });
  expect(result.current.directory).toBe("/mock/new");
  expect((await getStoredThemeSettings()).directory).toBe("/mock/new");
  expect(result.current.loading).toBe(false);
});
