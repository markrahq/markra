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
});
