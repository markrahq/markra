import { Type } from "@earendil-works/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import { formatAssetInventoryText } from "./format";
import { extractMarkdownImageReferences, workspaceImageFiles } from "./images";

export class ListAssetsToolFactory extends DocumentAgentToolFactory {
  protected readonly description = [
    "List image assets available to this turn, including current document image references and workspace image files.",
    "Use this before view_asset when the user asks about screenshots, figures, diagrams, photos, or referenced visual content."
  ].join(" ");
  protected readonly label = "List assets";
  protected readonly name = "list_assets";
  protected readonly parameters = Type.Object({});

  protected executeTool() {
    const images = extractMarkdownImageReferences(this.context.documentContent);
    const workspaceImages = workspaceImageFiles(this.context.workspaceFiles);

    return {
      content: [
        {
          text: formatAssetInventoryText(images, workspaceImages),
          type: "text" as const
        }
      ],
      details: {
        assets: [
          ...images.map((image) => ({
            ...image,
            kind: "document-image-reference"
          })),
          ...workspaceImages.map((file) => ({
            ...file,
            kind: "workspace-image-file"
          }))
        ],
        count: images.length + workspaceImages.length,
        documentImageReferenceCount: images.length,
        workspaceImageCount: workspaceImages.length
      },
      terminate: false
    };
  }
}
