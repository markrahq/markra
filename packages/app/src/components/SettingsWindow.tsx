import { useEffect } from "react";
import { AppToaster } from "./AppToaster";
import { AiProviderSettingsPanel } from "./AiProviderSettingsPanel";
import {
  AiSettings,
  AppearanceSettings,
  BackupSettings,
  EditorSettings,
  ExportSettings,
  GeneralSettings,
  KeyboardShortcutsSettings,
  NetworkSettings,
  SpellcheckSettings,
  SyncSettings,
  StorageSettings,
  TemplatesSettings,
  ViewSettings,
  WebSearchSettings
} from "./SettingsSections";
import { SettingsContent, SettingsSidebar } from "./SettingsShell";
import { useSettingsWindowState } from "../hooks/useSettingsWindowState";
import { useAutoUpdater } from "../hooks/useAutoUpdater";
import { useDefaultContextMenuBlocker } from "../hooks/useDefaultContextMenuBlocker";
import { appVersion } from "../lib/app-version";
import { resolveDesktopPlatform } from "../lib/platform";
import { hideSettingsWindow, markSettingsWindowReady } from "../lib/tauri";
import { MacWindowControls } from "./MacWindowControls";
import { WindowsWindowControls } from "./WindowsWindowControls";
import { getAppRuntime } from "../runtime";
import type { SettingsCategory } from "../hooks/useSettingsWindowState";

export function SettingsWindow() {
  const settingsState = useSettingsWindowState();
  const {
    acpAgentSettings,
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
    handleCreateMarkdownTemplate,
    handleDeleteMarkdownTemplate,
    handleResetWelcomeDocument,
    handleExportSettings,
    handleImportSettings,
    handleRunBackup,
    handleRunSync,
    handleInstallShellCommand,
    handleSaveAiSettings,
    handleTestAiProvider,
    handleChooseBackupTargetPath,
    handleDetectPandocPath,
    handleRefreshShellCommandStatus,
    handleUninstallShellCommand,
    handleUpdateAcpAgentSettings,
    handleUpdateAiSettings,
    handleUpdateBackupSettings,
    handleUpdateSyncSettings,
    handleUpdateEditorPreferences,
    handleUpdateMarkdownTemplate,
    handleUpdateExportSettings,
    handleUpdateNetworkSettings,
    handleUpdateWebSearchSettings,
    markdownTemplates,
    networkSettings,
    selectedAiProvider,
    setActiveCategory,
    setSelectedAiProviderId,
    settingsFocusTarget,
    settingsTransferRunning,
    shellCommandRunning,
    shellCommandStatus,
    syncRunning,
    syncSettings,
    systemFontFamilies,
    clearSettingsFocusTarget,
    translate,
    webSearchSettings,
    welcomeReset
  } = settingsState;
  const appFeatures = getAppRuntime().features;
  const hiddenCategories: SettingsCategory[] = [
    ...(appFeatures.ai ? [] : (["ai", "providers", "web"] as SettingsCategory[])),
    ...(appFeatures.networkProxy ? [] : (["network"] as SettingsCategory[])),
    ...(appFeatures.export ? [] : (["export"] as SettingsCategory[])),
    ...(appFeatures.spellcheck ? [] : (["spellcheck"] as SettingsCategory[]))
  ];
  const activeSettingsCategory = hiddenCategories.includes(activeCategory) ? "general" : activeCategory;
  const platform = resolveDesktopPlatform();
  const showWindowsWindowChrome = platform === "windows" && appFeatures.nativeWindowChrome;
  const showMacosWindowChrome = platform === "macos" && appFeatures.nativeWindowChrome;
  const settingsStartupReady = appLanguage.ready && appTheme.ready;
  const settingsLayoutClassName = showWindowsWindowChrome
    ? "settings-layout absolute inset-x-0 top-10 bottom-0 grid grid-cols-[180px_minmax(0,1fr)]"
    : "settings-layout grid h-screen grid-cols-[180px_minmax(0,1fr)]";
  const handleCloseSettings = () => {
    hideSettingsWindow().catch(() => {});
  };
  useDefaultContextMenuBlocker();
  const updater = useAutoUpdater(appLanguage.language, appFeatures.updater && appLanguage.ready, {
    autoCheck: false
  });
  useEffect(() => {
    if (!settingsStartupReady) return;

    markSettingsWindowReady().catch(() => {});
  }, [settingsStartupReady]);

  if (!settingsStartupReady) return null;

  return (
    <main
      className="settings-window relative h-screen overflow-hidden overscroll-none bg-(--bg-primary) text-(--text-primary)"
      aria-label={translate("settings.aria.main")}
    >
      <AppToaster language={appLanguage.language} />
      {showMacosWindowChrome ? (
        <div
          className="settings-drag-region fixed inset-x-0 top-0 z-10 h-9.5 select-none [-webkit-user-select:none]"
          aria-label={translate("settings.aria.dragRegion")}
          data-tauri-drag-region
        />
      ) : null}
      {showMacosWindowChrome ? (
        <MacWindowControls
          className="fixed top-0 left-0 z-20 h-9.5"
          onClose={handleCloseSettings}
        />
      ) : null}
      {showWindowsWindowChrome ? (
        <header
          className="settings-window-chrome fixed inset-x-0 top-0 z-30 grid h-10 grid-cols-[minmax(0,1fr)_auto] select-none items-center bg-(--bg-chrome) [-webkit-user-select:none]"
          aria-label={translate("settings.aria.dragRegion")}
          data-tauri-drag-region
        >
          <div
            className="relative z-20 flex h-10 items-center px-3 text-[12px] leading-none font-[620] text-(--text-heading)"
            data-tauri-drag-region
          >
            Markra
          </div>
          <div
            className="pointer-events-none absolute top-0 left-1/2 z-10 flex h-10 -translate-x-1/2 items-center justify-center px-6 text-[12px] leading-none font-[620] text-(--text-heading)"
            data-tauri-drag-region
          >
            {translate("settings.title")}
          </div>
          <WindowsWindowControls onClose={handleCloseSettings} />
        </header>
      ) : null}
      <div className={settingsLayoutClassName}>
        <SettingsSidebar
          activeCategory={activeSettingsCategory}
          appVersion={appVersion}
          hiddenCategories={hiddenCategories}
          platform={platform}
          translate={translate}
          onCategoryChange={setActiveCategory}
        />
        <SettingsContent
          activeCategory={activeSettingsCategory}
          platform={platform}
          translate={translate}
          onClose={platform === "linux" ? handleCloseSettings : undefined}
        >
          {activeSettingsCategory === "general" ? (
            <GeneralSettings
              appVersion={appVersion}
              preferences={editorPreferences}
              language={appLanguage.language}
              translate={translate}
              updatesEnabled={appFeatures.updater}
              welcomeReset={welcomeReset}
              onCheckForUpdates={updater.checkForUpdates}
              onInstallShellCommand={handleInstallShellCommand}
              onRefreshShellCommand={handleRefreshShellCommandStatus}
              onResetWelcomeDocument={handleResetWelcomeDocument}
              onSelectLanguage={appLanguage.selectLanguage}
              onUninstallShellCommand={handleUninstallShellCommand}
              onUpdatePreferences={handleUpdateEditorPreferences}
              shellCommandRunning={shellCommandRunning}
              shellCommandStatus={shellCommandStatus}
            />
          ) : null}
          {activeSettingsCategory === "network" ? (
            <NetworkSettings
              settings={networkSettings}
              translate={translate}
              onUpdateSettings={handleUpdateNetworkSettings}
            />
          ) : null}
          {appFeatures.ai && activeSettingsCategory === "ai" ? (
            <AiSettings
              acpAgentSettings={acpAgentSettings}
              language={appLanguage.language}
              preferences={editorPreferences}
              translate={translate}
              onUpdateAcpAgentSettings={handleUpdateAcpAgentSettings}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {appFeatures.ai && activeSettingsCategory === "providers" ? (
            <AiProviderSettingsPanel
              saved={aiSettingsSaved}
              selectedProviderId={selectedAiProvider?.id}
              settings={aiSettings}
              translate={translate}
              onAddProvider={handleAddAiProvider}
              onFetchModels={handleFetchAiProviderModels}
              onSave={handleSaveAiSettings}
              onSelectProvider={setSelectedAiProviderId}
              onTestProvider={handleTestAiProvider}
              onUpdateSettings={handleUpdateAiSettings}
            />
          ) : null}
          {appFeatures.ai && activeSettingsCategory === "web" ? (
            <WebSearchSettings
              settings={webSearchSettings}
              translate={translate}
              onUpdateSettings={handleUpdateWebSearchSettings}
            />
          ) : null}
          {activeSettingsCategory === "storage" ? (
            <StorageSettings
              preferences={editorPreferences}
              s3ImageUploadEnabled={appFeatures.s3ImageUpload}
              settingsTransferRunning={settingsTransferRunning}
              translate={translate}
              onExportSettings={handleExportSettings}
              onImportSettings={handleImportSettings}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {activeSettingsCategory === "backup" ? (
            <BackupSettings
              backupRunning={backupRunning}
              settings={backupSettings}
              translate={translate}
              onChooseTargetPath={handleChooseBackupTargetPath}
              onRunBackup={handleRunBackup}
              onUpdateSettings={handleUpdateBackupSettings}
            />
          ) : null}
          {activeSettingsCategory === "sync" ? (
            <SyncSettings
              settings={syncSettings}
              syncRunning={syncRunning}
              translate={translate}
              onRunSync={handleRunSync}
              onUpdateSettings={handleUpdateSyncSettings}
            />
          ) : null}
          {activeSettingsCategory === "appearance" ? (
            <AppearanceSettings
              darkCustomThemeCss={appTheme.darkCustomThemeCss}
              lightCustomThemeCss={appTheme.lightCustomThemeCss}
              selectedAppearanceMode={appTheme.appearanceMode}
              selectedDarkTheme={appTheme.darkTheme}
              selectedLightTheme={appTheme.lightTheme}
              translate={translate}
              onUpdateDarkCustomThemeCss={appTheme.updateDarkCustomThemeCss}
              onUpdateLightCustomThemeCss={appTheme.updateLightCustomThemeCss}
              onSelectAppearanceMode={appTheme.selectAppearanceMode}
              onSelectDarkTheme={appTheme.selectDarkTheme}
              onSelectLightTheme={appTheme.selectLightTheme}
            />
          ) : null}
          {activeSettingsCategory === "view" ? (
            <ViewSettings
              preferences={editorPreferences}
              translate={translate}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {activeSettingsCategory === "editor" ? (
            <EditorSettings
              aiEnabled={appFeatures.ai}
              preferences={editorPreferences}
              s3ImageUploadEnabled={appFeatures.s3ImageUpload}
              systemFontFamilies={systemFontFamilies}
              translate={translate}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {appFeatures.spellcheck && activeSettingsCategory === "spellcheck" ? (
            <SpellcheckSettings
              preferences={editorPreferences}
              translate={translate}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {activeSettingsCategory === "templates" ? (
            <TemplatesSettings
              preferences={editorPreferences}
              templates={markdownTemplates}
              translate={translate}
              onCreateTemplate={handleCreateMarkdownTemplate}
              onDeleteTemplate={handleDeleteMarkdownTemplate}
              onUpdateTemplate={handleUpdateMarkdownTemplate}
            />
          ) : null}
          {activeSettingsCategory === "keyboardShortcuts" ? (
            <KeyboardShortcutsSettings
              aiEnabled={appFeatures.ai}
              platform={platform}
              preferences={editorPreferences}
              translate={translate}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {appFeatures.export && activeSettingsCategory === "export" ? (
            <ExportSettings
              focusTarget={settingsFocusTarget}
              pandocEnabled={appFeatures.pandoc}
              settings={exportSettings}
              translate={translate}
              onDetectPandocPath={handleDetectPandocPath}
              onFocusTargetHandled={clearSettingsFocusTarget}
              onUpdateSettings={handleUpdateExportSettings}
            />
          ) : null}
        </SettingsContent>
      </div>
    </main>
  );
}
