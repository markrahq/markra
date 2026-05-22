import { Type } from "@mariozechner/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import { formatDocumentImageReferencesText } from "./format";
import { extractMarkdownImageReferences } from "./images";

export class ListAssetsToolFactory extends DocumentAgentToolFactory {
  protected readonly description = [
    "List assets referenced by the current Markdown document, including local image references.",
    "Use this before view_asset when the user asks about screenshots, figures, diagrams, photos, or other referenced visual content."
  ].join(" ");
  protected readonly label = "List assets";
  protected readonly name = "list_assets";
  protected readonly parameters = Type.Object({});

  protected executeTool() {
    const images = extractMarkdownImageReferences(this.context.documentContent);

    return {
      content: [
        {
          text: formatDocumentImageReferencesText(images),
          type: "text" as const
        }
      ],
      details: {
        assets: images.map((image) => ({
          ...image,
          kind: "image"
        })),
        count: images.length,
        imageCount: images.length
      },
      terminate: false
    };
  }
}
