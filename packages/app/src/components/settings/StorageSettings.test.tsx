import { fireEvent, render, screen, within } from "@testing-library/react";
import { translate } from "../../test/settings-components";
import { defaultEditorPreferences } from "../../lib/settings/app-settings";
import { StorageSettings } from "./StorageSettings";

describe("StorageSettings", () => {
  it("offers Markra settings import and export actions", () => {
    const onExportSettings = vi.fn();
    const onImportSettings = vi.fn();

    render(
      <StorageSettings
        preferences={defaultEditorPreferences}
        translate={translate}
        onExportSettings={onExportSettings}
        onImportSettings={onImportSettings}
        onUpdatePreferences={vi.fn()}
      />
    );

    const settingsBackupRow = screen.getByText("Settings backup").closest(".settings-row") as HTMLElement | null;
    expect(settingsBackupRow).not.toBeNull();
    expect(
      within(settingsBackupRow as HTMLElement).getByText(
        "Export or import Markra settings, including AI keys and storage credentials. Keep exported files private."
      )
    ).toBeInTheDocument();

    fireEvent.click(within(settingsBackupRow as HTMLElement).getByRole("button", { name: "Export settings" }));
    fireEvent.click(within(settingsBackupRow as HTMLElement).getByRole("button", { name: "Import settings" }));

    expect(onExportSettings).toHaveBeenCalledTimes(1);
    expect(onImportSettings).toHaveBeenCalledTimes(1);
  });

  it("disables settings import and export actions while a transfer is running", () => {
    render(
      <StorageSettings
        preferences={defaultEditorPreferences}
        settingsTransferRunning
        translate={translate}
        onExportSettings={vi.fn()}
        onImportSettings={vi.fn()}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Export settings" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import settings" })).toBeDisabled();
  });

  it("switches between provider settings without changing the active storage type", () => {
    const onUpdatePreferences = vi.fn();
    const onTestStorageProvider = vi.fn();

    render(
      <StorageSettings
        preferences={defaultEditorPreferences}
        translate={translate}
        onTestStorageProvider={onTestStorageProvider}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    expect(screen.queryByText("Storage type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Storage type: Local")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use WebDAV storage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use PicGo/PicList server" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use S3-compatible storage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Backup target" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back up now" })).not.toBeInTheDocument();

    const settingsTypeRow = screen.getByText("Settings type").closest(".settings-row") as HTMLElement | null;
    expect(settingsTypeRow).not.toBeNull();
    expect(
      within(settingsTypeRow as HTMLElement).getByText(
        "Change the active storage type in Editor settings. The switch here only chooses which settings to configure."
      )
    ).toBeInTheDocument();

    const settingsType = within(settingsTypeRow as HTMLElement).getByRole("group", { name: "Settings type" });
    expect(within(settingsType).getByRole("button", { name: "Show local settings" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(onTestStorageProvider).toHaveBeenLastCalledWith("local");

    expect(screen.queryByRole("heading", { name: "Local" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Clipboard image folder" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "WebDAV server URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "PicGo/PicList server URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "S3 endpoint URL" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "File naming pattern" }), {
      target: { value: "{name}-{timestamp}" }
    });
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        fileNamePattern: "{name}-{timestamp}"
      }
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Clipboard image folder" }), {
      target: { value: "media" }
    });
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      clipboardImageFolder: "media"
    });
    expect(screen.queryByRole("switch", { name: "Copy pasted files to storage" })).not.toBeInTheDocument();

    fireEvent.click(within(settingsType).getByRole("button", { name: "Show WebDAV settings" }));
    expect(within(settingsType).getByRole("button", { name: "Show WebDAV settings" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByRole("textbox", { name: "Clipboard image folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "WebDAV" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "WebDAV server URL" })).toBeInTheDocument();
    expect(screen.getByLabelText("WebDAV password")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "S3 endpoint URL" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(onTestStorageProvider).toHaveBeenLastCalledWith("webdav");

    fireEvent.change(screen.getByRole("textbox", { name: "WebDAV server URL" }), {
      target: { value: "https://dav.example.com/images" }
    });
    fireEvent.change(screen.getByLabelText("WebDAV password"), {
      target: { value: "secret" }
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        webdav: {
          ...defaultEditorPreferences.imageUpload.webdav,
          serverUrl: "https://dav.example.com/images"
        }
      }
    });
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        webdav: {
          ...defaultEditorPreferences.imageUpload.webdav,
          password: "secret"
        }
      }
    });

    fireEvent.click(within(settingsType).getByRole("button", { name: "Show PicGo/PicList settings" }));
    expect(within(settingsType).getByRole("button", { name: "Show PicGo/PicList settings" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByRole("textbox", { name: "Clipboard image folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "WebDAV server URL" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "PicGo/PicList server URL" })).toBeInTheDocument();
    expect(screen.getByLabelText("PicGo/PicList secret")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "S3 endpoint URL" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(onTestStorageProvider).toHaveBeenLastCalledWith("picgo");

    fireEvent.change(screen.getByRole("textbox", { name: "PicGo/PicList server URL" }), {
      target: { value: "http://127.0.0.1:36677/upload" }
    });
    fireEvent.change(screen.getByLabelText("PicGo/PicList secret"), {
      target: { value: "server-secret" }
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        picgo: {
          ...defaultEditorPreferences.imageUpload.picgo,
          serverUrl: "http://127.0.0.1:36677/upload"
        }
      }
    });
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        picgo: {
          ...defaultEditorPreferences.imageUpload.picgo,
          secret: "server-secret"
        }
      }
    });

    fireEvent.click(within(settingsType).getByRole("button", { name: "Show S3-compatible settings" }));
    expect(within(settingsType).getByRole("button", { name: "Show S3-compatible settings" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByRole("textbox", { name: "Clipboard image folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "WebDAV server URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "PicGo/PicList server URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "S3" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "S3 endpoint URL" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "S3 bucket" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(onTestStorageProvider).toHaveBeenLastCalledWith("s3");

    fireEvent.change(screen.getByRole("textbox", { name: "S3 endpoint URL" }), {
      target: { value: "https://s3.example.com" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "S3 bucket" }), {
      target: { value: "markra-images" }
    });

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        s3: {
          ...defaultEditorPreferences.imageUpload.s3,
          endpointUrl: "https://s3.example.com"
        }
      }
    });
    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        s3: {
          ...defaultEditorPreferences.imageUpload.s3,
          bucket: "markra-images"
        }
      }
    });
  });

  it("hides S3 provider settings when S3 uploads are unavailable", () => {
    render(
      <StorageSettings
        preferences={{
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "s3"
          }
        }}
        s3ImageUploadEnabled={false}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    const settingsTypeRow = screen.getByText("Settings type").closest(".settings-row") as HTMLElement | null;
    expect(settingsTypeRow).not.toBeNull();

    const settingsType = within(settingsTypeRow as HTMLElement).getByRole("group", { name: "Settings type" });
    expect(within(settingsType).getByRole("button", { name: "Show local settings" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(settingsType).getByRole("button", { name: "Show WebDAV settings" })).toBeInTheDocument();
    expect(within(settingsType).getByRole("button", { name: "Show PicGo/PicList settings" })).toBeInTheDocument();
    expect(within(settingsType).queryByRole("button", { name: "Show S3-compatible settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "S3 endpoint URL" })).not.toBeInTheDocument();
  });

  it("disables the storage connection test while the active provider is testing", () => {
    render(
      <StorageSettings
        preferences={{
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "webdav"
          }
        }}
        testingStorageProvider="webdav"
        translate={translate}
        onTestStorageProvider={vi.fn()}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Testing connection" })).toBeDisabled();
  });
});
