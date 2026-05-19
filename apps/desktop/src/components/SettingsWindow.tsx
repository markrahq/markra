import { AppToaster } from "./AppToaster";
import { AiProviderSettingsPanel } from "./AiProviderSettingsPanel";
import {
  AiSettings,
  AppearanceSettings,
  EditorSettings,
  ExportSettings,
  GeneralSettings,
  KeyboardShortcutsSettings,
  StorageSettings,
  WebSearchSettings
} from "./SettingsSections";
import { SettingsContent, SettingsSidebar } from "./SettingsShell";
import { useSettingsWindowState } from "../hooks/useSettingsWindowState";
import { useAutoUpdater } from "../hooks/useAutoUpdater";
import { useDefaultContextMenuBlocker } from "../hooks/useDefaultContextMenuBlocker";
import { appVersion } from "../lib/app-version";
import { resolveDesktopPlatform } from "../lib/platform";
import { MacWindowControls } from "./MacWindowControls";

export function SettingsWindow() {
  const settingsState = useSettingsWindowState();
  const {
    activeCategory,
    aiSettings,
    aiSettingsSaved,
    appLanguage,
    appTheme,
    editorPreferences,
    exportSettings,
    handleAddAiProvider,
    handleFetchAiProviderModels,
    handleResetWelcomeDocument,
    handleSaveAiSettings,
    handleTestAiProvider,
    handleUpdateAiSettings,
    handleUpdateEditorPreferences,
    handleUpdateExportSettings,
    handleUpdateWebSearchSettings,
    selectedAiProvider,
    setActiveCategory,
    setSelectedAiProviderId,
    translate,
    webSearchSettings,
    welcomeReset
  } = settingsState;
  const platform = resolveDesktopPlatform();
  useDefaultContextMenuBlocker();
  const updater = useAutoUpdater(appLanguage.language, appLanguage.ready, {
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
          activeCategory={activeCategory}
          platform={platform}
          translate={translate}
          onCategoryChange={setActiveCategory}
        />
        <SettingsContent activeCategory={activeCategory} translate={translate}>
          {activeCategory === "general" ? (
            <GeneralSettings
              appVersion={appVersion}
              preferences={editorPreferences}
              language={appLanguage.language}
              translate={translate}
              welcomeReset={welcomeReset}
              onCheckForUpdates={updater.checkForUpdates}
              onResetWelcomeDocument={handleResetWelcomeDocument}
              onSelectLanguage={appLanguage.selectLanguage}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {activeCategory === "ai" ? (
            <AiSettings
              language={appLanguage.language}
              preferences={editorPreferences}
              translate={translate}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {activeCategory === "providers" ? (
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
          {activeCategory === "web" ? (
            <WebSearchSettings
              settings={webSearchSettings}
              translate={translate}
              onUpdateSettings={handleUpdateWebSearchSettings}
            />
          ) : null}
          {activeCategory === "storage" ? (
            <StorageSettings
              preferences={editorPreferences}
              translate={translate}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {activeCategory === "appearance" ? (
            <AppearanceSettings
              customThemeCss={appTheme.customThemeCss}
              selectedTheme={appTheme.theme}
              translate={translate}
              onUpdateCustomThemeCss={appTheme.updateCustomThemeCss}
              onSelectTheme={appTheme.selectTheme}
            />
          ) : null}
          {activeCategory === "editor" ? (
            <EditorSettings
              preferences={editorPreferences}
              translate={translate}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {activeCategory === "keyboardShortcuts" ? (
            <KeyboardShortcutsSettings
              platform={platform}
              preferences={editorPreferences}
              translate={translate}
              onUpdatePreferences={handleUpdateEditorPreferences}
            />
          ) : null}
          {activeCategory === "export" ? (
            <ExportSettings
              settings={exportSettings}
              translate={translate}
              onUpdateSettings={handleUpdateExportSettings}
            />
          ) : null}
        </SettingsContent>
      </div>
    </main>
  );
}
