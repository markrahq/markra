import { act, renderHook, waitFor } from "@testing-library/react";
import {
  readNativeMarkdownFile,
  searchNativeMarkdownFilesForPath,
  type NativeMarkdownFolderFile
} from "../lib/tauri";
import { useWorkspaceSearch } from "./useWorkspaceSearch";

vi.mock("../lib/tauri", () => ({
  readNativeMarkdownFile: vi.fn(),
  searchNativeMarkdownFilesForPath: vi.fn()
}));

const mockedReadNativeMarkdownFile = vi.mocked(readNativeMarkdownFile);
const mockedSearchNativeMarkdownFilesForPath = vi.mocked(searchNativeMarkdownFilesForPath);

describe("useWorkspaceSearch", () => {
  beforeEach(() => {
    mockedReadNativeMarkdownFile.mockReset();
    mockedSearchNativeMarkdownFilesForPath.mockReset();
    mockedSearchNativeMarkdownFilesForPath.mockResolvedValue({
      results: [],
      searchedFileCount: 0,
      truncated: false,
      unreadableFileCount: 0
    });
  });

  it("forwards global ignore rules to native workspace search", async () => {
    const fileTreeFiles: NativeMarkdownFolderFile[] = [];
    const { result } = renderHook(() => useWorkspaceSearch({
      activeImageFile: null,
      documentContent: "",
      documentPath: null,
      fileTreeFiles,
      fileTreeSourcePath: "/vault",
      globalIgnoreRules: "generated/"
    }));

    act(() => {
      result.current.openSearch();
      result.current.setQuery("needle");
    });

    await waitFor(() => expect(mockedSearchNativeMarkdownFilesForPath).toHaveBeenCalledWith({
      caseSensitive: false,
      currentDocument: null,
      globalIgnoreRules: "generated/",
      path: "/vault",
      query: "needle"
    }));
  });

  it("merges file-name matches into native workspace search results", async () => {
    const fileTreeFiles: NativeMarkdownFolderFile[] = [{
      name: "guide.md",
      path: "/vault/guide.md",
      relativePath: "guide.md"
    }];
    mockedSearchNativeMarkdownFilesForPath.mockResolvedValue({
      results: [],
      searchedFileCount: 1,
      truncated: false,
      unreadableFileCount: 0
    });
    const { result } = renderHook(() => useWorkspaceSearch({
      activeImageFile: null,
      documentContent: "",
      documentPath: null,
      fileTreeFiles,
      fileTreeSourcePath: "/vault"
    }));

    act(() => {
      result.current.openSearch();
      result.current.setQuery("guide");
    });

    await waitFor(() => expect(result.current.response.results).toEqual([
      expect.objectContaining({
        id: "file-name:/vault/guide.md",
        kind: "fileName"
      })
    ]));
  });
});
