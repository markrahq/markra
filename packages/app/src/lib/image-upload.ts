import { md5 } from "@noble/hashes/legacy.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import type {
  EditorPreferences,
  ImageUploadProvider,
  PicGoImageUploadSettings,
  S3ImageUploadSettings,
  WebDavImageUploadSettings
} from "./settings/app-settings";
import {
  saveNativeClipboardImage,
  uploadNativePicGoImage,
  uploadNativeS3Image,
  uploadNativeWebDavImage,
  type SavedNativeClipboardImage,
  type SaveNativeClipboardImageInput,
  type UploadNativePicGoImageInput,
  type UploadNativeS3ImageInput,
  type UploadNativeWebDavImageInput
} from "./tauri";

type SaveLocalImage = (input: SaveNativeClipboardImageInput) => Promise<SavedNativeClipboardImage>;
type UploadPicGoImage = (input: UploadNativePicGoImageInput) => Promise<SavedNativeClipboardImage>;
type UploadS3Image = (input: UploadNativeS3ImageInput) => Promise<SavedNativeClipboardImage>;
type UploadWebDavImage = (input: UploadNativeWebDavImageInput) => Promise<SavedNativeClipboardImage>;

export type SaveEditorImageSkippedReason =
  | "picgo-not-configured"
  | "requires-saved-document"
  | "s3-not-configured"
  | "webdav-not-configured";

export type SaveEditorImageResult =
  | {
      image: SavedNativeClipboardImage;
      refreshTree: boolean;
      status: "saved";
    }
  | {
      reason: SaveEditorImageSkippedReason;
      status: "skipped";
    };

export type SaveEditorImageInput = {
  documentPath: string | null;
  image: File;
  preferences: EditorPreferences;
  s3ImageUploadEnabled?: boolean;
  saveLocalImage?: SaveLocalImage;
  uploadPicGoImage?: UploadPicGoImage;
  uploadS3Image?: UploadS3Image;
  uploadWebDavImage?: UploadWebDavImage;
};

export type SaveLocalEditorImageInput = {
  documentPath: string | null;
  image: File;
  preferences: EditorPreferences;
  copyToStorage?: boolean;
  saveLocalImage?: SaveLocalImage;
};

export type TestImageUploadStorageConnectionInput = {
  preferences: EditorPreferences;
  provider: ImageUploadProvider;
  s3ImageUploadEnabled?: boolean;
  uploadPicGoImage?: UploadPicGoImage;
  uploadS3Image?: UploadS3Image;
  uploadWebDavImage?: UploadWebDavImage;
};

type ImageUploadFileNameOptions = {
  random?: () => string;
  timestamp?: () => string;
};

const storageConnectionTestFileName = "markra-connection-test.png";
const transparentOnePixelPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
  137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0,
  0, 5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78,
  68, 174, 66, 96, 130
]);

const imageMimeExtensions: Record<string, string> = {
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp"
};

export async function createImageUploadFileName(
  image: File,
  pattern: string,
  options: ImageUploadFileNameOptions = {}
) {
  const extension = imageExtensionFromFile(image);
  const name = sanitizeFileNamePart(image.name.replace(/\.[^.]*$/u, "")) || "image";
  const timestamp = options.timestamp?.() ?? String(Date.now());
  const random = options.random?.() ?? defaultRandomToken();
  const md5 = pattern.includes("{md5}") ? await fileMd5Hex(image) : "";
  const renderedPattern = (pattern.trim() || "pasted-image-{timestamp}")
    .replace(/\{name\}/gu, name)
    .replace(/\{timestamp\}/gu, timestamp)
    .replace(/\{random\}/gu, random)
    .replace(/\{md5\}/gu, md5);
  const baseName = sanitizeFileNamePart(stripKnownImageExtension(renderedPattern)) || `pasted-image-${timestamp}`;

  return `${baseName}.${extension}`;
}

export function isS3ImageUploadConfigured(settings: S3ImageUploadSettings) {
  return (
    settings.accessKeyId.trim().length > 0 &&
    settings.bucket.trim().length > 0 &&
    settings.endpointUrl.trim().length > 0 &&
    settings.secretAccessKey.length > 0
  );
}

export function isWebDavImageUploadConfigured(settings: WebDavImageUploadSettings) {
  return settings.serverUrl.trim().length > 0;
}

export function isPicGoImageUploadConfigured(settings: PicGoImageUploadSettings) {
  return settings.serverUrl.trim().length > 0;
}

function createStorageConnectionTestImage() {
  return new File([transparentOnePixelPng], storageConnectionTestFileName, { type: "image/png" });
}

export async function testImageUploadStorageConnection({
  preferences,
  provider,
  s3ImageUploadEnabled = true,
  uploadPicGoImage = uploadNativePicGoImage,
  uploadS3Image = uploadNativeS3Image,
  uploadWebDavImage = uploadNativeWebDavImage
}: TestImageUploadStorageConnectionInput) {
  if (provider === "local") return;

  if (provider === "picgo") {
    const settings = preferences.imageUpload.picgo;
    if (!isPicGoImageUploadConfigured(settings)) throw new Error("PicGo/PicList server URL is required.");

    await uploadPicGoImage({
      fileName: storageConnectionTestFileName,
      image: createStorageConnectionTestImage(),
      settings
    });
    return;
  }

  if (provider === "s3") {
    if (!s3ImageUploadEnabled) throw new Error("S3-compatible uploads are unavailable.");

    const settings = preferences.imageUpload.s3;
    if (!isS3ImageUploadConfigured(settings)) throw new Error("S3-compatible storage settings are incomplete.");

    await uploadS3Image({
      fileName: storageConnectionTestFileName,
      image: createStorageConnectionTestImage(),
      settings
    });
    return;
  }

  const settings = preferences.imageUpload.webdav;
  if (!isWebDavImageUploadConfigured(settings)) throw new Error("WebDAV server URL is required.");

  await uploadWebDavImage({
    fileName: storageConnectionTestFileName,
    image: createStorageConnectionTestImage(),
    settings
  });
}

export async function saveEditorImage({
  documentPath,
  image,
  preferences,
  s3ImageUploadEnabled = true,
  saveLocalImage = saveNativeClipboardImage,
  uploadPicGoImage = uploadNativePicGoImage,
  uploadS3Image = uploadNativeS3Image,
  uploadWebDavImage = uploadNativeWebDavImage
}: SaveEditorImageInput): Promise<SaveEditorImageResult> {
  if (!preferences.copyExternalFilesToStorage) {
    return saveLocalEditorImage({
      copyToStorage: false,
      documentPath,
      image,
      preferences,
      saveLocalImage
    });
  }

  const provider = preferences.imageUpload.provider === "s3" && !s3ImageUploadEnabled
    ? "local"
    : preferences.imageUpload.provider;

  if (provider === "picgo") {
    const settings = preferences.imageUpload.picgo;
    if (!isPicGoImageUploadConfigured(settings)) {
      return {
        reason: "picgo-not-configured",
        status: "skipped"
      };
    }

    return {
      image: await uploadPicGoImage({
        fileName: await createImageUploadFileName(image, preferences.imageUpload.fileNamePattern),
        image,
        settings
      }),
      refreshTree: false,
      status: "saved"
    };
  }

  if (provider === "s3") {
    const settings = preferences.imageUpload.s3;
    if (!isS3ImageUploadConfigured(settings)) {
      return {
        reason: "s3-not-configured",
        status: "skipped"
      };
    }

    return {
      image: await uploadS3Image({
        fileName: await createImageUploadFileName(image, preferences.imageUpload.fileNamePattern),
        image,
        settings
      }),
      refreshTree: false,
      status: "saved"
    };
  }

  if (provider === "webdav") {
    const settings = preferences.imageUpload.webdav;
    if (!isWebDavImageUploadConfigured(settings)) {
      return {
        reason: "webdav-not-configured",
        status: "skipped"
      };
    }

    return {
      image: await uploadWebDavImage({
        fileName: await createImageUploadFileName(image, preferences.imageUpload.fileNamePattern),
        image,
        settings
      }),
      refreshTree: false,
      status: "saved"
    };
  }

  return saveLocalEditorImage({
    documentPath,
    image,
    preferences,
    saveLocalImage
  });
}

export async function saveLocalEditorImage({
  copyToStorage = true,
  documentPath,
  image,
  preferences,
  saveLocalImage = saveNativeClipboardImage
}: SaveLocalEditorImageInput): Promise<SaveEditorImageResult> {
  if (!copyToStorage) {
    return {
      image: await saveLocalImage({
        copyToStorage: false,
        documentPath,
        fileName: await createImageUploadFileName(image, preferences.imageUpload.fileNamePattern),
        folder: preferences.clipboardImageFolder,
        image
      }),
      refreshTree: false,
      status: "saved"
    };
  }

  if (!documentPath) {
    return {
      reason: "requires-saved-document",
      status: "skipped"
    };
  }

  return {
    image: await saveLocalImage({
      documentPath,
      fileName: await createImageUploadFileName(image, preferences.imageUpload.fileNamePattern),
      folder: preferences.clipboardImageFolder,
      image
    }),
    refreshTree: true,
    status: "saved"
  };
}

function imageExtensionFromFile(image: File) {
  const mimeExtension = imageMimeExtensions[image.type.toLowerCase()];
  if (mimeExtension) return mimeExtension;

  const nameExtension = image.name
    .split(".")
    .pop()
    ?.trim()
    .toLowerCase();
  if (nameExtension && ["avif", "bmp", "gif", "jpg", "jpeg", "png", "svg", "webp"].includes(nameExtension)) {
    return nameExtension === "jpeg" ? "jpg" : nameExtension;
  }

  return "png";
}

function sanitizeFileNamePart(value: string) {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[.-]+|[.-]+$/gu, "");
}

function stripKnownImageExtension(value: string) {
  return value.replace(/\.(?:avif|bmp|gif|jpe?g|png|webp)$/iu, "");
}

async function fileMd5Hex(file: File) {
  return bytesToHex(md5(new Uint8Array(await file.arrayBuffer())));
}

function defaultRandomToken() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/gu, "").slice(0, 8);
  }

  return Math.random().toString(36).slice(2, 10);
}
