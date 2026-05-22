import { Type } from "@mariozechner/pi-ai";
import { buildDocumentAnchors, buildSectionAnchors, documentTableAnchors } from "./anchors";
import { DocumentAgentToolFactory } from "./base";
import {
  formatDocumentAnchorsText,
  formatDocumentImageReferencesText,
  formatHeadingOutlineText,
  formatSectionAnchorsText
} from "./format";
import { extractMarkdownImageReferences } from "./images";
import { getMarkdownLines, sliceDocumentText, summarizeAnchorTitle } from "./text";

export class InspectDocumentStructureToolFactory extends DocumentAgentToolFactory {
  protected readonly description = "Inspect Markdown structure: headings, sections, blocks, tables, images, and anchors.";
  protected readonly label = "Inspect document structure";
  protected readonly name = "inspect_document_structure";
  protected readonly parameters = Type.Object({});

  protected executeTool() {
    const sections = buildSectionAnchors(this.context);
    const anchors = buildDocumentAnchors(this.context);
    const tables = documentTableAnchors(this.context);
    const images = extractMarkdownImageReferences(this.context.documentContent);
    const blocks = buildMarkdownBlocks(this.context.documentContent);

    return {
      content: [
        {
          text: [
            "Headings:",
            formatHeadingOutlineText(this.context.headingAnchors ?? []),
            "",
            "Sections:",
            formatSectionAnchorsText(sections, this.context.documentContent),
            "",
            "Blocks:",
            blocks.length
              ? blocks.map((block, index) => `- block:${index}: ${block.title} (${block.from}-${block.to})`).join("\n")
              : "No Markdown blocks are available in the current document.",
            "",
            "Tables:",
            tables.length
              ? tables.map((table) => `- ${table.id}: ${table.title ?? "(untitled)"} (${table.from}-${table.to})`).join("\n")
              : "No Markdown tables are available in the current document.",
            "",
            "Images and assets:",
            formatDocumentImageReferencesText(images),
            "",
            "Anchors:",
            formatDocumentAnchorsText(anchors)
          ].join("\n"),
          type: "text" as const
        }
      ],
      details: {
        anchorCount: anchors.length,
        anchors: anchors.map((anchor) => ({
          description: anchor.description,
          from: anchor.from,
          id: anchor.id,
          kind: anchor.kind,
          title: anchor.title,
          to: anchor.to
        })),
        blockCount: blocks.length,
        blocks,
        headingCount: (this.context.headingAnchors ?? []).length,
        imageCount: images.length,
        images,
        sectionCount: sections.length,
        tableCount: tables.length,
        tables: tables.map((table) => ({
          from: table.from,
          id: table.id,
          title: table.title,
          to: table.to
        }))
      },
      terminate: false
    };
  }
}

function buildMarkdownBlocks(content: string) {
  const lines = getMarkdownLines(content);
  const blocks: Array<{ from: number; title: string; to: number }> = [];
  let blockStart: number | null = null;
  let blockEnd = 0;

  lines.forEach((line) => {
    if (!line.text.trim()) {
      if (blockStart !== null) {
        blocks.push({
          from: blockStart,
          title: summarizeAnchorTitle(sliceDocumentText(content, blockStart, blockEnd)),
          to: blockEnd
        });
        blockStart = null;
      }
      return;
    }

    blockStart ??= line.from;
    blockEnd = line.to;
  });

  if (blockStart !== null) {
    blocks.push({
      from: blockStart,
      title: summarizeAnchorTitle(sliceDocumentText(content, blockStart, blockEnd)),
      to: blockEnd
    });
  }

  return blocks;
}
