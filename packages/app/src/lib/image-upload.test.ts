import { defaultEditorPreferences } from "./settings/app-settings";
import { createImageUploadFileName, saveEditorImage, saveLocalEditorImage } from "./image-upload";

describe("save editor image", () => {
  it("creates safe image file names from the configured pattern", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "My Diagram!.png", { type: "image/png" });

    expect(await createImageUploadFileName(image, "{name}-{timestamp}-{random}", {
      random: () => "abc123",
      timestamp: () => "1700000000000"
    })).toBe("My-Diagram-1700000000000-abc123.png");
  });

  it("uses the image content md5 in configured file naming patterns", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Diagram.png", { type: "image/png" });

    expect(await createImageUploadFileName(image, "{name}-{md5}", {
      timestamp: () => "1700000000000"
    })).toBe("Diagram-5289df737df57326fcdd22597afb1fac.png");
  });

  it("keeps dots that are part of the configured file naming pattern", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "My Diagram.png", { type: "image/png" });

    expect(await createImageUploadFileName(image, "{name}.{timestamp}", {
      timestamp: () => "1700000000000"
    })).toBe("My-Diagram.1700000000000.png");
  });

  it("keeps SVG image extensions when creating upload file names", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Logo.svg", { type: "image/svg+xml" });

    expect(await createImageUploadFileName(image, "{name}-{timestamp}", {
      timestamp: () => "1700000000000"
    })).toBe("Logo-1700000000000.svg");
  });

  it("uses the local clipboard image folder and reports that the file tree should refresh", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Screenshot.png", { type: "image/png" });
    const saveLocalImage = vi.fn().mockResolvedValue({
      alt: "Screenshot",
      src: "assets/pasted-image.png"
    });
    const uploadWebDavImage = vi.fn();

    await expect(
      saveEditorImage({
        documentPath: "/mock-files/note.md",
        image,
        preferences: defaultEditorPreferences,
        saveLocalImage,
        uploadWebDavImage
      })
    ).resolves.toEqual({
      image: {
        alt: "Screenshot",
        src: "assets/pasted-image.png"
      },
      refreshTree: true,
      status: "saved"
    });

    expect(saveLocalImage).toHaveBeenCalledWith({
      documentPath: "/mock-files/note.md",
      fileName: expect.stringMatching(/^pasted-image-\d+\.png$/u),
      folder: "assets",
      image
    });
    expect(uploadWebDavImage).not.toHaveBeenCalled();
  });

  it("uses the original local image link when external file copying is disabled", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Screenshot.png", { type: "image/png" });
    const saveLocalImage = vi.fn().mockResolvedValue({
      alt: "Screenshot",
      src: "file:///C:/mock-files/Screenshot.png"
    });
    const uploadWebDavImage = vi.fn();

    await expect(
      saveEditorImage({
        documentPath: null,
        image,
        preferences: {
          ...defaultEditorPreferences,
          copyExternalFilesToStorage: false,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "webdav"
          }
        },
        saveLocalImage,
        uploadWebDavImage
      })
    ).resolves.toEqual({
      image: {
        alt: "Screenshot",
        src: "file:///C:/mock-files/Screenshot.png"
      },
      refreshTree: false,
      status: "saved"
    });

    expect(saveLocalImage).toHaveBeenCalledWith({
      copyToStorage: false,
      documentPath: null,
      fileName: expect.stringMatching(/^pasted-image-\d+\.png$/u),
      folder: "assets",
      image
    });
    expect(uploadWebDavImage).not.toHaveBeenCalled();
  });

  it("imports local images into the configured local image folder even when remote uploads are enabled", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Local Diagram.png", { type: "image/png" });
    const saveLocalImage = vi.fn().mockResolvedValue({
      alt: "Local Diagram",
      src: "assets/imported-diagram.png"
    });

    await expect(
      saveLocalEditorImage({
        documentPath: "/mock-files/note.md",
        image,
        preferences: {
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "webdav",
            webdav: {
              password: "secret",
              publicBaseUrl: "https://cdn.example.test/images",
              serverUrl: "https://dav.example.test/images",
              uploadPath: "notes",
              username: "mock-user"
            }
          }
        },
        saveLocalImage
      })
    ).resolves.toEqual({
      image: {
        alt: "Local Diagram",
        src: "assets/imported-diagram.png"
      },
      refreshTree: true,
      status: "saved"
    });

    expect(saveLocalImage).toHaveBeenCalledWith({
      documentPath: "/mock-files/note.md",
      fileName: expect.stringMatching(/^pasted-image-\d+\.png$/u),
      folder: "assets",
      image
    });
  });

  it("uploads directly to WebDAV without requiring a saved Markdown document", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Diagram.png", { type: "image/png" });
    const saveLocalImage = vi.fn();
    const uploadWebDavImage = vi.fn().mockResolvedValue({
      alt: "Diagram",
      src: "https://cdn.example.com/images/notes/pasted-image.png"
    });
    const webdav = {
      password: "secret",
      publicBaseUrl: "https://cdn.example.com/images",
      serverUrl: "https://dav.example.com/images",
      uploadPath: "notes",
      username: "ada"
    };

    await expect(
      saveEditorImage({
        documentPath: null,
        image,
        preferences: {
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "webdav",
            webdav
          }
        },
        saveLocalImage,
        uploadWebDavImage
      })
    ).resolves.toEqual({
      image: {
        alt: "Diagram",
        src: "https://cdn.example.com/images/notes/pasted-image.png"
      },
      refreshTree: false,
      status: "saved"
    });

    expect(uploadWebDavImage).toHaveBeenCalledWith({
      fileName: expect.stringMatching(/^pasted-image-\d+\.png$/u),
      image,
      settings: webdav
    });
    expect(saveLocalImage).not.toHaveBeenCalled();
  });

  it("uploads directly through a PicGo or PicList server", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Diagram.png", { type: "image/png" });
    const saveLocalImage = vi.fn();
    const uploadPicGoImage = vi.fn().mockResolvedValue({
      alt: "Diagram",
      src: "https://cdn.example.test/images/pasted-image.png"
    });
    const picgo = {
      secret: "server-secret",
      serverUrl: "http://127.0.0.1:36677/upload"
    };

    await expect(
      saveEditorImage({
        documentPath: null,
        image,
        preferences: {
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            fileNamePattern: "{name}-{md5}",
            provider: "picgo",
            picgo
          }
        },
        saveLocalImage,
        uploadPicGoImage,
        uploadWebDavImage: vi.fn()
      })
    ).resolves.toEqual({
      image: {
        alt: "Diagram",
        src: "https://cdn.example.test/images/pasted-image.png"
      },
      refreshTree: false,
      status: "saved"
    });

    expect(uploadPicGoImage).toHaveBeenCalledWith({
      fileName: "Diagram-5289df737df57326fcdd22597afb1fac.png",
      image,
      settings: picgo
    });
    expect(saveLocalImage).not.toHaveBeenCalled();
  });

  it("uploads directly to S3-compatible object storage", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Object.png", { type: "image/png" });
    const saveLocalImage = vi.fn();
    const uploadS3Image = vi.fn().mockResolvedValue({
      alt: "Object",
      src: "https://cdn.example.com/images/notes/pasted-image.png"
    });
    const s3 = {
      accessKeyId: "access-key",
      bucket: "markra-images",
      endpointUrl: "https://s3.example.com",
      publicBaseUrl: "https://cdn.example.com/images",
      region: "us-east-1",
      secretAccessKey: "secret",
      uploadPath: "notes"
    };

    await expect(
      saveEditorImage({
        documentPath: null,
        image,
        preferences: {
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "s3",
            s3
          }
        },
        saveLocalImage,
        uploadS3Image,
        uploadWebDavImage: vi.fn()
      })
    ).resolves.toEqual({
      image: {
        alt: "Object",
        src: "https://cdn.example.com/images/notes/pasted-image.png"
      },
      refreshTree: false,
      status: "saved"
    });

    expect(uploadS3Image).toHaveBeenCalledWith({
      fileName: expect.stringMatching(/^pasted-image-\d+\.png$/u),
      image,
      settings: s3
    });
    expect(saveLocalImage).not.toHaveBeenCalled();
  });

  it("does not treat a blank S3 region as missing storage configuration", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Object.png", { type: "image/png" });
    const uploadS3Image = vi.fn().mockResolvedValue({
      alt: "Object",
      src: "https://cdn.example.com/images/notes/pasted-image.png"
    });
    const s3 = {
      accessKeyId: "access-key",
      bucket: "markra-images",
      endpointUrl: "https://s3.example.com",
      publicBaseUrl: "https://cdn.example.com/images",
      region: "",
      secretAccessKey: "secret",
      uploadPath: "notes"
    };

    await expect(
      saveEditorImage({
        documentPath: null,
        image,
        preferences: {
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "s3",
            s3
          }
        },
        saveLocalImage: vi.fn(),
        uploadS3Image,
        uploadWebDavImage: vi.fn()
      })
    ).resolves.toMatchObject({
      refreshTree: false,
      status: "saved"
    });

    expect(uploadS3Image).toHaveBeenCalledWith({
      fileName: expect.stringMatching(/^pasted-image-\d+\.png$/u),
      image,
      settings: s3
    });
  });

  it("falls back to local image storage when S3 uploads are unavailable", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Object.png", { type: "image/png" });
    const saveLocalImage = vi.fn().mockResolvedValue({
      alt: "Object",
      src: "assets/pasted-image.png"
    });
    const uploadS3Image = vi.fn();

    await expect(
      saveEditorImage({
        documentPath: "/mock-files/note.md",
        image,
        preferences: {
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "s3"
          }
        },
        s3ImageUploadEnabled: false,
        saveLocalImage,
        uploadS3Image,
        uploadWebDavImage: vi.fn()
      })
    ).resolves.toEqual({
      image: {
        alt: "Object",
        src: "assets/pasted-image.png"
      },
      refreshTree: true,
      status: "saved"
    });

    expect(saveLocalImage).toHaveBeenCalledWith({
      documentPath: "/mock-files/note.md",
      fileName: expect.stringMatching(/^pasted-image-\d+\.png$/u),
      folder: "assets",
      image
    });
    expect(uploadS3Image).not.toHaveBeenCalled();
  });

  it("skips WebDAV uploads until a server URL is configured", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Diagram.png", { type: "image/png" });

    await expect(
      saveEditorImage({
        documentPath: null,
        image,
        preferences: {
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "webdav",
            webdav: defaultEditorPreferences.imageUpload.webdav
          }
        },
        saveLocalImage: vi.fn(),
        uploadWebDavImage: vi.fn()
      })
    ).resolves.toEqual({
      reason: "webdav-not-configured",
      status: "skipped"
    });
  });

  it("skips PicGo or PicList server uploads until a server URL is configured", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Diagram.png", { type: "image/png" });

    await expect(
      saveEditorImage({
        documentPath: null,
        image,
        preferences: {
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "picgo",
            picgo: defaultEditorPreferences.imageUpload.picgo
          }
        },
        saveLocalImage: vi.fn(),
        uploadPicGoImage: vi.fn(),
        uploadWebDavImage: vi.fn()
      })
    ).resolves.toEqual({
      reason: "picgo-not-configured",
      status: "skipped"
    });
  });

  it("skips S3-compatible uploads until required storage settings are configured", async () => {
    const image = new File([new Uint8Array([1, 2, 3])], "Object.png", { type: "image/png" });

    await expect(
      saveEditorImage({
        documentPath: null,
        image,
        preferences: {
          ...defaultEditorPreferences,
          imageUpload: {
            ...defaultEditorPreferences.imageUpload,
            provider: "s3"
          }
        },
        saveLocalImage: vi.fn(),
        uploadS3Image: vi.fn(),
        uploadWebDavImage: vi.fn()
      })
    ).resolves.toEqual({
      reason: "s3-not-configured",
      status: "skipped"
    });
  });
});
