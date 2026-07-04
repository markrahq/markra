import { act, renderHook, waitFor } from "@testing-library/react";
import { showAppToast } from "../lib/app-toast";
import {
  defaultEditorPreferences,
  type EditorPreferences,
  type ImageUploadProvider
} from "../lib/settings/app-settings";
import {
  configureAppRuntime,
  createDefaultAppRuntime,
  resetAppRuntimeForTests
} from "../runtime";
import type { UploadNativeWebDavImageInput } from "../lib/tauri/file";
import {
  canonicalizeEditorFontFamilyPreference,
  shellCommandActionFailureMessage,
  useSettingsWindowState
} from "./useSettingsWindowState";

vi.mock("../lib/app-toast", () => ({
  showAppToast: vi.fn()
}));

const mockedShowAppToast = vi.mocked(showAppToast);

function createSettingsRuntimeWithEditorPreferences(preferences: EditorPreferences) {
  const store = new Map<string, unknown>([["editorPreferences", preferences]]);

  return {
    async loadStore() {
      return {
        async delete(key: string) {
          store.delete(key);
        },
        async get<T>(key: string) {
          return store.get(key) as T | undefined;
        },
        async save() {
          return undefined;
        },
        async set(key: string, value: unknown) {
          store.set(key, value);
        }
      };
    }
  };
}

describe("settings window import and export", () => {
  beforeEach(() => {
    mockedShowAppToast.mockReset();
    resetAppRuntimeForTests();
  });

  afterEach(() => {
    resetAppRuntimeForTests();
  });

  it("exports the current app settings to a Markra settings file", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const saveSettingsFile = vi.fn(async (input) => ({
      name: input.suggestedName,
      path: `/mock-files/${input.suggestedName}`
    }));
    configureAppRuntime({
      ...defaultRuntime,
      files: {
        ...defaultRuntime.files,
        saveSettingsFile
      }
    });
    const { result } = renderHook(() => useSettingsWindowState());

    await act(async () => {
      await result.current.handleExportSettings();
    });

    expect(saveSettingsFile).toHaveBeenCalledWith({
      suggestedName: "markra-settings.json",
      contents: expect.any(String)
    });
    expect(JSON.parse(saveSettingsFile.mock.calls[0][0].contents)).toMatchObject({
      format: "markra-settings",
      version: 1
    });
    expect(mockedShowAppToast).toHaveBeenCalledWith({
      message: "Settings exported.",
      status: "success"
    });
  });

  it("imports settings from a selected Markra settings file and refreshes the panel state", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const importedSettings = {
      format: "markra-settings",
      version: 1,
      exportedAt: "2030-01-02T03:04:05.000Z",
      settings: {
        editorPreferences: {
          ...defaultEditorPreferences,
          bodyFontSize: 20
        },
        language: "zh-CN"
      }
    };
    const openSettingsFile = vi.fn(async () => ({
      content: JSON.stringify(importedSettings),
      name: "markra-settings.json",
      path: "/mock-files/markra-settings.json"
    }));
    configureAppRuntime({
      ...defaultRuntime,
      files: {
        ...defaultRuntime.files,
        openSettingsFile
      }
    });
    const { result } = renderHook(() => useSettingsWindowState());

    await act(async () => {
      await result.current.handleImportSettings();
    });

    expect(openSettingsFile).toHaveBeenCalledWith({ title: "Import Markra settings" });
    await waitFor(() => {
      expect(result.current.editorPreferences.bodyFontSize).toBe(20);
    });
    expect(mockedShowAppToast).toHaveBeenCalledWith({
      message: "Settings imported.",
      status: "success"
    });
  });
});

describe("settings window storage connection tests", () => {
  beforeEach(() => {
    mockedShowAppToast.mockReset();
    resetAppRuntimeForTests();
  });

  afterEach(() => {
    resetAppRuntimeForTests();
  });

  it("tests each storage provider without user data", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const uploadWebDavImage = vi.fn(async (_input: UploadNativeWebDavImageInput) => ({
      alt: "Connection test",
      src: "https://cdn.example.test/webdav.png"
    }));
    const uploadPicGoImage = vi.fn(async () => ({ alt: "Connection test", src: "https://cdn.example.test/picgo.png" }));
    const uploadS3Image = vi.fn(async () => ({ alt: "Connection test", src: "https://cdn.example.test/s3.png" }));
    const providerPreferences = {
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        picgo: {
          secret: "server-secret",
          serverUrl: "http://127.0.0.1:36677/upload"
        },
        s3: {
          accessKeyId: "access-key",
          bucket: "mock-images",
          endpointUrl: "https://s3.example.test",
          publicBaseUrl: "",
          region: "us-east-1",
          secretAccessKey: "secret",
          uploadPath: "notes"
        },
        webdav: {
          password: "secret",
          publicBaseUrl: "",
          serverUrl: "https://dav.example.test/images",
          uploadPath: "notes",
          username: "ada"
        }
      }
    };
    configureAppRuntime({
      ...defaultRuntime,
      files: {
        ...defaultRuntime.files,
        uploadPicGoImage,
        uploadS3Image,
        uploadWebDavImage
      },
      settings: createSettingsRuntimeWithEditorPreferences(providerPreferences)
    });
    const { result } = renderHook(() => useSettingsWindowState());

    await waitFor(() => {
      expect(result.current.editorPreferences.imageUpload.webdav.serverUrl).toBe("https://dav.example.test/images");
    });

    for (const provider of ["local", "webdav", "picgo", "s3"] satisfies ImageUploadProvider[]) {
      await act(async () => {
        await result.current.handleTestStorageProvider(provider);
      });
    }

    expect(uploadWebDavImage).toHaveBeenCalledWith({
      fileName: "markra-connection-test.png",
      image: expect.any(File),
      settings: providerPreferences.imageUpload.webdav
    });
    expect(uploadPicGoImage).toHaveBeenCalledWith({
      fileName: "markra-connection-test.png",
      image: expect.any(File),
      settings: providerPreferences.imageUpload.picgo
    });
    expect(uploadS3Image).toHaveBeenCalledWith({
      fileName: "markra-connection-test.png",
      image: expect.any(File),
      settings: providerPreferences.imageUpload.s3
    });
    const webDavUploadInput = uploadWebDavImage.mock.lastCall?.[0];
    expect(webDavUploadInput?.image.name).toBe("markra-connection-test.png");
    expect(webDavUploadInput?.image.type).toBe("image/png");
    expect(mockedShowAppToast).toHaveBeenCalledWith({
      message: "Storage connection verified.",
      status: "success"
    });
    expect(mockedShowAppToast).toHaveBeenCalledTimes(4);
  });

  it("reports storage connection test failures", async () => {
    const defaultRuntime = createDefaultAppRuntime();
    const providerPreferences = {
      ...defaultEditorPreferences,
      imageUpload: {
        ...defaultEditorPreferences.imageUpload,
        webdav: {
          ...defaultEditorPreferences.imageUpload.webdav,
          serverUrl: "https://dav.example.test/images"
        }
      }
    };
    configureAppRuntime({
      ...defaultRuntime,
      files: {
        ...defaultRuntime.files,
        uploadWebDavImage: vi.fn(async () => {
          throw new Error("HTTP 401");
        })
      },
      settings: createSettingsRuntimeWithEditorPreferences(providerPreferences)
    });
    const { result } = renderHook(() => useSettingsWindowState());

    await waitFor(() => {
      expect(result.current.editorPreferences.imageUpload.webdav.serverUrl).toBe("https://dav.example.test/images");
    });
    await act(async () => {
      await result.current.handleTestStorageProvider("webdav");
    });

    expect(mockedShowAppToast).toHaveBeenCalledWith({
      message: "Could not verify storage connection. HTTP 401",
      status: "error"
    });
  });
});

describe("settings window shell command errors", () => {
  it("includes native shell command failure details when available", () => {
    expect(shellCommandActionFailureMessage("Could not update the markra command.", "Registry write failed")).toBe(
      "Could not update the markra command. Registry write failed"
    );
    expect(shellCommandActionFailureMessage("Could not update the markra command.", new Error("Access denied"))).toBe(
      "Could not update the markra command. Access denied"
    );
  });

  it("falls back to the generic shell command error", () => {
    expect(shellCommandActionFailureMessage("Could not update the markra command.", "")).toBe(
      "Could not update the markra command."
    );
  });
});

describe("settings window editor font migration", () => {
  it("maps a saved localized font label to the CSS font family name", () => {
    expect(canonicalizeEditorFontFamilyPreference({
      ...defaultEditorPreferences,
      editorFontFamily: {
        family: "示例衬线",
        source: "system"
      }
    }, [
      { family: "ExampleSerif", label: "示例衬线" },
      { family: "ExampleSans", label: "示例黑体" }
    ])).toEqual({
      ...defaultEditorPreferences,
      editorFontFamily: {
        family: "ExampleSerif",
        source: "system"
      }
    });
  });

  it("does not migrate canonical or ambiguous font family names", () => {
    expect(canonicalizeEditorFontFamilyPreference({
      ...defaultEditorPreferences,
      editorFontFamily: {
        family: "ExampleSerif",
        source: "system"
      }
    }, [
      { family: "ExampleSerif", label: "示例衬线" }
    ])).toBeNull();

    expect(canonicalizeEditorFontFamilyPreference({
      ...defaultEditorPreferences,
      editorFontFamily: {
        family: "示例衬线",
        source: "system"
      }
    }, [
      { family: "ExampleSerif", label: "示例衬线" },
      { family: "ExampleSerifAlt", label: "示例衬线" }
    ])).toBeNull();
  });
});
