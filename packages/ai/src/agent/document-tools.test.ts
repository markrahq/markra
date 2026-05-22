import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { createDocumentAgentTools } from "./document-tools";

function toolText(result: AgentToolResult<unknown> | undefined) {
  const content = result?.content[0];

  return content?.type === "text" ? content.text : "";
}

type PreviewResultCallback = Parameters<typeof createDocumentAgentTools>[0]["onPreviewResult"];

function selectedAwsHeadingToolContext(onPreviewResult: PreviewResultCallback) {
  const documentContent = ["## LoginAWS", "", "Body", "", "## Pull img", "", "Pull body"].join("\n");
  const firstHeading = "## LoginAWS";
  const secondHeading = "## Pull img";

  return {
    context: {
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/AWS.md",
      headingAnchors: [
        { from: 0, level: 2, title: "LoginAWS", to: firstHeading.length },
        {
          from: documentContent.indexOf(secondHeading),
          level: 2,
          title: "Pull img",
          to: documentContent.indexOf(secondHeading) + secondHeading.length
        }
      ],
      onPreviewResult,
      selection: {
        cursor: 11,
        from: 3,
        source: "selection" as const,
        text: "LoginAWS",
        to: 11
      },
      workspaceFiles: []
    },
    firstHeading
  };
}

describe("documentAgentTools", () => {
  it("lists and reads Markdown document images", async () => {
    const readDocumentImage = vi.fn(async (src: string) => ({
      dataUrl: "data:image/png;base64,aGVsbG8=",
      mimeType: "image/png",
      path: `/vault/${src}`,
      src
    }));
    const tools = createDocumentAgentTools({
      documentContent: "# Current\n\n![Screen shot](<assets/screen%20shot.png>)",
      documentEndPosition: 53,
      documentPath: "/vault/current.md",
      readDocumentImage,
      selection: null,
      workspaceFiles: []
    });
    const listTool = tools.find((item) => item.name === "list_assets");
    const viewTool = tools.find((item) => item.name === "view_asset");

    const listResult = await listTool?.execute("tool_list_assets", {});
    expect(toolText(listResult)).toContain("src: assets/screen%20shot.png");
    expect(toolText(listResult)).toContain("file: screen shot.png");

    const viewResult = await viewTool?.execute("tool_view_asset", {
      src: "assets/screen%20shot.png"
    });

    expect(readDocumentImage).toHaveBeenCalledWith("assets/screen%20shot.png");
    expect(toolText(viewResult)).toContain("Image src: assets/screen%20shot.png");
    expect(viewResult?.content[1]).toEqual({
      data: "data:image/png;base64,aGVsbG8=",
      mimeType: "image/png",
      type: "image"
    });
  });

  it("rejects document image reads that are not referenced by the current document", async () => {
    const readDocumentImage = vi.fn(async () => ({
      dataUrl: "data:image/png;base64,aGVsbG8=",
      mimeType: "image/png",
      src: "private.png"
    }));
    const viewTool = createDocumentAgentTools({
      documentContent: "# Current\n\n![Visible](assets/visible.png)",
      documentEndPosition: 40,
      documentPath: "/vault/current.md",
      readDocumentImage,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "view_asset");

    await expect(viewTool?.execute("tool_view_asset", {
      src: "../private.png"
    })).rejects.toThrow(
      "Cannot read that image because it is not referenced by the current Markdown document."
    );
    expect(readDocumentImage).not.toHaveBeenCalled();
  });

  it("reads a workspace Markdown file by exact relative path", async () => {
    const readWorkspaceFile = vi.fn(async () => "# Nearby note\n\nUseful context.");
    const context = {
      documentContent: "# Current",
      documentEndPosition: 9,
      documentPath: "/vault/current.md",
      readWorkspaceFile,
      selection: null,
      workspaceFiles: [
        {
          name: "compare.md",
          path: "/vault/notes/compare.md",
          relativePath: "notes/compare.md"
        }
      ]
    };
    const tool = createDocumentAgentTools(context).find((item) => item.name === "read_workspace_file");

    const result = await tool?.execute("tool_read_workspace_file", {
      action: "read",
      relativePath: "notes/compare.md"
    });

    expect(readWorkspaceFile).toHaveBeenCalledWith("/vault/notes/compare.md");
    expect(toolText(result)).toContain("Workspace file: notes/compare.md");
    expect(toolText(result)).toContain("Useful context.");
  });

  it("adds a Cherry-style web search tool when web search is configured", async () => {
    const runWebSearch = vi.fn(async () => ({
      query: "current release",
      results: [
        {
          content: "Release notes content.",
          title: "Release notes",
          url: "https://example.com/release"
        }
      ]
    }));
    const tool = createDocumentAgentTools({
      documentContent: "# Current",
      documentEndPosition: 9,
      documentPath: "/vault/current.md",
      selection: null,
      webSearch: {
        runWebSearch,
        settings: {
          contentMaxChars: 12000,
          enabled: true,
          maxResults: 5,
          providerId: "local-bing",
          searxngApiHost: ""
        }
      },
      workspaceFiles: []
    }).find((item) => item.name === "web_search");

    const result = await tool?.execute("tool_web_search", {
      query: "current release"
    });

    expect(runWebSearch).toHaveBeenCalledWith("current release", {
      contentMaxChars: 12000,
      enabled: true,
      maxResults: 5,
      providerId: "local-bing",
      searxngApiHost: ""
    });
    expect(toolText(result)).toContain("[1] Release notes");
    expect(toolText(result)).toContain("Release notes content.");
    expect(result?.details).toEqual({
      count: 1,
      providerId: "local-bing",
      query: "current release",
      urls: ["https://example.com/release"]
    });
  });

  it("rejects workspace file reads outside the known Markdown tree", async () => {
    const readWorkspaceFile = vi.fn(async () => "secret");
    const context = {
      documentContent: "# Current",
      documentEndPosition: 9,
      documentPath: "/vault/current.md",
      readWorkspaceFile,
      selection: null,
      workspaceFiles: [
        {
          name: "compare.md",
          path: "/vault/notes/compare.md",
          relativePath: "notes/compare.md"
        }
      ]
    };
    const tool = createDocumentAgentTools(context).find((item) => item.name === "read_workspace_file");

    await expect(tool?.execute("tool_read_workspace_file", {
      action: "read",
      path: "/vault/../private.md"
    })).rejects.toThrow(
      "Cannot read that file because it is not in the current Markdown workspace."
    );
    expect(readWorkspaceFile).not.toHaveBeenCalled();
  });

  it("searches nearby workspace Markdown files by path and content", async () => {
    const readWorkspaceFile = vi.fn(async (path: string) =>
      path.endsWith("install.md") ? "# Install\n\nUse pnpm install." : "# Notes\n\nOther content."
    );
    const tool = createDocumentAgentTools({
      documentContent: "# Current",
      documentEndPosition: 9,
      documentPath: "/vault/current.md",
      readWorkspaceFile,
      selection: null,
      workspaceFiles: [
        {
          name: "install.md",
          path: "/vault/docs/install.md",
          relativePath: "docs/install.md"
        },
        {
          name: "notes.md",
          path: "/vault/notes.md",
          relativePath: "notes.md"
        }
      ]
    }).find((item) => item.name === "search_workspace");

    const result = await tool?.execute("tool_search_workspace", {
      query: "pnpm install"
    });

    expect(readWorkspaceFile).toHaveBeenCalledWith("/vault/docs/install.md");
    expect(toolText(result)).toContain("docs/install.md");
    expect(toolText(result)).toContain("Use pnpm install.");
    expect(result?.details).toEqual(expect.objectContaining({
      count: 1,
      query: "pnpm install"
    }));
  });

  it("rejects workspace searches with an empty normalized query", async () => {
    const readWorkspaceFile = vi.fn(async () => "# Alpha");
    const tool = createDocumentAgentTools({
      documentContent: "# Current",
      documentEndPosition: 9,
      documentPath: "/vault/current.md",
      readWorkspaceFile,
      selection: null,
      workspaceFiles: [
        {
          name: "alpha.md",
          path: "/vault/alpha.md",
          relativePath: "alpha.md"
        }
      ]
    }).find((item) => item.name === "search_workspace");

    await expect(tool?.execute("tool_search_workspace", {
      query: "!!!"
    })).rejects.toThrow("Cannot search workspace because the query is empty.");
    expect(readWorkspaceFile).not.toHaveBeenCalled();
  });

  it("returns the current heading outline with editor anchors", async () => {
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\n## Section\n\nBody",
      documentEndPosition: 24,
      documentPath: "/vault/README.md",
      headingAnchors: [
        { from: 0, level: 1, title: "Title", to: 8 },
        { from: 10, level: 2, title: "Section", to: 21 }
      ],
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "inspect_document_structure");

    const result = await tool?.execute("tool_inspect_document_structure", {});

    expect(toolText(result)).toContain("# Title (0-8)");
    expect(toolText(result)).toContain("## Section (10-21)");
  });

  it("reads the full current document through read_document", async () => {
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\nBody",
      documentEndPosition: 13,
      documentPath: "/vault/README.md",
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "read_document");

    const result = await tool?.execute("tool_read_document", {
      targetKind: "document"
    });

    expect(toolText(result)).toContain("Document path: /vault/README.md");
    expect(toolText(result)).toContain("# Title\n\nBody");
    expect(result?.details).toEqual(expect.objectContaining({
      length: 13,
      targetKind: "document"
    }));
  });

  it("returns section anchors derived from headings", async () => {
    const documentContent = "# Title\n\nIntro\n\n## Section\n\nBody";
    const sectionHeadingStart = documentContent.indexOf("## Section");
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/README.md",
      headingAnchors: [
        { from: 0, level: 1, title: "Title", to: "# Title".length },
        { from: sectionHeadingStart, level: 2, title: "Section", to: sectionHeadingStart + "## Section".length }
      ],
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "inspect_document_structure");

    const result = await tool?.execute("tool_inspect_document_structure", {});

    expect(toolText(result)).toContain(`section:0: Title (0-${documentContent.length})`);
    expect(toolText(result)).toContain(`section:1: Section (${sectionHeadingStart}-${documentContent.length})`);
    expect(toolText(result)).toContain(`Markdown source range: 0-${documentContent.length}`);
    expect(toolText(result)).toContain("# Title");
    expect(toolText(result)).toContain("## Section");
  });

  it("prepares a delete preview for the current selection", async () => {
    const onPreviewResult = vi.fn();
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\nBody",
      documentEndPosition: 14,
      documentPath: "/vault/README.md",
      onPreviewResult,
      selection: {
        from: 0,
        source: "selection",
        text: "# Title",
        to: 7
      },
      workspaceFiles: []
    }).find((item) => item.name === "delete_content");

    const result = await tool?.execute("tool_delete_content", {});

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 0,
      original: "# Title",
      replacement: "",
      to: 7,
      type: "replace"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared a deletion preview");
  });

  it("prepares a full-document replacement preview", async () => {
    const onPreviewResult = vi.fn();
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\nOld body",
      documentEndPosition: 17,
      documentPath: "/vault/README.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    const result = await tool?.execute("tool_replace_content", {
      targetKind: "document",
      replacement: "# Focused note\n\nOnly the important part."
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 0,
      original: "# Title\n\nOld body",
      replacement: "# Focused note\n\nOnly the important part.",
      to: 17,
      type: "replace"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared a full-document replacement preview");
  });

  it("suppresses duplicate insert previews with identical content in the same turn", async () => {
    const onPreviewResult = vi.fn();
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\nBody",
      documentEndPosition: 13,
      documentPath: "/vault/README.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "insert_content");

    const firstResult = await tool?.execute("tool_insert_content_first", {
      anchorId: "document-end",
      content: "## Repeated summary\n\nSame generated report.",
      placement: "before_anchor"
    });
    const secondResult = await tool?.execute("tool_insert_content_second", {
      anchorId: "heading:0",
      content: "## Repeated summary\n\nSame generated report.",
      placement: "after_anchor"
    });

    expect(onPreviewResult).toHaveBeenCalledTimes(1);
    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 13,
      original: "",
      replacement: "## Repeated summary\n\nSame generated report.",
      to: 13,
      type: "insert"
    }, "tool_insert_content_first");
    expect(toolText(firstResult)).toContain("Prepared an insertion preview");
    expect(toolText(secondResult)).toContain("An identical insertion preview was already prepared earlier in this turn");
  });

  it("suppresses duplicate insert previews when only trailing whitespace and blank lines differ", async () => {
    const onPreviewResult = vi.fn();
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\nBody",
      documentEndPosition: 13,
      documentPath: "/vault/README.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "insert_content");

    await tool?.execute("tool_insert_content_first", {
      anchorId: "document-end",
      content: "## Repeated summary\n\nSame generated report.\n",
      placement: "before_anchor"
    });
    const secondResult = await tool?.execute("tool_insert_content_second", {
      anchorId: "document-end",
      content: "## Repeated summary  \n\nSame generated report.\n\n\n",
      placement: "before_anchor"
    });

    expect(onPreviewResult).toHaveBeenCalledTimes(1);
    expect(toolText(secondResult)).toContain("An identical insertion preview was already prepared earlier in this turn");
  });

  it("returns available anchors for the current editing context", async () => {
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\n## Section\n\nBody",
      documentEndPosition: 24,
      documentPath: "/vault/README.md",
      headingAnchors: [
        { from: 0, level: 1, title: "Title", to: 8 },
        { from: 10, level: 2, title: "Section", to: 21 }
      ],
      selection: {
        cursor: 16,
        from: 10,
        source: "block",
        text: "Section",
        to: 17
      },
      workspaceFiles: []
    }).find((item) => item.name === "inspect_document_structure");

    const result = await tool?.execute("tool_inspect_document_structure", {});

    expect(toolText(result)).toContain("current-context");
    expect(toolText(result)).toContain("whole-document");
    expect(toolText(result)).toContain("heading:1");
    expect(toolText(result)).toContain("document-end");
  });

  it("reads lightweight editor context for the current selection", async () => {
    const tool = createDocumentAgentTools({
      documentContent: "# LoginAWS\n\nBody",
      documentEndPosition: 16,
      documentPath: "/vault/AWS.md",
      headingAnchors: [{ from: 0, level: 1, title: "LoginAWS", to: 10 }],
      selection: {
        cursor: 10,
        from: 2,
        source: "selection",
        text: "LoginAWS",
        to: 10
      },
      workspaceFiles: []
    }).find((item) => item.name === "get_editor_context");

    const result = await tool?.execute("tool_get_editor_context", {});

    expect(toolText(result)).toContain("Document path: /vault/AWS.md");
    expect(toolText(result)).toContain("Document length: 16");
    expect(toolText(result)).toContain("Selection range: 2-10");
    expect(toolText(result)).toContain("Selection source: selection");
    expect(toolText(result)).not.toContain("# LoginAWS\n\nBody");
  });

  it("reads document content by range", async () => {
    const documentContent = ["# LoginAWS", "", "Body paragraph", "", "## Pull img"].join("\n");
    const bodyStart = documentContent.indexOf("Body paragraph");
    const nextHeadingStart = documentContent.indexOf("## Pull img");
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/AWS.md",
      headingAnchors: [
        { from: 0, level: 1, title: "LoginAWS", to: "# LoginAWS".length },
        {
          from: nextHeadingStart,
          level: 2,
          title: "Pull img",
          to: nextHeadingStart + "## Pull img".length
        }
      ],
      selection: {
        cursor: bodyStart + "Body paragraph".length,
        from: bodyStart,
        source: "selection",
        text: "Body paragraph",
        to: bodyStart + "Body paragraph".length
      },
      workspaceFiles: []
    }).find((item) => item.name === "read_document");

    const result = await tool?.execute("tool_read_document", {
      from: bodyStart,
      targetKind: "range",
      to: bodyStart + "Body paragraph".length
    });

    expect(toolText(result)).toContain("Body paragraph");
    expect(toolText(result)).not.toContain("# LoginAWS");
    expect(result?.details).toEqual(expect.objectContaining({
      from: bodyStart,
      targetKind: "range",
      to: bodyStart + "Body paragraph".length
    }));
  });

  it("searches the current document for exact text", async () => {
    const documentContent = "# Title\n\nAlpha paragraph.\n\nBeta install steps.\n\n| Key | Value |\n| --- | --- |\n| token | abc |";
    const matchStart = documentContent.indexOf("Beta install steps.");
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/README.md",
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "search_document");

    const result = await tool?.execute("tool_search_document", {
      query: "install steps"
    });

    expect(toolText(result)).toContain("install steps");
    expect(result?.details).toEqual(expect.objectContaining({
      count: 1,
      matches: expect.arrayContaining([
        expect.objectContaining({
          from: matchStart,
          to: matchStart + "Beta install steps.".length
        })
      ])
    }));
  });

  it("rejects document searches with an empty normalized query", async () => {
    const tool = createDocumentAgentTools({
      documentContent: "# Current\n\nAlpha note.",
      documentEndPosition: 22,
      documentPath: "/vault/current.md",
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "search_document");

    await expect(tool?.execute("tool_search_document", {
      mode: "text",
      query: "   "
    })).rejects.toThrow("Cannot search document because the query is empty.");
  });

  it("rejects normalized-empty heading searches", async () => {
    const tool = createDocumentAgentTools({
      documentContent: "# Current\n\nAlpha note.",
      documentEndPosition: 22,
      documentPath: "/vault/current.md",
      headingAnchors: [
        { from: 0, level: 1, title: "Current", to: "# Current".length }
      ],
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "search_document");

    await expect(tool?.execute("tool_search_document", {
      mode: "heading",
      query: "!!!"
    })).rejects.toThrow("Cannot search document because the query is empty.");
  });

  it("locates the most appropriate region before insertion", async () => {
    const documentContent = "# Title\n\n## Section\n\nBody";
    const sectionHeading = "## Section";
    const sectionHeadingStart = documentContent.indexOf(sectionHeading);
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/README.md",
      headingAnchors: [
        { from: 0, level: 1, title: "Title", to: "# Title".length },
        { from: sectionHeadingStart, level: 2, title: "Section", to: sectionHeadingStart + sectionHeading.length }
      ],
      selection: {
        cursor: sectionHeadingStart + sectionHeading.length,
        from: sectionHeadingStart,
        source: "block",
        text: "Section",
        to: sectionHeadingStart + sectionHeading.length
      },
      workspaceFiles: []
    }).find((item) => item.name === "locate_content");

    const result = await tool?.execute("tool_locate_content", {
      goal: "Insert the follow-up section after Section"
    });

    expect(result?.details).toEqual(expect.objectContaining({
      anchorId: "heading:1",
      operation: "insert"
    }));
    expect(toolText(result)).toContain("Recommended anchor source:");
    expect(toolText(result)).toContain("## Section");
  });

  it("locates a Markdown table instead of the owning heading for table edits", async () => {
    const documentContent = [
      "### Section Alpha",
      "",
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (old-token) |",
      "",
      "### Section Beta",
      "",
      "Body"
    ].join("\n");
    const firstHeading = "### Section Alpha";
    const secondHeading = "### Section Beta";
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      headingAnchors: [
        { from: documentContent.indexOf(firstHeading), level: 3, title: "Section Alpha", to: documentContent.indexOf(firstHeading) + firstHeading.length },
        { from: documentContent.indexOf(secondHeading), level: 3, title: "Section Beta", to: documentContent.indexOf(secondHeading) + secondHeading.length }
      ],
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "locate_content");

    const result = await tool?.execute("tool_locate_content", {
      goal: "replace only the table under Section Alpha and change old-token to new-token",
      operation: "replace"
    });

    expect(result?.details).toEqual(expect.objectContaining({
      anchorId: "table:0"
    }));
    expect(toolText(result)).toContain("table:0");
    expect(toolText(result)).toContain("Recommended anchor source:");
    expect(toolText(result)).toContain("| Sync note | None | Needs source token (old-token) |");
  });

  it("uses enum schemas for bounded tool arguments", () => {
    const tools = createDocumentAgentTools({
      documentContent: "# Title",
      documentEndPosition: 7,
      documentPath: "/vault/README.md",
      selection: null,
      workspaceFiles: []
    });
    const insertContent = tools.find((item) => item.name === "insert_content");
    const locateContent = tools.find((item) => item.name === "locate_content");

    expect(insertContent?.parameters).toEqual(expect.objectContaining({
      properties: expect.objectContaining({
        placement: expect.objectContaining({
          anyOf: expect.arrayContaining([
            expect.objectContaining({ const: "after_anchor" }),
            expect.objectContaining({ const: "before_anchor" }),
            expect.objectContaining({ const: "cursor" })
          ])
        })
      })
    }));
    expect(locateContent?.parameters).toEqual(expect.objectContaining({
      properties: expect.objectContaining({
        operation: expect.objectContaining({
          anyOf: expect.arrayContaining([
            expect.objectContaining({ const: "delete" }),
            expect.objectContaining({ const: "insert" }),
            expect.objectContaining({ const: "replace" })
          ])
        }),
        targetKind: expect.objectContaining({
          anyOf: expect.arrayContaining([
            expect.objectContaining({ const: "region" }),
            expect.objectContaining({ const: "section" })
          ])
        })
      })
    }));
  });

  it("locates the most appropriate section by heading title", async () => {
    const documentContent = "# Intro\n\n## 10. Current\n\nBody\n\n## 11. Follow-ups\n\nMore body";
    const currentHeading = "## 10. Current";
    const followUpHeading = "## 11. Follow-ups";
    const currentHeadingStart = documentContent.indexOf(currentHeading);
    const followUpHeadingStart = documentContent.indexOf(followUpHeading);
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/README.md",
      headingAnchors: [
        { from: 0, level: 1, title: "Intro", to: "# Intro".length },
        { from: currentHeadingStart, level: 2, title: "10. Current", to: currentHeadingStart + currentHeading.length },
        { from: followUpHeadingStart, level: 2, title: "11. Follow-ups", to: followUpHeadingStart + followUpHeading.length }
      ],
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "locate_content");

    const result = await tool?.execute("tool_locate_content", {
      headingTitle: "11. Follow-ups",
      targetKind: "section"
    });

    expect(result?.details).toEqual(expect.objectContaining({
      anchorId: "section:2"
    }));
    expect(toolText(result)).toContain("Recommended section source:");
    expect(toolText(result)).toContain("## 11. Follow-ups");
    expect(toolText(result)).toContain("More body");
  });

  it("rejects delete requests when there is no editable selection or block", async () => {
    const tool = createDocumentAgentTools({
      documentContent: "",
      documentEndPosition: 0,
      documentPath: null,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "delete_content");

    await expect(tool?.execute("tool_delete_content", {})).rejects.toThrow(
      "Cannot delete because there is no active selection, current block, or structural anchor available."
    );
  });

  it("prepares an insertion preview after a resolved heading anchor", async () => {
    const onPreviewResult = vi.fn();
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\n## Section\n\nBody",
      documentEndPosition: 24,
      documentPath: "/vault/README.md",
      headingAnchors: [
        { from: 0, level: 1, title: "Title", to: 8 },
        { from: 10, level: 2, title: "Section", to: 21 }
      ],
      onPreviewResult,
      selection: {
        cursor: 2,
        from: 0,
        source: "block",
        text: "Title",
        to: 5
      },
      workspaceFiles: []
    }).find((item) => item.name === "insert_content");

    const result = await tool?.execute("tool_insert_content", {
      anchorId: "heading:1",
      content: "\n\n### Follow-up\n\nMore details.",
      placement: "after_anchor"
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 21,
      original: "",
      replacement: "\n\n### Follow-up\n\nMore details.",
      to: 21,
      type: "insert"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared an insertion preview at after_anchor (heading:1).");
  });

  it("prepares a cursor insertion at the end of the document when no editor selection is active", async () => {
    const onPreviewResult = vi.fn();
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\nBody",
      documentEndPosition: 14,
      documentPath: "/vault/README.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "insert_content");

    const result = await tool?.execute("tool_insert_content", {
      content: "\n\nContinue here.",
      placement: "cursor"
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 14,
      original: "",
      replacement: "\n\nContinue here.",
      to: 14,
      type: "insert"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared an insertion preview at cursor.");
  });

  it("rejects anchor-based insertion when the anchor is missing", async () => {
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\nBody",
      documentEndPosition: 14,
      documentPath: "/vault/README.md",
      headingAnchors: [{ from: 0, level: 1, title: "Title", to: 8 }],
      selection: {
        cursor: 2,
        from: 0,
        source: "block",
        text: "Title",
        to: 5
      },
      workspaceFiles: []
    }).find((item) => item.name === "insert_content");

    await expect(
      tool?.execute("tool_insert_content", {
        anchorId: "heading:99",
        content: "\n\nExtra section",
        placement: "after_anchor"
      })
    ).rejects.toThrow('Cannot insert because the anchor "heading:99" was not found.');
  });

  it("replaces a resolved region anchor", async () => {
    const onPreviewResult = vi.fn();
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\n## Section\n\nBody",
      documentEndPosition: 24,
      documentPath: "/vault/README.md",
      headingAnchors: [{ from: 10, level: 2, title: "Section", to: 21 }],
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    await tool?.execute("tool_replace_content", {
      anchorId: "heading:0",
      replacement: "## Better Section"
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 10,
      original: "Section",
      replacement: "## Better Section",
      to: 21,
      type: "replace"
    }, expect.any(String));
  });

  it("prepares a block replacement preview for the current editor block", async () => {
    const onPreviewResult = vi.fn();
    const tool = createDocumentAgentTools({
      documentContent: "# Title\n\nOld synthetic paragraph",
      documentEndPosition: 32,
      documentPath: "/vault/README.md",
      onPreviewResult,
      selection: {
        cursor: 12,
        from: 9,
        source: "block",
        text: "Old synthetic paragraph",
        to: 32
      },
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    expect(tool).toBeDefined();
    const result = await tool?.execute("tool_replace_content", {
      replacement: "New synthetic paragraph"
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 9,
      original: "Old synthetic paragraph",
      replacement: "New synthetic paragraph",
      target: {
        from: 9,
        id: "current-context",
        kind: "current_block",
        title: "Old synthetic paragraph",
        to: 32
      },
      to: 32,
      type: "replace"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared a block replacement preview");
  });

  it("prepares a block replacement for selected heading text", async () => {
    const onPreviewResult = vi.fn();
    const { context, firstHeading } = selectedAwsHeadingToolContext(onPreviewResult);
    const tool = createDocumentAgentTools(context).find((item) => item.name === "replace_content");

    const result = await tool?.execute("tool_replace_content", {
      targetKind: "block",
      replacement: "# LoginAWS"
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 0,
      original: "LoginAWS",
      replacement: "# LoginAWS",
      target: {
        from: 0,
        id: "current-context",
        kind: "current_block",
        title: "LoginAWS",
        to: firstHeading.length
      },
      to: firstHeading.length,
      type: "replace"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared a block replacement preview");
  });

  it("uses the selected heading block for the current-context anchor", async () => {
    const onPreviewResult = vi.fn();
    const { context, firstHeading } = selectedAwsHeadingToolContext(onPreviewResult);
    const tool = createDocumentAgentTools(context).find((item) => item.name === "replace_content");

    await tool?.execute("tool_replace_content", {
      anchorId: "current-context",
      replacement: "# LoginAWS"
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 0,
      original: "LoginAWS",
      replacement: "# LoginAWS",
      to: firstHeading.length,
      type: "replace"
    }, expect.any(String));
  });

  it("promotes selected heading text when replace_content receives block Markdown", async () => {
    const onPreviewResult = vi.fn();
    const { context, firstHeading } = selectedAwsHeadingToolContext(onPreviewResult);
    const tool = createDocumentAgentTools(context).find((item) => item.name === "replace_content");

    await tool?.execute("tool_replace_content", {
      replacement: "# LoginAWS"
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 0,
      original: "LoginAWS",
      replacement: "# LoginAWS",
      target: {
        from: 0,
        id: "current-context",
        kind: "current_block",
        title: "LoginAWS",
        to: firstHeading.length
      },
      to: firstHeading.length,
      type: "replace"
    }, expect.any(String));
  });

  it("rejects table anchors through block replacement", async () => {
    const table = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token |"
    ].join("\n");
    const tool = createDocumentAgentTools({
      documentContent: table,
      documentEndPosition: table.length,
      documentPath: "/vault/example.md",
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    await expect(tool?.execute("tool_replace_content", {
      anchorId: "table:0",
      replacement: "Synthetic paragraph",
      targetKind: "block"
    })).rejects.toThrow("Cannot replace a table anchor with targetKind=block. Use replace_content with targetKind=table.");
  });

  it("rejects inline selections through replace_content", async () => {
    const onPreviewResult = vi.fn();
    const tool = createDocumentAgentTools({
      documentContent: "Alpha beta gamma",
      documentEndPosition: 16,
      documentPath: "/vault/example.md",
      onPreviewResult,
      selection: {
        from: 7,
        source: "selection",
        text: "beta",
        to: 11
      },
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    await expect(tool?.execute("tool_replace_content", {
      targetKind: "block",
      replacement: "delta"
    })).rejects.toThrow("Cannot replace a block because the current editor context is an inline selection.");
    expect(onPreviewResult).not.toHaveBeenCalled();
  });

  it("prepares a replacement preview for a resolved Markdown table anchor", async () => {
    const onPreviewResult = vi.fn();
    const table = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (old-token) |"
    ].join("\n");
    const replacement = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (new-token) |"
    ].join("\n");
    const documentContent = ["### Section Alpha", "", table, "", "### Section Beta"].join("\n");
    const tableStart = documentContent.indexOf(table);
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      headingAnchors: [
        { from: 0, level: 3, title: "Section Alpha", to: "### Section Alpha".length },
        { from: documentContent.indexOf("### Section Beta"), level: 3, title: "Section Beta", to: documentContent.length }
      ],
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    await tool?.execute("tool_replace_content", {
      anchorId: "table:0",
      replacement
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: tableStart,
      original: table,
      replacement,
      target: {
        from: tableStart,
        id: "table:0",
        kind: "table",
        title: "Section Alpha table",
        to: tableStart + table.length
      },
      to: tableStart + table.length,
      type: "replace"
    }, expect.any(String));
  });

  it("prepares a table replacement preview with the dedicated table tool", async () => {
    const onPreviewResult = vi.fn();
    const table = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (old-token) |"
    ].join("\n");
    const replacement = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (new-token) |"
    ].join("\n");
    const documentContent = ["### Section Alpha", "", table, "", "### Section Beta"].join("\n");
    const tableStart = documentContent.indexOf(table);
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      headingAnchors: [
        { from: 0, level: 3, title: "Section Alpha", to: "### Section Alpha".length },
        { from: documentContent.indexOf("### Section Beta"), level: 3, title: "Section Beta", to: documentContent.length }
      ],
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    expect(tool).toBeDefined();
    const result = await tool?.execute("tool_replace_content", {
      anchorId: "table:0",
      replacement
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: tableStart,
      original: table,
      replacement,
      target: {
        from: tableStart,
        id: "table:0",
        kind: "table",
        title: "Section Alpha table",
        to: tableStart + table.length
      },
      to: tableStart + table.length,
      type: "replace"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared a table replacement preview");
  });

  it("prepares a table replacement preview by heading title without requiring an anchor id", async () => {
    const onPreviewResult = vi.fn();
    const table = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (old-token) |"
    ].join("\n");
    const replacement = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (new-token) |"
    ].join("\n");
    const documentContent = ["### Section Alpha", "", table, "", "### Section Beta"].join("\n");
    const tableStart = documentContent.indexOf(table);
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      headingAnchors: [
        { from: 0, level: 3, title: "Section Alpha", to: "### Section Alpha".length },
        { from: documentContent.indexOf("### Section Beta"), level: 3, title: "Section Beta", to: documentContent.length }
      ],
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    expect(tool).toBeDefined();
    const result = await tool?.execute("tool_replace_content", {
      headingTitle: "Section Alpha",
      replacement
    });

    expect(onPreviewResult).toHaveBeenCalledWith(expect.objectContaining({
      from: tableStart,
      original: table,
      replacement,
      target: expect.objectContaining({
        id: "table:0",
        kind: "table",
        title: "Section Alpha table"
      }),
      to: tableStart + table.length,
      type: "replace"
    }), expect.any(String));
    expect(toolText(result)).toContain("Prepared a table replacement preview for Section Alpha table");
  });

  it("prepares a block replacement preview by matching existing text", async () => {
    const onPreviewResult = vi.fn();
    const documentContent = "# Title\n\nAlpha paragraph.\n\nBeta paragraph.";
    const original = "Beta paragraph.";
    const from = documentContent.indexOf(original);
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    expect(tool).toBeDefined();
    const result = await tool?.execute("tool_replace_content", {
      originalText: original,
      replacement: "Gamma paragraph."
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from,
      original,
      replacement: "Gamma paragraph.",
      target: {
        from,
        id: "text-match",
        kind: "current_block",
        title: original,
        to: from + original.length
      },
      to: from + original.length,
      type: "replace"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared a block replacement preview for matched text.");
  });

  it("preserves surrounding whitespace when replacing exact original text", async () => {
    const onPreviewResult = vi.fn();
    const documentContent = "# Title\n\nAlpha [ key ] Beta";
    const original = " key ";
    const from = documentContent.indexOf(original);
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    const result = await tool?.execute("tool_replace_content", {
      originalText: original,
      replacement: "value"
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from,
      original,
      replacement: "value",
      target: {
        from,
        id: "text-match",
        kind: "current_block",
        title: "key",
        to: from + original.length
      },
      to: from + original.length,
      type: "replace"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared a block replacement preview for matched text.");
  });

  it("prepares a table replacement preview when the document has no headings", async () => {
    const onPreviewResult = vi.fn();
    const table = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (old-token) |"
    ].join("\n");
    const replacement = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (new-token) |"
    ].join("\n");
    const tool = createDocumentAgentTools({
      documentContent: table,
      documentEndPosition: table.length,
      documentPath: "/vault/example.md",
      headingAnchors: [],
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    await tool?.execute("tool_replace_content", {
      anchorId: "table:0",
      replacement
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 0,
      original: table,
      replacement,
      target: {
        from: 0,
        id: "table:0",
        kind: "table",
        title: "Table: Field / Variant One / Variant Two",
        to: table.length
      },
      to: table.length,
      type: "replace"
    }, expect.any(String));
  });

  it("uses provided editor table anchor positions for table replacement previews", async () => {
    const onPreviewResult = vi.fn();
    const table = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (old-token) |"
    ].join("\n");
    const replacement = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (new-token) |"
    ].join("\n");
    const documentContent = ["### Section Alpha", "", table, "", "Tail"].join("\n");
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: 200,
      documentPath: "/vault/example.md",
      headingAnchors: [],
      onPreviewResult,
      selection: null,
      tableAnchors: [
        {
          description: "Markdown table Section Alpha table: Field / Variant One / Variant Two",
          from: 42,
          id: "table:0",
          kind: "table",
          text: table,
          title: "Section Alpha table",
          to: 91
        }
      ],
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    await tool?.execute("tool_replace_content", {
      anchorId: "table:0",
      replacement
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 42,
      original: table,
      replacement,
      target: {
        from: 42,
        id: "table:0",
        kind: "table",
        title: "Section Alpha table",
        to: 91
      },
      to: 91,
      type: "replace"
    }, expect.any(String));
  });

  it("rejects Markdown table replacements through replace_content unless the target is a complete table anchor", async () => {
    const onPreviewResult = vi.fn();
    const tableReplacement = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (new-token) |"
    ].join("\n");
    const documentContent = ["### Section Alpha", "", "Synthetic paragraph"].join("\n");
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      headingAnchors: [
        { from: 0, level: 3, title: "Section Alpha", to: "### Section Alpha".length }
      ],
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    await expect(tool?.execute("tool_replace_content", {
      anchorId: "heading:0",
      replacement: tableReplacement
    })).rejects.toThrow(
      "Cannot replace this region with a Markdown table because the target is not a complete table anchor. Use replace_content with targetKind=table and a table anchor."
    );
    expect(onPreviewResult).not.toHaveBeenCalled();
  });

  it("rejects fenced Markdown table replacements through replace_content unless the target is a complete table anchor", async () => {
    const onPreviewResult = vi.fn();
    const tableReplacement = [
      "```markdown",
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (new-token) |",
      "```"
    ].join("\n");
    const documentContent = ["### Section Alpha", "", "Synthetic paragraph"].join("\n");
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      headingAnchors: [
        { from: 0, level: 3, title: "Section Alpha", to: "### Section Alpha".length }
      ],
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    await expect(tool?.execute("tool_replace_content", {
      anchorId: "heading:0",
      replacement: tableReplacement
    })).rejects.toThrow(
      "Cannot replace this region with a Markdown table because the target is not a complete table anchor. Use replace_content with targetKind=table and a table anchor."
    );
    expect(onPreviewResult).not.toHaveBeenCalled();
  });

  it("rejects block markdown replacements for inline selections", async () => {
    const onPreviewResult = vi.fn();
    const documentContent = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (old-token) |"
    ].join("\n");
    const selectedText = "old-token";
    const selectedFrom = documentContent.indexOf(selectedText);
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      onPreviewResult,
      selection: {
        from: selectedFrom,
        source: "selection",
        text: selectedText,
        to: selectedFrom + selectedText.length
      },
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    await expect(tool?.execute("tool_replace_content", {
      replacement: [
        "| Field | Variant One | Variant Two |",
        "| ----- | ----------- | ----------- |",
        "| Sync note | None | Needs source token |"
      ].join("\n")
    })).rejects.toThrow("Cannot replace an inline selection with block-level Markdown");
    expect(onPreviewResult).not.toHaveBeenCalled();
  });

  it("prepares a section deletion preview for a full section anchor", async () => {
    const onPreviewResult = vi.fn();
    const tool = createDocumentAgentTools({
      documentContent: "# Intro\n\n## 10. Current\n\nBody\n\n## 11. Follow-ups\n\nMore body",
      documentEndPosition: 61,
      documentPath: "/vault/README.md",
      headingAnchors: [
        { from: 0, level: 1, title: "Intro", to: 8 },
        { from: 9, level: 2, title: "10. Current", to: 23 },
        { from: 30, level: 2, title: "11. Follow-ups", to: 46 }
      ],
      onPreviewResult,
      selection: {
        cursor: 55,
        from: 49,
        source: "block",
        text: "More body",
        to: 58
      },
      workspaceFiles: []
    }).find((item) => item.name === "delete_content");

    await tool?.execute("tool_delete_content", {
      anchorId: "section:2"
    });

    expect(onPreviewResult).toHaveBeenCalledWith(expect.objectContaining({
      from: 30,
      replacement: "",
      to: 61,
      type: "replace"
    }), expect.any(String));
  });

  it("uses provided editor section anchor text and positions for section replacement previews", async () => {
    const onPreviewResult = vi.fn();
    const replacement = "## Section Alpha\n\nNew synthetic body";
    const sectionText = "Section Alpha\n\nOld synthetic body";
    const tool = createDocumentAgentTools({
      documentContent: "# Section Alpha\n\nOld synthetic body",
      documentEndPosition: 120,
      documentPath: "/vault/example.md",
      headingAnchors: [],
      onPreviewResult,
      sectionAnchors: [
        {
          description: "Section Section Alpha",
          from: 42,
          id: "section:0",
          kind: "section",
          text: sectionText,
          title: "Section Alpha",
          to: 91
        }
      ],
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "replace_content");

    await tool?.execute("tool_replace_content", {
      anchorId: "section:0",
      replacement
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 42,
      original: sectionText,
      replacement,
      to: 91,
      type: "replace"
    }, expect.any(String));
  });

  it("prepares a move preview without replacing the full document", async () => {
    const onPreviewResult = vi.fn();
    const documentContent = [
      "# Title",
      "",
      "Alpha paragraph.",
      "",
      "Gamma paragraph.",
      "",
      "Beta paragraph."
    ].join("\n");
    const from = documentContent.indexOf("Alpha paragraph.");
    const to = documentContent.indexOf("Beta paragraph.");
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "move_content");

    const result = await tool?.execute("tool_move_content", {
      destinationText: "Alpha paragraph.",
      placement: "before",
      sourceText: "Gamma paragraph.\n\n"
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from,
      original: "Alpha paragraph.\n\nGamma paragraph.\n\n",
      replacement: "Gamma paragraph.\n\nAlpha paragraph.\n\n",
      to,
      type: "replace"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared a move preview");
  });

  it("rejects moving content after itself", async () => {
    const onPreviewResult = vi.fn();
    const documentContent = "# Title\n\nAlpha paragraph.\n\nTail";
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "move_content");

    await expect(tool?.execute("tool_move_content", {
      destinationText: "Alpha paragraph.",
      placement: "after",
      sourceText: "Alpha paragraph."
    })).rejects.toThrow("Cannot move content because the requested move would not change the document.");
    expect(onPreviewResult).not.toHaveBeenCalled();
  });

  it("prepares a structured batch edit preview without accepting a whole-document replacement", async () => {
    const onPreviewResult = vi.fn();
    const documentContent = "# Title\n\nAlpha note.\n\nRemove me.\n\nTail";
    const from = documentContent.indexOf("Alpha note.");
    const to = documentContent.indexOf("\n\nTail");
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "batch_edit");

    const result = await tool?.execute("tool_batch_edit", {
      operations: [
        {
          exactText: "Alpha note.",
          replacement: "Beta note.",
          type: "replace"
        },
        {
          exactText: "\n\nRemove me.",
          type: "delete"
        }
      ]
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from,
      original: "Alpha note.\n\nRemove me.",
      replacement: "Beta note.",
      to,
      type: "replace"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared a batch edit preview with 2 operations");
  });

  it("preserves operation order for batch insertions at the same position", async () => {
    const onPreviewResult = vi.fn();
    const documentContent = "# Title\n\nTail";
    const position = documentContent.indexOf("Tail");
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "batch_edit");

    const result = await tool?.execute("tool_batch_edit", {
      operations: [
        {
          content: "First ",
          from: position,
          type: "insert"
        },
        {
          content: "Second ",
          from: position,
          type: "insert"
        }
      ]
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: position,
      original: "",
      replacement: "First Second ",
      to: position,
      type: "replace"
    }, expect.any(String));
    expect(toolText(result)).toContain("Prepared a batch edit preview with 2 operations");
  });

  it("rejects batch edit ranges outside the document", async () => {
    const onPreviewResult = vi.fn();
    const documentContent = "# Title\n\nTail";
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "batch_edit");

    await expect(tool?.execute("tool_batch_edit", {
      operations: [
        {
          from: documentContent.length + 1,
          replacement: "Replacement",
          to: documentContent.length + 2,
          type: "replace"
        }
      ]
    })).rejects.toThrow("Cannot resolve batch edit operation 1 because the range is outside the document.");
    expect(onPreviewResult).not.toHaveBeenCalled();
  });

  it("rejects batch insert positions outside the document", async () => {
    const onPreviewResult = vi.fn();
    const documentContent = "# Title\n\nTail";
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      onPreviewResult,
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "batch_edit");

    await expect(tool?.execute("tool_batch_edit", {
      operations: [
        {
          content: "Inserted",
          from: documentContent.length + 1,
          type: "insert"
        }
      ]
    })).rejects.toThrow("Cannot resolve batch insert operation 1 because the position is outside the document.");
    expect(onPreviewResult).not.toHaveBeenCalled();
  });

  it("validates Markdown structure issues in the current document", async () => {
    const documentContent = [
      "# Title",
      "",
      "## Duplicate",
      "",
      "Body",
      "",
      "## Duplicate",
      "",
      "| Key | Value |",
      "| --- |",
      "| token | abc |"
    ].join("\n");
    const tool = createDocumentAgentTools({
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      headingAnchors: [
        { from: 0, level: 1, title: "Title", to: "# Title".length },
        { from: documentContent.indexOf("## Duplicate"), level: 2, title: "Duplicate", to: documentContent.indexOf("## Duplicate") + "## Duplicate".length },
        { from: documentContent.lastIndexOf("## Duplicate"), level: 2, title: "Duplicate", to: documentContent.lastIndexOf("## Duplicate") + "## Duplicate".length }
      ],
      selection: null,
      workspaceFiles: []
    }).find((item) => item.name === "validate_edit");

    const result = await tool?.execute("tool_validate_edit", {});

    expect(toolText(result)).toContain("Duplicate heading");
    expect(toolText(result)).toContain("Markdown table row has 1 cells but expected 2");
    expect(result?.details).toEqual(expect.objectContaining({
      issueCount: 2
    }));
  });

  it("exposes the consolidated document tool surface", () => {
    const toolNames = createDocumentAgentTools({
      documentContent: "# Title",
      documentEndPosition: 7,
      documentPath: "/vault/README.md",
      selection: {
        from: 0,
        source: "selection",
        text: "# Title",
        to: 7
      },
      workspaceFiles: []
    }).map((tool) => tool.name);

    expect(toolNames).not.toContain("replace_selection");
    expect(toolNames).not.toContain("delete_selection");
    expect(toolNames).not.toContain("insert_after_selection");
    expect(toolNames).not.toContain("get_document");
    expect(toolNames).not.toContain("get_selection");
    expect(toolNames).not.toContain("get_document_outline");
    expect(toolNames).not.toContain("get_document_sections");
    expect(toolNames).not.toContain("get_available_anchors");
    expect(toolNames).not.toContain("locate_markdown_region");
    expect(toolNames).not.toContain("locate_section");
    expect(toolNames).not.toContain("list_workspace_files");
    expect(toolNames).not.toContain("read_context");
    expect(toolNames).not.toContain("read_workspace");
    expect(toolNames).not.toContain("list_images");
    expect(toolNames).not.toContain("view_image");
    expect(toolNames).not.toContain("replace_document");
    expect(toolNames).not.toContain("replace_block");
    expect(toolNames).not.toContain("replace_region");
    expect(toolNames).not.toContain("replace_table");
    expect(toolNames).not.toContain("replace_section");
    expect(toolNames).not.toContain("delete_region");
    expect(toolNames).not.toContain("delete_section");
    expect(toolNames).not.toContain("insert_markdown");
    expect(toolNames).not.toContain("replace_table_by_heading");
    expect(toolNames).not.toContain("replace_block_by_text");
    expect(toolNames).toEqual([
      "get_editor_context",
      "read_document",
      "inspect_document_structure",
      "search_document",
      "locate_content",
      "replace_content",
      "insert_content",
      "delete_content",
      "move_content",
      "batch_edit",
      "search_workspace",
      "read_workspace_file",
      "list_assets",
      "view_asset",
      "validate_edit"
    ]);
  });
});
