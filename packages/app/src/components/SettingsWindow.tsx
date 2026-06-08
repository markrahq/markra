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
  SyncSettings,
  StorageSettings,
  TemplatesSettings,
  WebSearchSettings
} from "./SettingsSections";
import { SettingsContent, SettingsSidebar } from "./SettingsShell";
import { useSettingsWindowState } from "../hooks/useSettingsWindowState";
import { useAutoUpdater } from "../hooks/useAutoUpdater";
import { useDefaultContextMenuBlocker } from "../hooks/useDefaultContextMenuBlocker";
import { appVersion } from "../lib/app-version";
import { resolveDesktopPlatform } from "../lib/platform";
import { closeNativeWindow } from "../lib/tauri";
import { MacWindowControls } from "./MacWindowControls";
import { getAppRuntime } from "../runtime";
import type { SettingsCategory } from "../hooks/useSettingsWindowState";

export function SettingsWindow() {
  const settingsState = useSettingsWindowState();
  const {
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
    handleRunBackup,
    handleRunSync,
    handleSaveAiSettings,
    handleTestAiProvider,
    handleChooseBackupTargetPath,
    handleDetectPandocPath,
    handleUpdateAiSettings,
    handleUpdateBackupSettings,
    handleUpdateSyncSettings,
    handleUpdateEditorPreferences,
    handleUpdateMarkdownTemplate,
    handleUpdateExportSettings,
    handleUpdateWebSearchSettings,
    markdownTemplates,
    selectedAiProvider,
    setActiveCategory,
    setSelectedAiProviderId,
    settingsFocusTarget,
    syncRunning,
    syncSettings,
    clearSettingsFocusTarget,
    translate,
    webSearchSettings,
    welcomeReset
  } = settingsState;
  const appFeatures = getAppRuntime().features;
  const hiddenCategories: SettingsCategory[] = [
    ...(appFeatures.ai ? [] : (["ai", "providers", "web"] as SettingsCategory[])),
    ...(appFeatures.export ? [] : (["export"] as SettingsCategory[]))
  ];
  const activeSettingsCategory = hiddenCategories.includes(activeCategory) ? "general" : activeCategory;
  const platform = resolveDesktopPlatform();
  const handleCloseSettings = () => {
    closeNativeWindow().catch(() => {});
  };
  useDefaultContextMenuBlocker();
  const updater = useAutoUpdater(appLanguage.language, appFeatures.updater && appLanguage.ready, {
    autoCheck: false
  });

  return (
    <main
      className="settings-window relative h-screen overflow-hidden overscroll-none bg-(--bg-primary) text-(--text-primary)"
      aria-label={translate("settings.aria.main")}
    >
      <AppToaster language={appLanguage.language} />
      {platform === "windows" ? null : (
        <div
          className="settings-drag-region fixed inset-x-0 top-0 z-10 h-9.5 select-none [-webkit-user-select:none]"
          aria-label={translate("settings.aria.dragRegion")}
          data-tauri-drag-region
        />
      )}
      {platform === "macos" ? (
        <MacWindowControls className="fixed top-0 left-0 z-20 h-9.5" />
      ) : null}
      <div className="settings-layout grid h-screen grid-cols-[180px_minmax(0,1fr)]">
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
              onResetWelcomeDocument={handleResetWelcomeDocument}
              onSelectLanguage={appLanguage.selectLanguage}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {appFeatures.ai && activeSettingsCategory === "ai" ? (
            <AiSettings
              language={appLanguage.language}
              preferences={editorPreferences}
              translate={translate}
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
              translate={translate}
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
              customThemeCss={appTheme.customThemeCss}
              selectedTheme={appTheme.theme}
              translate={translate}
              onUpdateCustomThemeCss={appTheme.updateCustomThemeCss}
              onSelectTheme={appTheme.selectTheme}
            />
          ) : null}
          {activeSettingsCategory === "editor" ? (
            <EditorSettings
              aiEnabled={appFeatures.ai}
              preferences={editorPreferences}
              s3ImageUploadEnabled={appFeatures.s3ImageUpload}
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
