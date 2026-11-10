import { defineRecorder } from "versioncam";

export default defineRecorder({
  // Vite's default port: apps/web/vite.config.ts sets none.
  baseUrl: "http://localhost:5173",
  // The web app's own dev script (`vite`), as CONTRIBUTING's pnpm workflow runs it.
  webServer: { command: "pnpm dev", url: "http://localhost:5173" },
  viewport: { width: 1440, height: 900 },
  clips: "demos/clips/**/*.clip.ts",
  // The clip writes a note, fills a table and walks the three view modes,
  // which takes longer than the default 9 to 11 seconds to show readably.
  review: { minSeconds: 15, maxSeconds: 20 },
});
