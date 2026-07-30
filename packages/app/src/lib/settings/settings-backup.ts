import {
  defaultAcpAgentSettings,
  defaultBackupSettings,
  defaultEditorPreferences,
  defaultNetworkSettings,
  defaultSyncSettings,
  normalizePortableStoredAppSettings,
  type EditorPreferences,
  type ImageUploadProvider,
  type PortableStoredAppSettings
} from "./app-settings";

const settingsBackupFormat = "markra-settings-backup";
const settingsBackupVersion = 1;
const legacySettingsExportFormat = "markra-settings";
const invalidSettingsBackupFileMessage = "Invalid Markra settings backup file.";

export const settingsBackupRemotePath = "markra/settings/markra-settings.json";
export const settingsBackupFileSuggestedName = "markra-settings-backup.json";

export type SettingsBackupProvider = ImageUploadProvider;

export function settingsBackupProviderSupported(provider: SettingsBackupProvider) {
  return provider !== "picgo";
}

export function settingsBackupProviderConfigured(
  provider: SettingsBackupProvider,
  preferences: EditorPreferences
) {
  if (provider === "local") return true;
  if (provider === "picgo") return false;
  if (provider === "webdav") {
    return preferences.imageUpload.webdav.serverUrl.trim().length > 0;
  }

  const s3 = preferences.imageUpload.s3;
  return [
    s3.accessKeyId,
    s3.bucket,
    s3.endpointUrl,
    s3.secretAccessKey
  ].every((value) => value.trim().length > 0);
}

export type CreateSettingsBackupFileOptions = {
  exportedAt?: Date;
  includeSensitiveSettings: boolean;
};

type SettingsBackupFile = {
  exportedAt: string;
  format: typeof settingsBackupFormat;
  includesSensitiveSettings: boolean;
  settings: PortableStoredAppSettings;
  version: typeof settingsBackupVersion;
};

function settingsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidSettingsBackupFile(): Error {
  return new Error(invalidSettingsBackupFileMessage);
}

function portableSettingsForBackup(
  settings: PortableStoredAppSettings,
  includeSensitiveSettings: boolean
): PortableStoredAppSettings {
  const aiProviders = {
    ...settings.aiProviders,
    providers: settings.aiProviders.providers.map((provider) => ({
      ...provider,
      ...(!includeSensitiveSettings
        ? {
            apiKey: "",
            customHeaders: ""
          }
        : {})
    }))
  };
  const imageUpload = settings.editorPreferences.imageUpload;
  const portableImageUpload = {
    ...imageUpload,
    picgo: {
      ...imageUpload.picgo,
      ...(!includeSensitiveSettings ? { secret: "" } : {})
    },
    s3: {
      ...imageUpload.s3,
      ...(!includeSensitiveSettings
        ? {
            accessKeyId: "",
            secretAccessKey: ""
          }
        : {})
    },
    webdav: {
      ...imageUpload.webdav,
      ...(!includeSensitiveSettings
        ? {
            password: "",
            username: ""
          }
        : {})
    }
  };

  return {
    ...settings,
    acpAgentSettings: { ...defaultAcpAgentSettings },
    aiProviders,
    backupSettings: { ...defaultBackupSettings },
    editorPreferences: {
      ...settings.editorPreferences,
      editorFontFamily: { ...defaultEditorPreferences.editorFontFamily },
      imageUpload: portableImageUpload,
      markdownTemplates: []
    },
    exportSettings: {
      ...settings.exportSettings,
      fontFamily: null,
      pandocPath: ""
    },
    network: { ...defaultNetworkSettings },
    syncSettings: { ...defaultSyncSettings }
  };
}

export function createSettingsBackupFile(
  settings: PortableStoredAppSettings,
  options: CreateSettingsBackupFileOptions
) {
  const backupFile: SettingsBackupFile = {
    exportedAt: (options.exportedAt ?? new Date()).toISOString(),
    format: settingsBackupFormat,
    includesSensitiveSettings: options.includeSensitiveSettings,
    settings: portableSettingsForBackup(settings, options.includeSensitiveSettings),
    version: settingsBackupVersion
  };

  return JSON.stringify(backupFile, null, 2);
}

function parseSettingsBackupFile(contents: string): SettingsBackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw invalidSettingsBackupFile();
  }

  if (!settingsRecord(parsed)) throw invalidSettingsBackupFile();
  if (parsed.version !== settingsBackupVersion) throw invalidSettingsBackupFile();
  if (!settingsRecord(parsed.settings)) throw invalidSettingsBackupFile();
  const legacySettingsExport = parsed.format === legacySettingsExportFormat;
  if (!legacySettingsExport && parsed.format !== settingsBackupFormat) {
    throw invalidSettingsBackupFile();
  }
  if (!legacySettingsExport && typeof parsed.includesSensitiveSettings !== "boolean") {
    throw invalidSettingsBackupFile();
  }

  return {
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    format: settingsBackupFormat,
    includesSensitiveSettings: legacySettingsExport ? true : parsed.includesSensitiveSettings as boolean,
    settings: normalizePortableStoredAppSettings(parsed.settings),
    version: settingsBackupVersion
  };
}

function preserveLocalAiCredentials(
  remote: PortableStoredAppSettings["aiProviders"],
  local: PortableStoredAppSettings["aiProviders"]
) {
  const localProviders = new Map(local.providers.map((provider) => [provider.id, provider]));

  return {
    ...remote,
    providers: remote.providers.map((provider) => {
      const localProvider = localProviders.get(provider.id);

      return {
        ...provider,
        apiKey: localProvider?.apiKey ?? "",
        customHeaders: localProvider?.customHeaders ?? ""
      };
    })
  };
}

function preserveLocalStorageCredentials(
  remote: PortableStoredAppSettings["editorPreferences"]["imageUpload"],
  local: PortableStoredAppSettings["editorPreferences"]["imageUpload"]
) {
  return {
    ...remote,
    picgo: {
      ...remote.picgo,
      secret: local.picgo.secret
    },
    s3: {
      ...remote.s3,
      accessKeyId: local.s3.accessKeyId,
      secretAccessKey: local.s3.secretAccessKey
    },
    webdav: {
      ...remote.webdav,
      password: local.webdav.password,
      username: local.webdav.username
    }
  };
}

export function restoreSettingsBackupFile(
  contents: string,
  localSettings: PortableStoredAppSettings
): PortableStoredAppSettings {
  const backupFile = parseSettingsBackupFile(contents);
  const remoteSettings = backupFile.settings;
  const preserveCredentials = !backupFile.includesSensitiveSettings;

  return {
    ...remoteSettings,
    acpAgentSettings: localSettings.acpAgentSettings,
    aiProviders: preserveCredentials
      ? preserveLocalAiCredentials(remoteSettings.aiProviders, localSettings.aiProviders)
      : remoteSettings.aiProviders,
    backupSettings: localSettings.backupSettings,
    editorPreferences: {
      ...remoteSettings.editorPreferences,
      editorFontFamily: localSettings.editorPreferences.editorFontFamily,
      imageUpload: preserveCredentials
        ? preserveLocalStorageCredentials(
            remoteSettings.editorPreferences.imageUpload,
            localSettings.editorPreferences.imageUpload
          )
        : remoteSettings.editorPreferences.imageUpload,
      markdownTemplates: localSettings.editorPreferences.markdownTemplates
    },
    exportSettings: {
      ...remoteSettings.exportSettings,
      fontFamily: localSettings.exportSettings.fontFamily,
      pandocPath: localSettings.exportSettings.pandocPath
    },
    network: localSettings.network,
    syncSettings: localSettings.syncSettings
  };
}
