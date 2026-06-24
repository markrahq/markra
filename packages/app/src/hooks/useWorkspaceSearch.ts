import { useCallback, useEffect, useState } from "react";
import {
  emptyWorkspaceSearchResponse,
  nextGlobalSearchRecentQueries
} from "../app/workspace-model";
import {
  searchWorkspaceFiles,
  type WorkspaceSearchResponse
} from "../lib/workspace-search";
import {
  readNativeMarkdownFile,
  searchNativeMarkdownFilesForPath,
  type NativeMarkdownFolderFile
} from "../lib/tauri";

export const globalSearchDebounceMs = 180;

type WorkspaceSearchInput = {
  activeImageFile: NativeMarkdownFolderFile | null;
  documentContent: string;
  documentPath: string | null;
  fileTreeFiles: NativeMarkdownFolderFile[];
  fileTreeSourcePath: string | null;
};

export function useWorkspaceSearch({
  activeImageFile,
  documentContent,
  documentPath,
  fileTreeFiles,
  fileTreeSourcePath
}: WorkspaceSearchInput) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<WorkspaceSearchResponse>(emptyWorkspaceSearchResponse);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  const openSearch = useCallback(() => {
    setOpen(true);
  }, []);

  const hideSearch = useCallback(() => {
    setOpen(false);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery("");
    setLoading(false);
    setResponse(emptyWorkspaceSearchResponse);
  }, []);

  const selectRecentQuery = useCallback((recentQuery: string) => {
    setQuery(recentQuery);
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    const fileTreeSearchableFileCount = fileTreeFiles.filter((file) =>
      file.kind !== "asset" && file.kind !== "attachment" && file.kind !== "folder"
    ).length;

    if (!open) {
      setLoading(false);
      setResponse({
        ...emptyWorkspaceSearchResponse,
        searchedFileCount: fileTreeSearchableFileCount
      });
      return;
    }

    if (!trimmedQuery) {
      let active = true;

      setLoading(false);
      setResponse({
        ...emptyWorkspaceSearchResponse,
        searchedFileCount: fileTreeSearchableFileCount
      });

      const loadNativeFileCount = async () => {
        if (!fileTreeSourcePath) return null;

        return searchNativeMarkdownFilesForPath({
          caseSensitive,
          currentDocument: null,
          path: fileTreeSourcePath,
          query: ""
        }).catch(() => null);
      };

      loadNativeFileCount().then((nativeResponse) => {
        if (!active || !nativeResponse) return;

        setResponse({
          ...emptyWorkspaceSearchResponse,
          searchedFileCount: nativeResponse.searchedFileCount,
          truncated: nativeResponse.truncated,
          unreadableFileCount: nativeResponse.unreadableFileCount
        });
      });

      return () => {
        active = false;
      };
    }

    let active = true;
    setLoading(true);
    setRecentQueries((current) => nextGlobalSearchRecentQueries(current, trimmedQuery));

    const runGlobalSearch = async () => {
      const nativeResponse = fileTreeSourcePath
        ? await searchNativeMarkdownFilesForPath({
            caseSensitive,
            currentDocument: !activeImageFile && documentPath
              ? {
                  content: documentContent,
                  path: documentPath
                }
              : null,
            path: fileTreeSourcePath,
            query: trimmedQuery
          }).catch(() => null)
        : null;
      if (nativeResponse) return nativeResponse;

      return searchWorkspaceFiles(fileTreeFiles, trimmedQuery, {
        caseSensitive,
        readFile: async (path) => {
          if (!activeImageFile && documentPath === path) {
            return {
              content: documentContent,
              path
            };
          }

          const file = await readNativeMarkdownFile(path);

          return {
            content: file.content,
            path: file.path
          };
        }
      });
    };

    const searchTimeout = window.setTimeout(() => {
      runGlobalSearch().then((nextResponse) => {
        if (active) setResponse(nextResponse);
      }).catch(() => {
        if (active) setResponse(emptyWorkspaceSearchResponse);
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, globalSearchDebounceMs);

    return () => {
      active = false;
      window.clearTimeout(searchTimeout);
    };
  }, [
    activeImageFile,
    caseSensitive,
    documentContent,
    documentPath,
    fileTreeFiles,
    fileTreeSourcePath,
    open,
    query
  ]);

  return {
    caseSensitive,
    closeSearch,
    hideSearch,
    loading,
    open,
    openSearch,
    query,
    recentQueries,
    response,
    selectRecentQuery,
    setCaseSensitive,
    setQuery
  };
}
