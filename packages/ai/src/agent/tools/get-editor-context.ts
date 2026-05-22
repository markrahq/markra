import { Type } from "@mariozechner/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import { buildDocumentAnchors, buildSectionAnchors, documentTableAnchors } from "./anchors";
import { extractMarkdownImageReferences } from "./images";

export class GetEditorContextToolFactory extends DocumentAgentToolFactory {
  protected readonly description = [
    "Read lightweight editor metadata without returning the full document.",
    "Returns current file path, document length, selection, cursor, and available capabilities."
  ].join(" ");
  protected readonly label = "Get editor context";
  protected readonly name = "get_editor_context";
  protected readonly parameters = Type.Object({});

  protected executeTool() {
    const selection = this.context.selection;
    const sectionCount = buildSectionAnchors(this.context).length;
    const tableCount = documentTableAnchors(this.context).length;
    const imageCount = extractMarkdownImageReferences(this.context.documentContent).length;
    const anchorCount = buildDocumentAnchors(this.context).length + sectionCount;
    const capabilities = {
      documentImages: Boolean(this.context.readDocumentImage),
      headings: (this.context.headingAnchors ?? []).length > 0,
      sections: sectionCount > 0,
      tables: tableCount > 0,
      workspaceFiles: this.context.workspaceFiles.length > 0,
      workspaceRead: Boolean(this.context.readWorkspaceFile)
    };

    return {
      content: [
        {
          text: [
            `Document path: ${this.context.documentPath ?? "Untitled.md"}`,
            `Document length: ${this.context.documentContent.length}`,
            `Document end position: ${this.context.documentEndPosition}`,
            selection?.text
              ? `Selection range: ${selection.from}-${selection.to}`
              : "Selection range: none",
            `Cursor: ${selection?.cursor ?? selection?.to ?? this.context.documentEndPosition}`,
            `Selection source: ${selection?.source ?? "none"}`,
            `Available anchors: ${anchorCount}`,
            `Available headings: ${(this.context.headingAnchors ?? []).length}`,
            `Available sections: ${sectionCount}`,
            `Available tables: ${tableCount}`,
            `Available images: ${imageCount}`,
            `Workspace files: ${this.context.workspaceFiles.length}`,
            `Capabilities: ${Object.entries(capabilities).filter(([, enabled]) => enabled).map(([name]) => name).join(", ") || "none"}`
          ].join("\n"),
          type: "text" as const
        }
      ],
      details: {
        anchorCount,
        capabilities,
        cursor: selection?.cursor ?? selection?.to ?? this.context.documentEndPosition,
        documentEndPosition: this.context.documentEndPosition,
        documentLength: this.context.documentContent.length,
        documentPath: this.context.documentPath,
        headingCount: (this.context.headingAnchors ?? []).length,
        imageCount,
        sectionCount,
        selection: selection
          ? {
              from: selection.from,
              source: selection.source ?? "selection",
              textLength: selection.text.length,
              to: selection.to
            }
          : null,
        tableCount,
        workspaceFileCount: this.context.workspaceFiles.length
      },
      terminate: false
    };
  }
}
