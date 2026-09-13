import { invoke } from "@tauri-apps/api/core";
import { listNativeThemes, readNativeTheme, openNativeThemeFolder } from "./themes";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

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
