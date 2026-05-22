import { Type } from "@mariozechner/pi-ai";
import { buildDocumentAnchors, buildSectionAnchors } from "./anchors";
import { DocumentAgentToolFactory } from "./base";
import { typedReadDocumentArgs } from "./params";
import { toolErrorResult } from "./results";
import { sliceDocumentText } from "./text";

const defaultReadMaxChars = 24_000;

export class ReadDocumentToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedReadDocumentArgs>> {
  protected readonly description = [
    "Read Markdown content from the current document by full document, range, anchor, or section.",
    "Use maxChars and offset to page or truncate large reads instead of returning unnecessary full-document context."
  ].join(" ");
  protected readonly label = "Read document";
  protected readonly name = "read_document";
  protected readonly parameters = Type.Object({
    anchorId: Type.Optional(Type.String({ minLength: 1 })),
    from: Type.Optional(Type.Number({ minimum: 0 })),
    maxChars: Type.Optional(Type.Number({ maximum: 60000, minimum: 1 })),
    offset: Type.Optional(Type.Number({ minimum: 0 })),
    targetKind: Type.Optional(Type.Union([
      Type.Literal("anchor"),
      Type.Literal("document"),
      Type.Literal("range"),
      Type.Literal("section")
    ])),
    to: Type.Optional(Type.Number({ minimum: 0 }))
  });

  protected parseParams(params: unknown) {
    return typedReadDocumentArgs(params);
  }

  protected executeTool(_toolCallId: string, params: ReturnType<typeof typedReadDocumentArgs>) {
    const region = this.resolveReadRegion(params);
    const maxChars = params.maxChars ?? defaultReadMaxChars;
    const offset = params.offset ?? 0;
    const readableText = region.text.slice(offset, offset + maxChars);
    const truncated = offset + maxChars < region.text.length;

    return {
      content: [
        {
          text: [
            `Document path: ${this.context.documentPath ?? "Untitled.md"}`,
            `Read target: ${params.targetKind}`,
            `Range: ${region.from}-${region.to}`,
            `Offset: ${offset}`,
            `Length: ${region.text.length}`,
            truncated ? `Truncated: yes, next offset ${offset + maxChars}` : "Truncated: no",
            "",
            readableText || "(empty document)"
          ].join("\n"),
          type: "text" as const
        }
      ],
      details: {
        from: region.from,
        length: region.text.length,
        offset,
        targetKind: params.targetKind,
        to: region.to,
        truncated
      },
      terminate: false
    };
  }

  private resolveReadRegion(params: ReturnType<typeof typedReadDocumentArgs>) {
    if (params.targetKind === "range") {
      const from = Math.max(0, params.from ?? 0);
      const to = Math.min(this.context.documentEndPosition, params.to ?? this.context.documentEndPosition);
      if (from > to) {
        return toolErrorResult("Cannot read document range because from is greater than to.");
      }

      return {
        from,
        text: sliceDocumentText(this.context.documentContent, from, to),
        to
      };
    }

    if (params.targetKind === "anchor" || params.targetKind === "section") {
      if (!params.anchorId) {
        return toolErrorResult(`Cannot read ${params.targetKind} because anchorId was not provided.`);
      }

      const anchors = params.targetKind === "section"
        ? buildSectionAnchors(this.context)
        : [
            ...buildDocumentAnchors(this.context),
            ...buildSectionAnchors(this.context)
          ];
      const anchor = anchors.find((candidate) => candidate.id === params.anchorId);
      if (!anchor) {
        return toolErrorResult(`Cannot read document content because anchor "${params.anchorId}" was not found.`);
      }

      return {
        from: anchor.from,
        text: anchor.text ?? sliceDocumentText(this.context.documentContent, anchor.from, anchor.to),
        to: anchor.to
      };
    }

    return {
      from: 0,
      text: this.context.documentContent,
      to: this.context.documentEndPosition
    };
  }
}
