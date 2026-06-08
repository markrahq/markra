import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  createCustomAiProvider,
  createDefaultAiSettings,
  fetchAiProviderModels,
  testAiProviderConnection
} from "@markra/providers";
import { t, type I18nKey } from "@markra/shared";
import {
  getStoredAiSettings,
  getStoredBackupSettings,
  getStoredSyncSettings,
  getStoredEditorPreferences,
  getStoredExportSettings,
  getStoredWebSearchSettings,
  getStoredWorkspaceState,
  defaultBackupSettings,
  defaultSyncSettings,
  defaultEditorPreferences,
  defaultExportSettings,
  defaultWebSearchSettings,
  resetWelcomeDocumentState,
  saveStoredAiSettings,
  saveStoredBackupSettings,
  saveStoredSyncSettings,
  saveStoredEditorPreferences,
  saveStoredExportSettings,
  saveStoredWebSearchSettings,
  normalizeBackupSettings,
  normalizeSyncSettings,
  normalizeExportSettings,
  normalizeWebSearchSettings,
  type AiProviderConfig,
  type AiProviderModel,
  type AiProviderSettings,
  type BackupSettings,
  type EditorPreferences,
  type ExportSettings,
  type WebSearchSettings,
  type SyncSettings
} from "../lib/settings/app-settings";
import {
  listenAppEditorPreferencesChanged,
  notifyAppAiSettingsChanged,
  notifyAppBackupSettingsChanged,
  notifyAppEditorPreferencesChanged,
  notifyAppExportSettingsChanged,
  notifyAppWebSearchSettingsChanged,
  notifyAppSyncSettingsChanged
} from "../lib/settings/settings-events";
import { runMarkdownBackup } from "../lib/backup";
import { runMarkdownSync } from "../lib/sync";
import {
  detectNativePandocPath,
  deleteNativeMarkdownTemplateFile,
  openNativeMarkdownFolder,
  readNativeMarkdownTemplateFile,
  requestNativeAiJson,
  writeNativeMarkdownTemplateFile
} from "../lib/tauri";
import { showAppToast } from "../lib/app-toast";
import {
  listenNativeSettingsWindowTarget,
  type NativeSettingsWindowTarget
} from "../lib/tauri/window";
import {
  loadMarkdownTemplatesFromEntries,
  markdownTemplateEntryFromTemplate,
  type MarkdownTemplate
} from "../lib/templates";
import { useAppLanguage } from "./useAppLanguage";
import { useAppTheme } from "./useAppTheme";

export type SettingsCategory =
  | "general"
  | "ai"
  | "providers"
  | "web"
  | "storage"
  | "backup"
  | "sync"
  | "appearance"
  | "editor"
  | "templates"
  | "keyboardShortcuts"
  | "export";

export type SettingsFocusTarget = "pandocPath";

function settingsTargetFromSearch(search: string): NativeSettingsWindowTarget | null {
  const target = new URLSearchParams(search).get("settingsTarget");

  return target === "exportPandocPath" ? target : null;
}

function settingsCategoryForTarget(target: NativeSettingsWindowTarget | null): SettingsCategory {
  return target === "exportPandocPath" ? "export" : "general";
}

function settingsFocusTargetForNativeTarget(target: NativeSettingsWindowTarget | null): SettingsFocusTarget | null {
  return target === "exportPandocPath" ? "pandocPath" : null;
}

export function useSettingsWindowState() {
  const appTheme = useAppTheme();
  const appLanguage = useAppLanguage();
  const initialSettingsTarget = settingsTargetFromSearch(window.location.search);
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(() =>
    settingsCategoryForTarget(initialSettingsTarget)
  );
  const [settingsFocusTarget, setSettingsFocusTarget] = useState<SettingsFocusTarget | null>(() =>
    settingsFocusTargetForNativeTarget(initialSettingsTarget)
  );
  const [aiSettings, setAiSettings] = useState<AiProviderSettings>(() => createDefaultAiSettings());
  const [aiSettingsSaved, setAiSettingsSaved] = useState(false);
  const [backupSettings, setBackupSettings] = useState<BackupSettings>(defaultBackupSettings);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupSourcePath, setBackupSourcePath] = useState<string | null>(null);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(defaultSyncSettings);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncSourcePath, setSyncSourcePath] = useState<string | null>(null);
  const [editorPreferences, setEditorPreferences] = useState<EditorPreferences>(defaultEditorPreferences);
  const [markdownTemplates, setMarkdownTemplates] = useState<MarkdownTemplate[]>([]);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(defaultExportSettings);
  const [webSearchSettings, setWebSearchSettings] = useState<WebSearchSettings>(defaultWebSearchSettings);
  const [selectedAiProviderId, setSelectedAiProviderId] = useState<string | undefined>(
    () => createDefaultAiSettings().defaultProviderId
  );
  const [welcomeReset, setWelcomeReset] = useState(false);
  const translate = useCallback((key: I18nKey) => t(appLanguage.language, key), [appLanguage.language]);
  const selectedAiProvider = useMemo(
    () => aiSettings.providers.find((provider) => provider.id === selectedAiProviderId) ?? aiSettings.providers[0],
    [aiSettings.providers, selectedAiProviderId]
  );
  const handleSelectCategory = useCallback((category: SettingsCategory) => {
    setActiveCategory(category);
    setSettingsFocusTarget(null);
  }, []);
  const handleSettingsWindowTarget = useCallback((target: NativeSettingsWindowTarget) => {
    setActiveCategory(settingsCategoryForTarget(target));
    setSettingsFocusTarget(settingsFocusTargetForNativeTarget(target));
  }, []);
  const clearSettingsFocusTarget = useCallback(() => {
    setSettingsFocusTarget(null);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.dataset.window = "settings";

    return () => {
      delete document.documentElement.dataset.window;
    };
  }, []);

  useLayoutEffect(() => {
    document.title = translate("settings.title");
  }, [translate]);

  useEffect(() => {
    let cancelled = false;
    let stopListening: (() => unknown) | null = null;

    listenNativeSettingsWindowTarget((target) => {
      if (!cancelled) handleSettingsWindowTarget(target);
    }).then((cleanup) => {
      if (cancelled) {
        cleanup();
        return;
      }

      stopListening = cleanup;
    }).catch(() => {});

    return () => {
      cancelled = true;
      stopListening?.();
    };
  }, [handleSettingsWindowTarget]);

  useEffect(() => {
    let cancelled = false;

    getStoredAiSettings().then((settings) => {
      if (cancelled) return;
      setAiSettings(settings);
      setSelectedAiProviderId(settings.defaultProviderId ?? settings.providers[0]?.id);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getStoredWebSearchSettings().then((settings) => {
      if (!cancelled) setWebSearchSettings(settings);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getStoredBackupSettings().then((settings) => {
      if (!cancelled) setBackupSettings(settings);
    }).catch(() => {
      if (!cancelled) setBackupSettings(defaultBackupSettings);
    });

    getStoredSyncSettings().then((settings) => {
      if (!cancelled) setSyncSettings(settings);
    }).catch(() => {
      if (!cancelled) setSyncSettings(defaultSyncSettings);
    });

    getStoredWorkspaceState().then((workspace) => {
      if (cancelled) return;

      const sourcePath =
        workspace.folderPath ??
        workspace.filePath ??
        workspace.openFilePaths[0] ??
        null;
      setBackupSourcePath(sourcePath);
      setSyncSourcePath(sourcePath);
    }).catch(() => {
      if (!cancelled) setBackupSourcePath(null);
      if (!cancelled) setSyncSourcePath(null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getStoredExportSettings().then((settings) => {
      if (!cancelled) setExportSettings(settings);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stopListening: (() => unknown) | null = null;

    getStoredEditorPreferences().then((preferences) => {
      if (cancelled) return;

      setEditorPreferences(preferences);
      loadMarkdownTemplatesFromEntries(preferences.markdownTemplates, readNativeMarkdownTemplateFile)
        .then((templates) => {
          if (!cancelled) setMarkdownTemplates(templates);
        })
        .catch(() => {
          if (!cancelled) setMarkdownTemplates([]);
        });
    }).catch(() => {});

    listenAppEditorPreferencesChanged((preferences) => {
      if (cancelled) return;

      setEditorPreferences(preferences);
      loadMarkdownTemplatesFromEntries(preferences.markdownTemplates, readNativeMarkdownTemplateFile)
        .then((templates) => {
          if (!cancelled) setMarkdownTemplates(templates);
        })
        .catch(() => {
          if (!cancelled) setMarkdownTemplates([]);
        });
    }).then((cleanup) => {
      if (cancelled) {
        cleanup();
        return;
      }

      stopListening = cleanup;
    }).catch(() => {});

    return () => {
      cancelled = true;
      stopListening?.();
    };
  }, []);

  const handleResetWelcomeDocument = useCallback(() => {
    resetWelcomeDocumentState().then(() => {
      setWelcomeReset(true);
    }).catch(() => {});
  }, []);

  const handleAddAiProvider = useCallback(() => {
    setAiSettingsSaved(false);
    setAiSettings((currentSettings) => {
      const provider = createCustomAiProvider(currentSettings.providers.length + 1);
      setSelectedAiProviderId(provider.id);

      return {
        ...currentSettings,
        providers: [...currentSettings.providers, provider]
      };
    });
  }, []);

  const handleUpdateAiSettings = useCallback((settings: AiProviderSettings) => {
    setAiSettingsSaved(false);
    setAiSettings(settings);
  }, []);

  const handleSaveAiSettings = useCallback(() => {
    const settingsToSave = {
      ...aiSettings,
      defaultProviderId: selectedAiProvider?.id ?? aiSettings.defaultProviderId,
      defaultModelId: selectedAiProvider?.defaultModelId ?? aiSettings.defaultModelId
    };

    saveStoredAiSettings(settingsToSave).then(() => {
      setAiSettings(settingsToSave);
      setAiSettingsSaved(true);
      notifyAppAiSettingsChanged(settingsToSave).catch(() => {});
    }).catch(() => {});
  }, [aiSettings, selectedAiProvider]);

  const handleTestAiProvider = useCallback((provider: AiProviderConfig) =>
    testAiProviderConnection(provider, requestNativeAiJson), []);

  const handleFetchAiProviderModels = useCallback((provider: AiProviderConfig): Promise<AiProviderModel[]> => {
    return fetchAiProviderModels(provider, requestNativeAiJson);
  }, []);

  const handleUpdateEditorPreferences = useCallback((preferences: EditorPreferences) => {
    setEditorPreferences(preferences);
    saveStoredEditorPreferences(preferences)
      .then(() => notifyAppEditorPreferencesChanged(preferences))
      .catch(() => {});
  }, []);

  const handleSaveMarkdownTemplate = useCallback((template: MarkdownTemplate) => {
    const entry = markdownTemplateEntryFromTemplate(template);
    const nextPreferences = {
      ...editorPreferences,
      markdownTemplates: editorPreferences.markdownTemplates.some((storedTemplate) => storedTemplate.id === entry.id)
        ? editorPreferences.markdownTemplates.map((storedTemplate) => storedTemplate.id === entry.id ? entry : storedTemplate)
        : [...editorPreferences.markdownTemplates, entry]
    };
    const nextTemplate = {
      ...template,
      fileName: entry.fileName
    };

    setEditorPreferences(nextPreferences);
    setMarkdownTemplates((currentTemplates) =>
      currentTemplates.some((storedTemplate) => storedTemplate.id === nextTemplate.id)
        ? currentTemplates.map((storedTemplate) => storedTemplate.id === nextTemplate.id ? nextTemplate : storedTemplate)
        : [...currentTemplates, nextTemplate]
    );

    writeNativeMarkdownTemplateFile(entry.fileName, template.content)
      .then(() => saveStoredEditorPreferences(nextPreferences))
      .then(() => notifyAppEditorPreferencesChanged(nextPreferences))
      .catch(() => {});
  }, [editorPreferences]);

  const handleDeleteMarkdownTemplate = useCallback((template: MarkdownTemplate) => {
    const entry = editorPreferences.markdownTemplates.find((storedTemplate) => storedTemplate.id === template.id);
    const nextPreferences = {
      ...editorPreferences,
      markdownTemplates: editorPreferences.markdownTemplates.filter((storedTemplate) => storedTemplate.id !== template.id)
    };

    setEditorPreferences(nextPreferences);
    setMarkdownTemplates((currentTemplates) =>
      currentTemplates.filter((storedTemplate) => storedTemplate.id !== template.id)
    );

    const deleteTemplateFile = entry
      ? deleteNativeMarkdownTemplateFile(entry.fileName)
      : Promise.resolve();

    deleteTemplateFile
      .then(() => saveStoredEditorPreferences(nextPreferences))
      .then(() => notifyAppEditorPreferencesChanged(nextPreferences))
      .catch(() => {});
  }, [editorPreferences]);

  const handleUpdateExportSettings = useCallback((settings: ExportSettings) => {
    const normalizedSettings = normalizeExportSettings(settings);
    setExportSettings(normalizedSettings);
    saveStoredExportSettings(normalizedSettings)
      .then(() => notifyAppExportSettingsChanged(normalizedSettings))
      .catch(() => {});
  }, []);
  const handleDetectPandocPath = useCallback(() => {
    detectNativePandocPath().then((path) => {
      if (!path) {
        showAppToast({
          message: translate("settings.export.pandocPathNotFound"),
          status: "error"
        });
        return;
      }

      handleUpdateExportSettings({
        ...exportSettings,
        pandocPath: path
      });
      showAppToast({
        message: translate("settings.export.pandocPathDetected"),
        status: "success"
      });
    }).catch(() => {
      showAppToast({
        message: translate("settings.export.pandocPathNotFound"),
        status: "error"
      });
    });
  }, [exportSettings, handleUpdateExportSettings, translate]);

  const handleUpdateWebSearchSettings = useCallback((settings: WebSearchSettings) => {
    const normalizedSettings = normalizeWebSearchSettings(settings);
    setWebSearchSettings(normalizedSettings);
    saveStoredWebSearchSettings(normalizedSettings)
      .then(() => notifyAppWebSearchSettingsChanged(normalizedSettings))
      .catch(() => {});
  }, []);

  const handleUpdateBackupSettings = useCallback((settings: BackupSettings) => {
    const normalizedSettings = normalizeBackupSettings(settings);
    setBackupSettings(normalizedSettings);
    saveStoredBackupSettings(normalizedSettings)
      .then(() => notifyAppBackupSettingsChanged(normalizedSettings))
      .catch(() => {});
  }, []);

  const handleUpdateSyncSettings = useCallback((settings: SyncSettings) => {
    const normalizedSettings = normalizeSyncSettings(settings);
    setSyncSettings(normalizedSettings);
    saveStoredSyncSettings(normalizedSettings)
      .then(() => notifyAppSyncSettingsChanged(normalizedSettings))
      .catch(() => {});
  }, []);

  const handleChooseBackupTargetPath = useCallback(() => {
    openNativeMarkdownFolder({
      title: translate("settings.backup.targetPickerTitle")
    }).then((folder) => {
      if (!folder) return;

      handleUpdateBackupSettings({
        ...backupSettings,
        targetPath: folder.path
      });
    }).catch(() => {});
  }, [backupSettings, handleUpdateBackupSettings, translate]);

  const handleRunBackup = useCallback(() => {
    if (backupRunning) return;

    setBackupRunning(true);
    showAppToast({
      id: "backup",
      message: translate("settings.backup.running"),
      status: "loading"
    });
    runMarkdownBackup({
      settings: backupSettings,
      sourcePath: backupSourcePath
    }).then((result) => {
      if (result.status === "skipped") {
        showAppToast({
          id: "backup",
          message: translate(
            result.reason === "missing-source"
              ? "settings.backup.missingSource"
              : "settings.backup.missingTarget"
          ),
          status: "error"
        });
        return;
      }

      setBackupSettings(result.settings);
      notifyAppBackupSettingsChanged(result.settings).catch(() => {});
      showAppToast({
        id: "backup",
        message: translate("settings.backup.completed"),
        status: "success"
      });
    }).catch(() => {
      showAppToast({
        id: "backup",
        message: translate("settings.backup.failed"),
        status: "error"
      });
    }).finally(() => {
      setBackupRunning(false);
    });
  }, [backupRunning, backupSettings, backupSourcePath, translate]);

  const handleRunSync = useCallback(() => {
    if (syncRunning) return;

    setSyncRunning(true);
    showAppToast({
      id: "sync",
      message: translate("settings.sync.running"),
      status: "loading"
    });
    runMarkdownSync({
      settings: syncSettings,
      sourcePath: syncSourcePath,
      storageWebDavSettings: editorPreferences.imageUpload.webdav
    }).then((result) => {
      if (result.status === "skipped") {
        showAppToast({
          id: "sync",
          message: translate(
            result.reason === "missing-source"
              ? "settings.sync.missingSource"
              : "settings.sync.missingWebDav"
          ),
          status: "error"
        });
        return;
      }

      setSyncSettings(result.settings);
      notifyAppSyncSettingsChanged(result.settings).catch(() => {});
      showAppToast({
        id: "sync",
        message: translate("settings.sync.completed"),
        status: "success"
      });
    }).catch(() => {
      showAppToast({
        id: "sync",
        message: translate("settings.sync.failed"),
        status: "error"
      });
    }).finally(() => {
      setSyncRunning(false);
    });
  }, [editorPreferences.imageUpload.webdav, syncRunning, syncSettings, syncSourcePath, translate]);

  return {
    activeCategory,
    aiSettings,
    aiSettingsSaved,
    appLanguage,
    appTheme,
    backupRunning,
    backupSettings,
    editorPreferences,
    exportSettings,
    handleAddAiProvider,
    handleFetchAiProviderModels,
    handleResetWelcomeDocument,
    handleSaveAiSettings,
    handleTestAiProvider,
    handleChooseBackupTargetPath,
    handleCreateMarkdownTemplate: handleSaveMarkdownTemplate,
    handleDeleteMarkdownTemplate,
    handleUpdateMarkdownTemplate: handleSaveMarkdownTemplate,
    handleUpdateAiSettings,
    handleRunBackup,
    handleRunSync,
    handleUpdateBackupSettings,
    handleUpdateSyncSettings,
    handleUpdateEditorPreferences,
    handleUpdateExportSettings,
    handleDetectPandocPath,
    handleUpdateWebSearchSettings,
    selectedAiProvider,
    setActiveCategory: handleSelectCategory,
    setSelectedAiProviderId,
    markdownTemplates,
    settingsFocusTarget,
    syncRunning,
    syncSettings,
    clearSettingsFocusTarget,
    translate,
    webSearchSettings,
    welcomeReset
  };
}
