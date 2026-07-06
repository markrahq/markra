import { useEffect } from "react";

import { installRuntimeLogCapture } from "../lib/runtime-log";

export function useRuntimeLogCapture() {
  useEffect(() => installRuntimeLogCapture(), []);
}
