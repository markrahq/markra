import { useCallback, useEffect, useState } from "react";
import { listStoredAiAgentSessions, type StoredAiAgentSessionSummary } from "../lib/settings/app-settings";

export function useAiAgentSessionList(workspaceKey: string | null, refreshKey: string, enabled = true) {
  const [sessions, setSessions] = useState<StoredAiAgentSessionSummary[]>([]);
  const [readyWorkspaceKey, setReadyWorkspaceKey] = useState<string | null | undefined>();

  const refresh = useCallback(async () => {
    try {
      setSessions(await listStoredAiAgentSessions(workspaceKey, { includeArchived: true }));
    } catch {
      setSessions([]);
    } finally {
      setReadyWorkspaceKey(workspaceKey);
    }
  }, [workspaceKey]);

  useEffect(() => {
    if (!enabled) {
      setReadyWorkspaceKey(undefined);
      return undefined;
    }

    setReadyWorkspaceKey(undefined);
    refresh().catch(() => {});
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (readyWorkspaceKey !== workspaceKey) return undefined;

    const timer = window.setTimeout(() => {
      refresh().catch(() => {});
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [enabled, readyWorkspaceKey, refresh, refreshKey, workspaceKey]);

  return {
    refresh,
    ready: enabled && readyWorkspaceKey === workspaceKey,
    sessions
  };
}
