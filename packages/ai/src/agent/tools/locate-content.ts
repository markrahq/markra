import { Type } from "@mariozechner/pi-ai";
import { buildDocumentAnchors, buildSectionAnchors } from "./anchors";
import { DocumentAgentToolFactory } from "./base";
import { formatLocatedRegionText, formatLocatedSectionText } from "./format";
import { locateMarkdownRegion, locateSection } from "./locate";
import { typedLocateContentArgs } from "./params";

export class LocateContentToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedLocateContentArgs>> {
  protected readonly description = [
    "Locate the most appropriate document content anchor for an edit.",
    "Use targetKind=section for whole-section rewrites, deletions, or moves; otherwise use targetKind=region for headings, tables, current blocks, document end, or the whole document."
  ].join(" ");
  protected readonly label = "Locate content";
  protected readonly name = "locate_content";
  protected readonly parameters = Type.Object({
    goal: Type.Optional(Type.String()),
    headingTitle: Type.Optional(Type.String()),
    operation: Type.Optional(Type.Union([
      Type.Literal("delete"),
      Type.Literal("insert"),
      Type.Literal("replace")
    ])),
    targetKind: Type.Optional(Type.Union([
      Type.Literal("region"),
      Type.Literal("section")
    ]))
  });

  protected parseParams(params: unknown) {
    return typedLocateContentArgs(params);
  }

  protected executeTool(_toolCallId: string, params: ReturnType<typeof typedLocateContentArgs>) {
    if (params.targetKind === "section") {
      const sections = buildSectionAnchors(this.context);
      const located = locateSection(sections, params);

      return {
        content: [
          {
            text: formatLocatedSectionText(located, sections, this.context.documentContent),
            type: "text" as const
          }
        ],
        details: {
          ...located,
          targetKind: "section"
        },
        terminate: false
      };
    }

    const anchors = buildDocumentAnchors(this.context);
    const located = locateMarkdownRegion(anchors, params.goal ?? params.headingTitle ?? "", params.operation);

    return {
      content: [
        {
          text: formatLocatedRegionText(located, anchors, this.context.documentContent),
          type: "text" as const
        }
      ],
      details: {
        ...located,
        targetKind: "region"
      },
      terminate: false
    };
  }
}
