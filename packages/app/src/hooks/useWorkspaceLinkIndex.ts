import { useEffect, useRef, useState } from "react";
import {
  buildWorkspaceLinkIndex,
  type WorkspaceLinkFile,
  type WorkspaceLinkIndex
} from "../lib/workspace-links";
import { readNativeMarkdownFile } from "../lib/tauri";

type UseWorkspaceLinkIndexInput = {
  deferMs?: number;
  documentContent: string;
  documentPath: string | null;
  enabled?: boolean;
  fileTreeFiles: WorkspaceLinkFile[];
};

const emptyWorkspaceLinkIndex = {
  backlinks: [],
  fileCount: 0,
  files: [],
  unlinkedMentions: [],
  unreadableFileCount: 0
} satisfies WorkspaceLinkIndex;

export function useWorkspaceLinkIndex({
  deferMs = 0,
  documentContent,
  documentPath,
  enabled = true,
  fileTreeFiles
}: UseWorkspaceLinkIndexInput) {
  const [index, setIndex] = useState<WorkspaceLinkIndex>(emptyWorkspaceLinkIndex);
  const [loading, setLoading] = useState(() => enabled);
  const previousEnabledRef = useRef(enabled);
  const enabling = enabled && !previousEnabledRef.current;

  useEffect(() => {
    previousEnabledRef.current = enabled;

    if (!enabled) {
      setIndex(emptyWorkspaceLinkIndex);
      setLoading(false);
      return undefined;
    }

    let active = true;
    let buildTimer: number | null = null;

    setLoading(true);

    const buildIndex = () => {
      buildWorkspaceLinkIndex(fileTreeFiles, {
        currentDocument: documentPath
          ? {
              content: documentContent,
              path: documentPath
            }
          : null,
        readFile: async (path) => {
          const file = await readNativeMarkdownFile(path);

          return {
            content: file.content,
            path: file.path
          };
        }
      }).then((nextIndex) => {
        if (active) setIndex(nextIndex);
      }).catch(() => {
        if (active) setIndex(emptyWorkspaceLinkIndex);
      }).finally(() => {
        if (active) setLoading(false);
      });
    };

    if (deferMs > 0) {
      buildTimer = window.setTimeout(buildIndex, deferMs);
    } else {
      buildIndex();
    }

    return () => {
      active = false;
      if (buildTimer !== null) window.clearTimeout(buildTimer);
    };
  }, [deferMs, documentContent, documentPath, enabled, fileTreeFiles]);

  return {
    index,
    loading: enabled && (loading || enabling)
  };
}
