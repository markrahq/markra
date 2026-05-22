import { Type } from "@mariozechner/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import {
  extractMarkdownImageReferences,
  resolveMarkdownImageReference
} from "./images";
import { typedViewAssetArgs } from "./params";
import { toolErrorResult } from "./results";

export class ViewAssetToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedViewAssetArgs>> {
  protected readonly description = [
    "Read one asset referenced by the current Markdown document and return it for understanding.",
    "Currently supports local Markdown image references. Call list_assets first, then pass an exact src."
  ].join(" ");
  protected readonly label = "View asset";
  protected readonly name = "view_asset";
  protected readonly parameters = Type.Object({
    src: Type.String({ minLength: 1 })
  });

  protected parseParams(params: unknown) {
    return typedViewAssetArgs(params);
  }

  protected async executeTool(_toolCallId: string, params: ReturnType<typeof typedViewAssetArgs>) {
    const references = extractMarkdownImageReferences(this.context.documentContent);
    const reference = resolveMarkdownImageReference(references, params.src);
    if (!reference) {
      return toolErrorResult("Cannot read that image because it is not referenced by the current Markdown document. Call list_assets and pass an exact src.");
    }

    if (!this.context.readDocumentImage) {
      return toolErrorResult("Document image reading is unavailable in this session.");
    }

    try {
      const image = await this.context.readDocumentImage(reference.src);
      if (!image) {
        return toolErrorResult(`Failed to read Markdown image "${reference.src}".`);
      }

      return {
        content: [
          {
            text: [
              `Image src: ${reference.src}`,
              `Alt text: ${reference.alt || "(empty)"}`,
              `Resolved path: ${image.path ?? "(unavailable)"}`
            ].join("\n"),
            type: "text" as const
          },
          {
            data: image.dataUrl,
            mimeType: image.mimeType,
            type: "image" as const
          }
        ],
        details: {
          alt: reference.alt,
          kind: "image",
          mimeType: image.mimeType,
          path: image.path ?? null,
          src: reference.src
        },
        terminate: false
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown image read error.";

      return toolErrorResult(`Failed to read Markdown image "${reference.src}": ${message}`);
    }
  }
}
