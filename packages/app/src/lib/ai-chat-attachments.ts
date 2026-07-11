import type {
  AiAgentSessionAttachment,
  DocumentAiChatImage
} from "@markra/ai";
import { getAppRuntime } from "../runtime";

export const aiChatAttachmentMaxCount = 4;
export const aiChatAttachmentMaxFileBytes = 10 * 1024 * 1024;
export const aiChatAttachmentMaxTotalBytes = 20 * 1024 * 1024;

export type AiChatAttachmentValidationErrorCode =
  | "file_too_large"
  | "too_many"
  | "total_too_large"
  | "unreadable_image"
  | "unsupported_format";

export class AiChatAttachmentValidationError extends Error {
  constructor(readonly code: AiChatAttachmentValidationErrorCode) {
    super(code);
    this.name = "AiChatAttachmentValidationError";
  }
}

export type DraftAiChatAttachment = {
  file: File;
  metadata: AiAgentSessionAttachment;
  previewUrl: string;
};

type ImageDimensions = {
  height: number;
  width: number;
};

type DraftAiChatAttachmentDependencies = {
  createId?: () => string;
  createPreviewUrl?: (file: File) => string;
  readDimensions?: (file: File) => Promise<ImageDimensions>;
};

const supportedImageMimeTypes = new Set<AiAgentSessionAttachment["mimeType"]>([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export async function createDraftAiChatAttachments(
  files: readonly File[],
  existing: readonly DraftAiChatAttachment[] = [],
  dependencies: DraftAiChatAttachmentDependencies = {}
) {
  if (existing.length + files.length > aiChatAttachmentMaxCount) {
    throw new AiChatAttachmentValidationError("too_many");
  }

  const totalBytes = existing.reduce((total, attachment) => total + attachment.metadata.size, 0)
    + files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > aiChatAttachmentMaxTotalBytes) {
    throw new AiChatAttachmentValidationError("total_too_large");
  }

  for (const file of files) {
    if (!isSupportedImageMimeType(file.type)) {
      throw new AiChatAttachmentValidationError("unsupported_format");
    }
    if (file.size > aiChatAttachmentMaxFileBytes) {
      throw new AiChatAttachmentValidationError("file_too_large");
    }
  }

  const readDimensions = dependencies.readDimensions ?? readBrowserImageDimensions;
  const dimensions = await Promise.all(files.map(async (file) => {
    try {
      const result = await readDimensions(file);
      if (!isPositiveDimension(result.width) || !isPositiveDimension(result.height)) {
        throw new Error("Image dimensions are invalid.");
      }

      return result;
    } catch {
      throw new AiChatAttachmentValidationError("unreadable_image");
    }
  }));
  const createId = dependencies.createId ?? createAttachmentId;
  const createPreviewUrl = dependencies.createPreviewUrl ?? ((file: File) => URL.createObjectURL(file));

  return files.map((file, index): DraftAiChatAttachment => ({
    file,
    metadata: {
      height: dimensions[index]!.height,
      id: createId(),
      mimeType: file.type as AiAgentSessionAttachment["mimeType"],
      name: file.name.trim() || "image",
      size: file.size,
      width: dimensions[index]!.width
    },
    previewUrl: createPreviewUrl(file)
  }));
}

export function revokeDraftAiChatAttachments(
  attachments: readonly DraftAiChatAttachment[],
  revokePreviewUrl: (url: string) => unknown = URL.revokeObjectURL
) {
  attachments.forEach((attachment) => revokePreviewUrl(attachment.previewUrl));
}

export async function persistDraftAiChatAttachments(
  sessionId: string,
  attachments: readonly DraftAiChatAttachment[]
) {
  const runtime = getAppRuntime().aiChatAttachments;

  for (const attachment of attachments) {
    await runtime.save({
      attachmentId: attachment.metadata.id,
      bytes: Array.from(new Uint8Array(await attachment.file.arrayBuffer())),
      mimeType: attachment.metadata.mimeType,
      sessionId
    });
  }

  return attachments.map((attachment) => attachment.metadata);
}

export async function resolveAiChatAttachments(
  sessionId: string,
  attachments: readonly AiAgentSessionAttachment[],
  options: { allowMissing?: boolean } = {}
): Promise<{
  images: DocumentAiChatImage[];
  missing: AiAgentSessionAttachment[];
}> {
  const images: DocumentAiChatImage[] = [];
  const missing: AiAgentSessionAttachment[] = [];

  for (const attachment of attachments) {
    try {
      const bytes = await getAppRuntime().aiChatAttachments.read({
        attachmentId: attachment.id,
        mimeType: attachment.mimeType,
        sessionId
      });
      images.push({
        dataUrl: bytesToDataUrl(bytes, attachment.mimeType),
        id: attachment.id,
        mimeType: attachment.mimeType
      });
    } catch (error) {
      if (options.allowMissing !== true) throw error;
      missing.push(attachment);
    }
  }

  return { images, missing };
}

function isSupportedImageMimeType(value: string): value is AiAgentSessionAttachment["mimeType"] {
  return supportedImageMimeTypes.has(value as AiAgentSessionAttachment["mimeType"]);
}

function isPositiveDimension(value: number) {
  return Number.isFinite(value) && value > 0;
}

function createAttachmentId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();

  return `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readBrowserImageDimensions(file: File) {
  return new Promise<ImageDimensions>((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(source);

    image.onload = () => {
      const dimensions = {
        height: image.naturalHeight,
        width: image.naturalWidth
      };
      cleanup();
      resolve(dimensions);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Image could not be decoded."));
    };
    image.src = source;
  });
}

function bytesToDataUrl(bytes: readonly number[], mimeType: AiAgentSessionAttachment["mimeType"]) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}
