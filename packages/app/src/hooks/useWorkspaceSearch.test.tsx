import { act, renderHook, waitFor } from "@testing-library/react";
import {
  readNativeMarkdownFile,
  searchNativeMarkdownFilesForPath,
  type NativeMarkdownFolderFile
} from "../lib/tauri";
import type { WorkspaceSearchResponse } from "../lib/workspace-search";
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
      maxMatches: 1_000,
      maxMatchesPerFile: 100,
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

  it("clears stale results while a new query is loading", async () => {
    const file = {
      name: "guide.md",
      path: "/vault/guide.md",
      relativePath: "guide.md"
    } satisfies NativeMarkdownFolderFile;
    const fileTreeFiles = [file];
    mockedSearchNativeMarkdownFilesForPath.mockResolvedValue({
      results: [{
        columnNumber: 1,
        file,
        id: "/vault/guide.md:0",
        lineNumber: 1,
        lineText: "alpha",
        match: { from: 0, to: 5 },
        matchIndex: 0,
        snippet: "alpha"
      }],
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
      result.current.setQuery("alpha");
    });
    await waitFor(() => expect(result.current.response.results).toHaveLength(1));

    let resolveNextSearch: ((response: WorkspaceSearchResponse) => void) | undefined;
    mockedSearchNativeMarkdownFilesForPath.mockImplementationOnce(() => new Promise((resolve) => {
      resolveNextSearch = resolve;
    }));
    act(() => {
      result.current.setQuery("beta");
    });

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.response.results).toEqual([]);

    act(() => {
      resolveNextSearch?.({
        results: [],
        searchedFileCount: 1,
        truncated: false,
        unreadableFileCount: 0
      });
    });
  });
});
