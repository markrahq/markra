import { createDefaultAppRuntime, configureAppRuntime, resetAppRuntimeForTests } from "../runtime";
import {
  AiChatAttachmentValidationError,
  aiChatAttachmentMaxCount,
  aiChatAttachmentMaxFileBytes,
  aiChatAttachmentMaxTotalBytes,
  createDraftAiChatAttachments,
  persistDraftAiChatAttachments,
  resolveAiChatAttachments,
  revokeDraftAiChatAttachments
} from "./ai-chat-attachments";

const pngBytes = new Uint8Array([1, 2, 3]);

function syntheticImage(name: string, type = "image/png", bytes: BlobPart = pngBytes) {
  return new File([bytes], name, { type });
}

describe("AI chat attachments", () => {
  afterEach(() => {
    resetAppRuntimeForTests();
  });

  it("creates validated draft metadata and owned preview URLs", async () => {
    const createPreviewUrl = vi.fn(() => "blob:preview-1");
    const readDimensions = vi.fn(async () => ({ height: 480, width: 640 }));

    const attachments = await createDraftAiChatAttachments(
      [syntheticImage("Synthetic diagram.png")],
      [],
      {
        createId: () => "attachment-1",
        createPreviewUrl,
        readDimensions
      }
    );

    expect(attachments).toEqual([
      {
        file: expect.any(File),
        metadata: {
          height: 480,
          id: "attachment-1",
          mimeType: "image/png",
          name: "Synthetic diagram.png",
          size: 3,
          width: 640
        },
        previewUrl: "blob:preview-1"
      }
    ]);
    expect(readDimensions).toHaveBeenCalledWith(expect.any(File));
    expect(createPreviewUrl).toHaveBeenCalledWith(expect.any(File));
  });

  it.each([
    {
      code: "unsupported_format",
      files: [syntheticImage("vector.svg", "image/svg+xml")]
    },
    {
      code: "file_too_large",
      files: [syntheticImage("large.png", "image/png", new Uint8Array(aiChatAttachmentMaxFileBytes + 1))]
    },
    {
      code: "too_many",
      files: Array.from({ length: aiChatAttachmentMaxCount + 1 }, (_, index) => syntheticImage(`${index}.png`))
    },
    {
      code: "total_too_large",
      files: Array.from({ length: 3 }, (_, index) => syntheticImage(
        `${index}.png`,
        "image/png",
        new Uint8Array(Math.floor(aiChatAttachmentMaxTotalBytes / 3) + 1)
      ))
    }
  ] as const)("rejects invalid attachment input with $code", async ({ code, files }) => {
    await expect(createDraftAiChatAttachments(files, [], {
      createId: () => "attachment",
      createPreviewUrl: () => "blob:preview",
      readDimensions: async () => ({ height: 1, width: 1 })
    })).rejects.toMatchObject({
      code
    } satisfies Partial<AiChatAttachmentValidationError>);
  });

  it("rejects image files that cannot be decoded to positive dimensions", async () => {
    await expect(createDraftAiChatAttachments([syntheticImage("broken.png")], [], {
      createId: () => "attachment",
      createPreviewUrl: () => "blob:preview",
      readDimensions: async () => ({ height: 0, width: 0 })
    })).rejects.toMatchObject({
      code: "unreadable_image"
    } satisfies Partial<AiChatAttachmentValidationError>);
  });

  it("revokes only preview URLs owned by draft attachments", async () => {
    const revokePreviewUrl = vi.fn();
    const drafts = await createDraftAiChatAttachments([syntheticImage("synthetic.png")], [], {
      createId: () => "attachment",
      createPreviewUrl: () => "blob:owned-preview",
      readDimensions: async () => ({ height: 1, width: 1 })
    });

    revokeDraftAiChatAttachments(drafts, revokePreviewUrl);

    expect(revokePreviewUrl).toHaveBeenCalledWith("blob:owned-preview");
  });

  it("persists binary files and resolves stored images for model requests", async () => {
    const saved = new Map<string, number[]>();
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      aiChatAttachments: {
        deleteSession: async () => undefined,
        read: async (input) => {
          const bytes = saved.get(input.attachmentId);
          if (!bytes) throw new Error("missing");

          return bytes;
        },
        save: async (input) => {
          saved.set(input.attachmentId, input.bytes);
        }
      }
    });
    const drafts = await createDraftAiChatAttachments([syntheticImage("synthetic.png")], [], {
      createId: () => "attachment-1",
      createPreviewUrl: () => "blob:preview",
      readDimensions: async () => ({ height: 1, width: 1 })
    });

    const metadata = await persistDraftAiChatAttachments("session-1", drafts);
    const resolved = await resolveAiChatAttachments("session-1", metadata);

    expect(saved.get("attachment-1")).toEqual([1, 2, 3]);
    expect(resolved).toEqual({
      images: [{
        dataUrl: "data:image/png;base64,AQID",
        id: "attachment-1",
        mimeType: "image/png"
      }],
      missing: []
    });
  });

  it("can omit missing historical images while strict current-turn reads fail", async () => {
    const runtime = createDefaultAppRuntime();
    configureAppRuntime({
      ...runtime,
      aiChatAttachments: {
        deleteSession: async () => undefined,
        read: async () => {
          throw new Error("missing");
        },
        save: async () => undefined
      }
    });
    const metadata = [{
      height: 1,
      id: "missing-attachment",
      mimeType: "image/webp" as const,
      name: "missing.webp",
      size: 3,
      width: 1
    }];

    await expect(resolveAiChatAttachments("session-1", metadata)).rejects.toThrow("missing");
    await expect(resolveAiChatAttachments("session-1", metadata, { allowMissing: true })).resolves.toEqual({
      images: [],
      missing: metadata
    });
  });
});
