import { act, renderHook, waitFor } from "@testing-library/react";
import { useWorkspaceAssetCleanup } from "./useWorkspaceAssetCleanup";
import {
  listNativeMarkdownFilesForPath,
  listNativeMarkdownReferenceFilesForPath,
  readNativeMarkdownFile,
  trashNativeMarkdownAssets
} from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  listNativeMarkdownFilesForPath: vi.fn(),
  listNativeMarkdownReferenceFilesForPath: vi.fn(),
  readNativeMarkdownFile: vi.fn(),
  trashNativeMarkdownAssets: vi.fn()
}));

const mockedListFiles = vi.mocked(listNativeMarkdownFilesForPath);
const mockedListReferenceFiles = vi.mocked(listNativeMarkdownReferenceFilesForPath);
const mockedReadFile = vi.mocked(readNativeMarkdownFile);
const mockedTrashAssets = vi.mocked(trashNativeMarkdownAssets);

const asset = {
  kind: "asset" as const,
  modifiedAt: 1_700_000_000_000,
  name: "unused.png",
  path: "/mock-vault/assets/unused.png",
  relativePath: "assets/unused.png",
  sizeBytes: 100
};
const documentFile = {
  modifiedAt: 1_700_000_001_000,
  name: "note.md",
  path: "/mock-vault/note.md",
  relativePath: "note.md",
  sizeBytes: 10
};

describe("useWorkspaceAssetCleanup", () => {
  beforeEach(() => {
    mockedListFiles.mockReset();
    mockedListReferenceFiles.mockReset();
    mockedReadFile.mockReset();
    mockedTrashAssets.mockReset();
    mockedListFiles.mockResolvedValue([asset]);
    mockedListReferenceFiles.mockResolvedValue([documentFile]);
  });

  it("rescans before cleanup and aborts when a selected image became referenced", async () => {
    mockedReadFile
      .mockResolvedValueOnce({ content: "# Note", name: "note.md", path: documentFile.path })
      .mockResolvedValueOnce({
        content: "![Now used](assets/unused.png)",
        name: "note.md",
        path: documentFile.path
      });
    const onTreeRefresh = vi.fn();
    const { result } = renderHook(() => useWorkspaceAssetCleanup({
      managedFolder: "assets",
      onTreeRefresh,
      rootPath: "/mock-vault"
    }));

    await act(async () => {
      await result.current.openDialog();
    });
    expect(result.current.index?.unusedAssets).toEqual([asset]);

    await act(async () => {
      await result.current.trashAssets([asset]);
    });

    expect(result.current.error).toBe("changed");
    expect(result.current.index?.unusedAssets).toEqual([]);
    expect(mockedTrashAssets).not.toHaveBeenCalled();
    expect(onTreeRefresh).not.toHaveBeenCalled();
  });

  it("moves revalidated images to Trash and refreshes the workspace tree", async () => {
    mockedReadFile.mockResolvedValue({
      content: "# Note",
      name: "note.md",
      path: documentFile.path
    });
    mockedTrashAssets.mockResolvedValue({
      failures: [],
      trashedPaths: [asset.path]
    });
    const onTreeRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useWorkspaceAssetCleanup({
      managedFolder: "assets",
      onTreeRefresh,
      rootPath: "/mock-vault"
    }));

    await act(async () => {
      await result.current.openDialog();
      await result.current.trashAssets([asset]);
    });

    expect(mockedTrashAssets).toHaveBeenCalledWith({
      documents: [{
        modifiedAt: documentFile.modifiedAt,
        path: documentFile.path,
        sizeBytes: documentFile.sizeBytes
      }],
      managedFolder: "assets",
      rootPath: "/mock-vault",
      targets: [{
        modifiedAt: asset.modifiedAt,
        path: asset.path,
        sizeBytes: asset.sizeBytes
      }]
    });
    expect(onTreeRefresh).toHaveBeenCalledWith("/mock-vault");
    await waitFor(() => expect(result.current.trashing).toBe(false));
  });

  it("aborts when a selected image changed since the preview", async () => {
    mockedListFiles
      .mockResolvedValueOnce([asset])
      .mockResolvedValueOnce([{
        ...asset,
        modifiedAt: asset.modifiedAt + 1,
        sizeBytes: asset.sizeBytes + 1
      }]);
    mockedReadFile.mockResolvedValue({
      content: "# Note",
      name: "note.md",
      path: documentFile.path
    });
    const onTreeRefresh = vi.fn();
    const { result } = renderHook(() => useWorkspaceAssetCleanup({
      managedFolder: "assets",
      onTreeRefresh,
      rootPath: "/mock-vault"
    }));

    await act(async () => {
      await result.current.openDialog();
      await result.current.trashAssets([asset]);
    });

    expect(result.current.error).toBe("changed");
    expect(mockedTrashAssets).not.toHaveBeenCalled();
    expect(onTreeRefresh).not.toHaveBeenCalled();
  });

  it("aborts when unsaved editor contents change after the final scan", async () => {
    const getDirtyDocuments = vi.fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{
        content: "![Now used](assets/unused.png)",
        path: documentFile.path
      }]);
    mockedReadFile.mockResolvedValue({
      content: "# Note",
      name: "note.md",
      path: documentFile.path
    });
    const onTreeRefresh = vi.fn();
    const { result } = renderHook(() => useWorkspaceAssetCleanup({
      getDirtyDocuments,
      managedFolder: "assets",
      onTreeRefresh,
      rootPath: "/mock-vault"
    }));

    await act(async () => {
      await result.current.openDialog();
      await result.current.trashAssets([asset]);
    });

    expect(result.current.error).toBe("changed");
    expect(mockedTrashAssets).not.toHaveBeenCalled();
    expect(onTreeRefresh).not.toHaveBeenCalled();
  });
});
