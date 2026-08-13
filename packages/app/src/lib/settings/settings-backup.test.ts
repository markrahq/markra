import { createDefaultAiSettings } from "@markra/providers";
import {
  defaultAcpAgentSettings,
  defaultAiAgentPreferences,
  defaultBackupSettings,
  defaultCustomThemeCss,
  defaultEditorPreferences,
  defaultExportSettings,
  defaultFileIgnoreSettings,
  defaultNetworkSettings,
  defaultSyncSettings,
  defaultWebSearchSettings,
  type PortableStoredAppSettings
} from "./app-settings";
import {
  createSettingsBackupFile,
  restoreSettingsBackupFile
} from "./settings-backup";

function portableSettings(): PortableStoredAppSettings {
  const aiProviders = createDefaultAiSettings();

  return {
    acpAgentSettings: {
      args: "--mock-agent",
      command: "mock-agent",
      cwd: "/mock/workspace",
      enabled: true
    },
    aiAgentPreferences: defaultAiAgentPreferences,
    aiProviders: {
      ...aiProviders,
      providers: aiProviders.providers.map((provider, index) => index === 0
        ? {
            ...provider,
            apiKey: "sk-mock-secret",
            customHeaders: JSON.stringify({ Authorization: "Bearer mock-secret" })
          }
        : provider)
    },
    appearanceMode: "dark",
    backupSettings: {
      backupOnExit: true,
      intervalMinutes: 30,
      lastBackupAt: 1_900_000_000_000,
      targetPath: "/mock/backups"
    },
    customThemeCss: {
      dark: `${defaultCustomThemeCss}\n/* mock dark */`,
      light: `${defaultCustomThemeCss}\n/* mock light */`
    },
    customThemeEnabled: true,
    darkTheme: "one-dark",
    editorPreferences: {
      ...defaultEditorPreferences,
      bodyFontSize: 18,
      editorFontFamily: {
        family: "Mock System Font",
        source: "system"
      },
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        picgo: {
          secret: "mock-picgo-secret",
          serverUrl: "https://picgo.example.test/upload"
        },
        s3: {
          accessKeyId: "mock-access-key",
          bucket: "mock-bucket",
          endpointUrl: "https://s3.example.test",
          publicBaseUrl: "https://cdn.example.test",
          region: "mock-region",
          secretAccessKey: "mock-secret-key",
          uploadPath: "images"
        },
        webdav: {
          password: "mock-webdav-password",
          publicBaseUrl: "https://cdn.example.test",
          serverUrl: "https://dav.example.test",
          uploadPath: "images",
          username: "mock-user"
        }
      },
      markdownTemplates: [{
        fileName: "mock-template.md",
        id: "mock-template",
        name: "Mock template",
        suggestedName: "Mock template"
      }]
    },
    exportSettings: {
      ...defaultExportSettings,
      fontFamily: "Mock System Font",
      pandocPath: "/mock/bin/pandoc",
      pdfAuthor: "Mock Author"
    },
    fileIgnoreSettings: {
      rules: "mock-cache/"
    },
    language: "en",
    lightTheme: "github",
    logLevel: "info",
    network: {
      bypassLocalAddresses: false,
      proxyEnabled: true,
      proxyUrl: "https://mock-user:mock-password@proxy.example.test"
    },
    syncSettings: {
      autoSyncOnSave: true,
      enabled: true,
      intervalMinutes: 15,
      lastSyncAt: 1_900_000_000_000,
      provider: "webdav",
      remotePath: "mock-notes"
    },
    webSearch: {
      ...defaultWebSearchSettings,
      enabled: true,
      searxngApiHost: "https://search.example.test"
    }
  };
}

describe("settings backup files", () => {
  it("removes credentials and device-local settings by default", () => {
    const settings = portableSettings();
    const backup = JSON.parse(createSettingsBackupFile(settings, {
      exportedAt: new Date("2030-01-02T03:04:05.000Z"),
      includeSensitiveSettings: false
    }));

    expect(backup).toMatchObject({
      exportedAt: "2030-01-02T03:04:05.000Z",
      format: "markra-settings-backup",
      includesSensitiveSettings: false,
      version: 1
    });
    expect(backup.settings.acpAgentSettings).toEqual(defaultAcpAgentSettings);
    expect(backup.settings.backupSettings).toEqual(defaultBackupSettings);
    expect(backup.settings.syncSettings).toEqual(defaultSyncSettings);
    expect(backup.settings.network).toEqual(defaultNetworkSettings);
    expect(backup.settings.exportSettings).toMatchObject({
      fontFamily: null,
      pandocPath: "",
      pdfAuthor: "Mock Author"
    });
    expect(backup.settings.editorPreferences.editorFontFamily).toEqual(
      defaultEditorPreferences.editorFontFamily
    );
    expect(backup.settings.editorPreferences.markdownTemplates).toEqual([]);
    expect(backup.settings.aiProviders.providers[0]).toMatchObject({
      apiKey: "",
      customHeaders: ""
    });
    expect(backup.settings.editorPreferences.imageUpload).toMatchObject({
      picgo: { secret: "" },
      s3: { accessKeyId: "", secretAccessKey: "" },
      webdav: { password: "", username: "" }
    });
  });

  it("keeps credentials only when the user explicitly includes them", () => {
    const backup = JSON.parse(createSettingsBackupFile(portableSettings(), {
      exportedAt: new Date("2030-01-02T03:04:05.000Z"),
      includeSensitiveSettings: true
    }));

    expect(backup.includesSensitiveSettings).toBe(true);
    expect(backup.settings.aiProviders.providers[0]).toMatchObject({
      apiKey: "sk-mock-secret",
      customHeaders: JSON.stringify({ Authorization: "Bearer mock-secret" })
    });
    expect(backup.settings.editorPreferences.imageUpload).toMatchObject({
      picgo: { secret: "mock-picgo-secret" },
      s3: {
        accessKeyId: "mock-access-key",
        secretAccessKey: "mock-secret-key"
      },
      webdav: {
        password: "mock-webdav-password",
        username: "mock-user"
      }
    });
  });

  it("restores portable settings while preserving local-only values and omitted credentials", () => {
    const localSettings = portableSettings();
    const remoteSettings = portableSettings();
    remoteSettings.language = "zh-CN";
    remoteSettings.editorPreferences.bodyFontSize = 20;
    remoteSettings.acpAgentSettings.cwd = "/remote/workspace";
    remoteSettings.backupSettings.targetPath = "/remote/backups";
    remoteSettings.syncSettings.remotePath = "remote-notes";
    remoteSettings.network.proxyUrl = "https://remote-proxy.example.test";
    remoteSettings.exportSettings.pandocPath = "/remote/bin/pandoc";
    remoteSettings.aiProviders.providers[0]!.apiKey = "sk-remote-secret";

    const restored = restoreSettingsBackupFile(
      createSettingsBackupFile(remoteSettings, {
        exportedAt: new Date("2030-01-02T03:04:05.000Z"),
        includeSensitiveSettings: false
      }),
      localSettings
    );

    expect(restored.language).toBe("zh-CN");
    expect(restored.editorPreferences.bodyFontSize).toBe(20);
    expect(restored.acpAgentSettings).toEqual(localSettings.acpAgentSettings);
    expect(restored.backupSettings).toEqual(localSettings.backupSettings);
    expect(restored.syncSettings).toEqual(localSettings.syncSettings);
    expect(restored.network).toEqual(localSettings.network);
    expect(restored.exportSettings.pandocPath).toBe(localSettings.exportSettings.pandocPath);
    expect(restored.editorPreferences.editorFontFamily).toEqual(
      localSettings.editorPreferences.editorFontFamily
    );
    expect(restored.editorPreferences.markdownTemplates).toEqual(
      localSettings.editorPreferences.markdownTemplates
    );
    expect(restored.aiProviders.providers[0]!.apiKey).toBe("sk-mock-secret");
    expect(restored.editorPreferences.imageUpload.webdav.password).toBe("mock-webdav-password");
  });

  it("restores explicitly included credentials", () => {
    const localSettings = portableSettings();
    const remoteSettings = portableSettings();
    remoteSettings.aiProviders.providers[0]!.apiKey = "sk-remote-secret";
    remoteSettings.editorPreferences.imageUpload.webdav.password = "remote-webdav-password";

    const restored = restoreSettingsBackupFile(
      createSettingsBackupFile(remoteSettings, {
        exportedAt: new Date("2030-01-02T03:04:05.000Z"),
        includeSensitiveSettings: true
      }),
      localSettings
    );

    expect(restored.aiProviders.providers[0]!.apiKey).toBe("sk-remote-secret");
    expect(restored.editorPreferences.imageUpload.webdav.password).toBe("remote-webdav-password");
  });

  it("restores legacy local settings exports", () => {
    const localSettings = portableSettings();
    const exportedSettings = portableSettings();
    exportedSettings.editorPreferences.bodyFontSize = 20;

    const restored = restoreSettingsBackupFile(JSON.stringify({
      exportedAt: "2030-01-02T03:04:05.000Z",
      format: "markra-settings",
      settings: exportedSettings,
      version: 1
    }), localSettings);

    expect(restored.editorPreferences.bodyFontSize).toBe(20);
    expect(restored.network).toEqual(localSettings.network);
  });

  it("rejects invalid or unsupported backup files", () => {
    expect(() => restoreSettingsBackupFile("{not json", portableSettings()))
      .toThrow("Invalid Markra settings backup file.");
    expect(() => restoreSettingsBackupFile(JSON.stringify({
      format: "markra-settings-backup",
      includesSensitiveSettings: false,
      settings: {},
      version: 2
    }), portableSettings())).toThrow("Invalid Markra settings backup file.");
  });
});
