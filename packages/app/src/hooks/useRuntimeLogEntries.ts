import { useEffect, useState } from "react";
import {
  clearRuntimeLogEntries,
  listRuntimeLogEntries,
  listenRuntimeLogEntriesChanged,
  type RuntimeLogEntry
} from "../lib/runtime-log";

export function useRuntimeLogEntries() {
  const [entries, setEntries] = useState<RuntimeLogEntry[]>(() => listRuntimeLogEntries());

  useEffect(() => {
    return listenRuntimeLogEntriesChanged(() => {
      setEntries(listRuntimeLogEntries());
    });
  }, []);

  return {
    clearEntries: clearRuntimeLogEntries,
    entries
  };
}
