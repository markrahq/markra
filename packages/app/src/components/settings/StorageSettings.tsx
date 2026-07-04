import { useEffect, useState } from "react";
import { Download, Upload, Wifi } from "lucide-react";
import type {
  EditorPreferences,
  ImageUploadProvider
} from "../../lib/settings/app-settings";
import {
  SettingsButton,
  SettingsRow,
  SettingsSection,
  SettingsTextInput
} from "./SettingsControls";
import {
  ImageUploadProviderSettingsControl,
  availableImageUploadProvider
} from "./ImageUploadControls";
import type { SettingsTranslate } from "./translate";

export function StorageSettings({
  onExportSettings,
  onImportSettings,
  onTestStorageProvider = () => {},
  onUpdatePreferences,
  preferences,
  s3ImageUploadEnabled = true,
  settingsTransferRunning = false,
  testingStorageProvider = null,
  translate
}: {
  onExportSettings?: () => unknown;
  onImportSettings?: () => unknown;
  onTestStorageProvider?: (provider: ImageUploadProvider) => unknown;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  s3ImageUploadEnabled?: boolean;
  settingsTransferRunning?: boolean;
  testingStorageProvider?: ImageUploadProvider | null;
  translate: SettingsTranslate;
}) {
  const imageUpload = preferences.imageUpload;
  const [settingsProvider, setSettingsProvider] = useState<ImageUploadProvider>(() =>
    availableImageUploadProvider(imageUpload.provider, s3ImageUploadEnabled)
  );
  const activeSettingsProvider = availableImageUploadProvider(settingsProvider, s3ImageUploadEnabled);
  const storageConnectionTestRunning = testingStorageProvider !== null;
  const activeStorageConnectionTestRunning = testingStorageProvider === activeSettingsProvider;
  const storageConnectionTestLabel = activeStorageConnectionTestRunning
    ? translate("settings.storage.testingConnection")
    : translate("settings.storage.testConnection");
  useEffect(() => {
    setSettingsProvider(availableImageUploadProvider(imageUpload.provider, s3ImageUploadEnabled));
  }, [imageUpload.provider, s3ImageUploadEnabled]);

  const updateWebDavImageUpload = (patch: Partial<typeof imageUpload.webdav>) => {
    onUpdatePreferences({
      ...preferences,
      imageUpload: {
        ...imageUpload,
        webdav: {
          ...imageUpload.webdav,
          ...patch
        }
      }
    });
  };
  const updatePicGoImageUpload = (patch: Partial<typeof imageUpload.picgo>) => {
    onUpdatePreferences({
      ...preferences,
      imageUpload: {
        ...imageUpload,
        picgo: {
          ...imageUpload.picgo,
          ...patch
        }
      }
    });
  };
  const updateS3ImageUpload = (patch: Partial<typeof imageUpload.s3>) => {
    onUpdatePreferences({
      ...preferences,
      imageUpload: {
        ...imageUpload,
        s3: {
          ...imageUpload.s3,
          ...patch
        }
      }
    });
  };
  return (
    <SettingsSection label={translate("settings.categories.storage")}>
      <SettingsRow
        title={translate("settings.storage.settingsBackup")}
        description={translate("settings.storage.settingsBackupDescription")}
        action={
          <div className="inline-flex items-center gap-2">
            <SettingsButton
              disabled={settingsTransferRunning || !onExportSettings}
              label={translate("settings.storage.exportSettings")}
              onClick={() => onExportSettings?.()}
            >
              <Download aria-hidden="true" size={13} />
              {translate("settings.storage.exportSettings")}
            </SettingsButton>
            <SettingsButton
              disabled={settingsTransferRunning || !onImportSettings}
              label={translate("settings.storage.importSettings")}
              onClick={() => onImportSettings?.()}
            >
              <Upload aria-hidden="true" size={13} />
              {translate("settings.storage.importSettings")}
            </SettingsButton>
          </div>
        }
      />
      <SettingsRow
        title={translate("settings.editor.imageUploadProviderSettings")}
        description={translate("settings.editor.imageUploadProviderStorageHint")}
        action={
          <ImageUploadProviderSettingsControl
            provider={activeSettingsProvider}
            s3ImageUploadEnabled={s3ImageUploadEnabled}
            translate={translate}
            onSelectProvider={setSettingsProvider}
          />
        }
      />
      <SettingsRow
        title={translate("settings.storage.connectionTest")}
        description={translate("settings.storage.connectionTestDescription")}
        action={
          <SettingsButton
            disabled={storageConnectionTestRunning}
            label={storageConnectionTestLabel}
            onClick={() => onTestStorageProvider(activeSettingsProvider)}
          >
            <Wifi aria-hidden="true" size={13} />
            {storageConnectionTestLabel}
          </SettingsButton>
        }
      />
      <SettingsRow
        title={translate("settings.editor.imageUploadFileNamePattern")}
        description={translate("settings.editor.imageUploadFileNamePatternDescription")}
        action={
          <SettingsTextInput
            label={translate("settings.editor.imageUploadFileNamePattern")}
            value={imageUpload.fileNamePattern}
            placeholder="pasted-image-{timestamp}"
            widthClassName="w-64"
            onChange={(fileNamePattern) =>
              onUpdatePreferences({
                ...preferences,
                imageUpload: {
                  ...imageUpload,
                  fileNamePattern
                }
              })
            }
          />
        }
      />
      {activeSettingsProvider === "local" ? (
        <SettingsRow
          title={translate("settings.editor.clipboardImageFolder")}
          description={translate("settings.editor.clipboardImageFolderDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.editor.clipboardImageFolder")}
              value={preferences.clipboardImageFolder}
              placeholder="assets"
              onChange={(value) =>
                onUpdatePreferences({
                  ...preferences,
                  clipboardImageFolder: value
                })
              }
            />
          }
        />
      ) : null}
      {activeSettingsProvider === "webdav" ? (
        <>
          <SettingsRow
            title={translate("settings.editor.webDavServerUrl")}
            description={translate("settings.editor.webDavServerUrlDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.webDavServerUrl")}
                value={imageUpload.webdav.serverUrl}
                placeholder="https://dav.example.com/images"
                widthClassName="w-72"
                onChange={(serverUrl) => updateWebDavImageUpload({ serverUrl })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.webDavUsername")}
            description={translate("settings.editor.webDavUsernameDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.webDavUsername")}
                value={imageUpload.webdav.username}
                widthClassName="w-56"
                onChange={(username) => updateWebDavImageUpload({ username })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.webDavPassword")}
            description={translate("settings.editor.webDavPasswordDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.webDavPassword")}
                value={imageUpload.webdav.password}
                type="password"
                widthClassName="w-56"
                onChange={(password) => updateWebDavImageUpload({ password })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.webDavUploadPath")}
            description={translate("settings.editor.webDavUploadPathDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.webDavUploadPath")}
                value={imageUpload.webdav.uploadPath}
                placeholder="notes"
                widthClassName="w-56"
                onChange={(uploadPath) => updateWebDavImageUpload({ uploadPath })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.webDavPublicBaseUrl")}
            description={translate("settings.editor.webDavPublicBaseUrlDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.webDavPublicBaseUrl")}
                value={imageUpload.webdav.publicBaseUrl}
                placeholder="https://cdn.example.com/images"
                widthClassName="w-72"
                onChange={(publicBaseUrl) => updateWebDavImageUpload({ publicBaseUrl })}
              />
            }
          />
        </>
      ) : null}
      {activeSettingsProvider === "picgo" ? (
        <>
          <SettingsRow
            title={translate("settings.editor.picGoServerUrl")}
            description={translate("settings.editor.picGoServerUrlDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.picGoServerUrl")}
                value={imageUpload.picgo.serverUrl}
                placeholder="http://127.0.0.1:36677/upload"
                widthClassName="w-72"
                onChange={(serverUrl) => updatePicGoImageUpload({ serverUrl })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.picGoSecret")}
            description={translate("settings.editor.picGoSecretDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.picGoSecret")}
                value={imageUpload.picgo.secret}
                type="password"
                widthClassName="w-56"
                onChange={(secret) => updatePicGoImageUpload({ secret })}
              />
            }
          />
        </>
      ) : null}
      {activeSettingsProvider === "s3" ? (
        <>
          <SettingsRow
            title={translate("settings.editor.s3EndpointUrl")}
            description={translate("settings.editor.s3EndpointUrlDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3EndpointUrl")}
                value={imageUpload.s3.endpointUrl}
                placeholder="https://s3.example.com"
                widthClassName="w-72"
                onChange={(endpointUrl) => updateS3ImageUpload({ endpointUrl })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3Region")}
            description={translate("settings.editor.s3RegionDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3Region")}
                value={imageUpload.s3.region}
                placeholder="us-east-1"
                widthClassName="w-44"
                onChange={(region) => updateS3ImageUpload({ region })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3Bucket")}
            description={translate("settings.editor.s3BucketDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3Bucket")}
                value={imageUpload.s3.bucket}
                placeholder="markra-images"
                widthClassName="w-56"
                onChange={(bucket) => updateS3ImageUpload({ bucket })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3AccessKeyId")}
            description={translate("settings.editor.s3AccessKeyIdDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3AccessKeyId")}
                value={imageUpload.s3.accessKeyId}
                widthClassName="w-56"
                onChange={(accessKeyId) => updateS3ImageUpload({ accessKeyId })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3SecretAccessKey")}
            description={translate("settings.editor.s3SecretAccessKeyDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3SecretAccessKey")}
                value={imageUpload.s3.secretAccessKey}
                type="password"
                widthClassName="w-56"
                onChange={(secretAccessKey) => updateS3ImageUpload({ secretAccessKey })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3UploadPath")}
            description={translate("settings.editor.s3UploadPathDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3UploadPath")}
                value={imageUpload.s3.uploadPath}
                placeholder="notes"
                widthClassName="w-56"
                onChange={(uploadPath) => updateS3ImageUpload({ uploadPath })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3PublicBaseUrl")}
            description={translate("settings.editor.s3PublicBaseUrlDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3PublicBaseUrl")}
                value={imageUpload.s3.publicBaseUrl}
                placeholder="https://cdn.example.com/images"
                widthClassName="w-72"
                onChange={(publicBaseUrl) => updateS3ImageUpload({ publicBaseUrl })}
              />
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
