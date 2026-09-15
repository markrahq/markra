import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { chooseNativeThemeFolder, listNativeThemes, readNativeTheme, openNativeThemeFolder } from "./themes";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

it("lists, reads, and opens the managed theme directory through native commands", async () => {
  const mockedInvoke = vi.mocked(invoke);
  mockedInvoke.mockResolvedValueOnce({ directory: "/mock/themes", files: ["mock.css"] });
  expect(await listNativeThemes()).toEqual({ directory: "/mock/themes", files: ["mock.css"] });
  expect(mockedInvoke).toHaveBeenLastCalledWith("list_themes");
  mockedInvoke.mockResolvedValueOnce("/* mock */");
  expect(await readNativeTheme("mock.css")).toBe("/* mock */");
  expect(mockedInvoke).toHaveBeenLastCalledWith("read_theme", { fileName: "mock.css" });
  await openNativeThemeFolder();
  expect(mockedInvoke).toHaveBeenLastCalledWith("open_theme_folder");
});

it("passes the selected folder to native listing, reading and opening", async () => {
  await listNativeThemes("/mock/custom");
  expect(invoke).toHaveBeenLastCalledWith("list_themes", { directory: "/mock/custom" });
  await readNativeTheme("mock.css", "/mock/custom");
  expect(invoke).toHaveBeenLastCalledWith("read_theme", { fileName: "mock.css", directory: "/mock/custom" });
  await openNativeThemeFolder("/mock/custom");
  expect(invoke).toHaveBeenLastCalledWith("open_theme_folder", { directory: "/mock/custom" });
});

it("opens a folder picker with the current path and supports cancellation", async () => {
  vi.mocked(open).mockResolvedValueOnce("/mock/new").mockResolvedValueOnce(null);
  const options = { title: "Choose theme folder", defaultPath: "/mock/current" };
  expect(await chooseNativeThemeFolder(options)).toBe("/mock/new");
  expect(open).toHaveBeenLastCalledWith({ directory: true, multiple: false, ...options });
  expect(await chooseNativeThemeFolder(options)).toBeNull();
});
