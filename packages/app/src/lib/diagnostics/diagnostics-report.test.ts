import { createDefaultAiSettings } from "@markra/providers";
import {
  defaultBackupSettings,
  defaultEditorPreferences,
  defaultExportSettings,
  defaultNetworkSettings,
  defaultSyncSettings,
  defaultWebSearchSettings
} from "../settings/app-settings";
import {
  generateCrashDiagnosticsReport,
  generateDiagnosticsIssueUrl,
  generateDiagnosticsReport
} from "./diagnostics-report";

describe("generateDiagnosticsReport", () => {
  it("formats a local Markdown report from non-sensitive settings", () => {
    const report = generateDiagnosticsReport({
      aiSettings: createDefaultAiSettings(),
      appVersion: "9.9.9",
      backupSettings: {
        ...defaultBackupSettings,
        backupOnExit: true,
        intervalMinutes: 30,
        lastBackupAt: 1_893_456_000_000,
        targetPath: "/Users/example/private-vault"
      },
      editorPreferences: {
        ...defaultEditorPreferences,
        autoSaveIntervalMinutes: 10,
        imageUpload: {
          ...defaultEditorPreferences.imageUpload,
          provider: "webdav",
          s3: {
            accessKeyId: "access-secret",
            bucket: "private-bucket",
            endpointUrl: "https://s3.example.test/private",
            publicBaseUrl: "https://cdn.example.test/private",
            region: "us-east-1",
            secretAccessKey: "super-secret",
            uploadPath: "private-notes"
          },
          webdav: {
            password: "dav-password",
            publicBaseUrl: "https://cdn.example.test/private",
            serverUrl: "https://dav.example.test/private",
            uploadPath: "private-notes",
            username: "ada"
          }
        }
      },
      exportSettings: {
        ...defaultExportSettings,
        pandocArgs: "--resource-path=/Users/example/private-vault",
        pandocPath: "/Users/example/bin/pandoc",
        pdfAuthor: "Ada Private"
      },
      features: {
        ai: true,
        export: true,
        nativeWindowChrome: true,
        networkProxy: true,
        pandoc: true,
        s3ImageUpload: true,
        spellcheck: true,
        updater: true
      },
      generatedAt: new Date("2030-01-02T03:04:05.000Z"),
      language: "zh-CN",
      networkSettings: {
        ...defaultNetworkSettings,
        proxyEnabled: true,
        proxyUrl: "socks5://user:secret@127.0.0.1:1080"
      },
      osVersion: "15.5",
      platform: "macos",
      syncSettings: {
        ...defaultSyncSettings,
        enabled: true,
        intervalMinutes: 60,
        lastSyncAt: 1_893_456_000_000,
        remotePath: "private-vault"
      },
      webSearchSettings: {
        ...defaultWebSearchSettings,
        providerId: "searxng",
        searxngApiHost: "https://search.example.test"
      }
    });

    expect(report).toContain("## Markra Diagnostics");
    expect(report).toContain("- App version: 9.9.9");
    expect(report).toContain("- Platform: macos");
    expect(report).toContain("- OS version: 15.5");
    expect(report).toContain("- App language: zh-CN");
    expect(report).toContain("- Network proxy enabled: true");
    expect(report).toContain("- Image storage provider: webdav");
    expect(report).toContain("- Sync enabled: true");
    expect(report).toContain("- Backup on exit: true");
    expect(report).toContain("- Auto-save interval: 5-15m");

    for (const sensitiveValue of [
      "/Users/example",
      "Ada Private",
      "access-secret",
      "cdn.example.test",
      "dav-password",
      "dav.example.test",
      "private-bucket",
      "private-notes",
      "private-vault",
      "s3.example.test",
      "search.example.test",
      "super-secret",
      "user:secret"
    ]) {
      expect(report).not.toContain(sensitiveValue);
    }
  });
});

describe("generateDiagnosticsIssueUrl", () => {
  it("builds a GitHub issue draft with the diagnostics report prefilled", () => {
    const report = [
      "## Markra Diagnostics",
      "- App version: 9.9.9",
      "- Platform: macos"
    ].join("\n");
    const issueUrl = new URL(generateDiagnosticsIssueUrl(report));

    expect(issueUrl.origin).toBe("https://github.com");
    expect(issueUrl.pathname).toBe("/markrahq/markra/issues/new");
    expect(issueUrl.searchParams.get("title")).toBe("Diagnostics report");
    expect(issueUrl.searchParams.get("body")).toContain("## What happened?");
    expect(issueUrl.searchParams.get("body")).toContain(report);
  });

  it("uses a custom issue title when provided", () => {
    const issueUrl = new URL(generateDiagnosticsIssueUrl("## Markra Crash Report", { title: "Crash report" }));

    expect(issueUrl.searchParams.get("title")).toBe("Crash report");
  });
});

describe("generateCrashDiagnosticsReport", () => {
  it("formats a crash report without raw error stacks", () => {
    const error = new Error("Render exploded");
    error.stack = "Error: Render exploded\n    at /Users/example/private-project/src/App.tsx:1:1";
    const report = generateCrashDiagnosticsReport({
      appVersion: "9.9.9",
      componentStack: "\n    at BrokenPanel\n    at App",
      error,
      generatedAt: new Date("2030-01-02T03:04:05.000Z"),
      language: "zh-CN",
      osVersion: "15.5",
      platform: "macos"
    });

    expect(report).toContain("## Markra Crash Report");
    expect(report).toContain("- Error name: Error");
    expect(report).toContain("- Error message: Render exploded");
    expect(report).toContain("- Component stack: available");
    expect(report).toContain("- Platform: macos");
    expect(report).toContain("- App language: zh-CN");
    expect(report).not.toContain("/Users/example");
    expect(report).not.toContain("private-project");
  });
});
