import { act, renderHook, waitFor } from "@testing-library/react";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests, type RuntimeEvent } from "../runtime";
import { saveStoredThemeFiles } from "../lib/settings/theme-files";
import { useThemeFiles } from "./useThemeFiles";

const list = vi.fn();
const read = vi.fn();
const openFolder = vi.fn();
const emit = vi.fn();
const listeners = new Set<(event: RuntimeEvent<unknown>) => unknown>();

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  list.mockResolvedValue({ directory: "/mock/themes", files: ["light.css", "dark.css"] });
  read.mockImplementation(async (name: string) => `/* ${name} */`);
  configureAppRuntime({
    ...createDefaultAppRuntime(),
    themes: { list, read, openFolder },
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
