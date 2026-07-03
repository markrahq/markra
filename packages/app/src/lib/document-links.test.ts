import {
  documentLinkCompletionFiles,
  markdownDocumentLinkForFile,
  resolveMarkdownDocumentLinkFile,
  resolveMarkdownDocumentLinkPath
} from "./document-links";

const workspaceFiles = [
  { name: "index.md", path: "/mock-files/vault/index.md", relativePath: "index.md" },
  { name: "Guide Notes.md", path: "/mock-files/vault/docs/Guide Notes.md", relativePath: "docs/Guide Notes.md" },
  { name: "Roadmap.markdown", path: "/mock-files/vault/Roadmap.markdown", relativePath: "Roadmap.markdown" },
  { kind: "asset" as const, name: "cover.png", path: "/mock-files/vault/cover.png", relativePath: "cover.png" },
  { kind: "folder" as const, name: "docs", path: "/mock-files/vault/docs", relativePath: "docs" }
];

describe("document links", () => {
  it("builds portable markdown links relative to the current document", () => {
    expect(markdownDocumentLinkForFile(workspaceFiles[1]!, "/mock-files/vault/index.md")).toBe(
      "[Guide Notes](./docs/Guide%20Notes.md)"
    );
    expect(markdownDocumentLinkForFile(workspaceFiles[2]!, "/mock-files/vault/docs/current.md")).toBe(
      "[Roadmap](../Roadmap.markdown)"
    );
  });

  it("filters completion candidates to markdown documents", () => {
    expect(documentLinkCompletionFiles(workspaceFiles, "guide", "/mock-files/vault/index.md")).toEqual([
      workspaceFiles[1]
    ]);
    expect(documentLinkCompletionFiles(workspaceFiles, "", "/mock-files/vault/index.md")).toEqual([
      workspaceFiles[1],
      workspaceFiles[2]
    ]);
  });

  it("resolves relative markdown links to workspace files", () => {
    expect(resolveMarkdownDocumentLinkFile("./docs/Guide%20Notes.md", "/mock-files/vault/index.md", workspaceFiles)).toBe(
      workspaceFiles[1]
    );
    expect(resolveMarkdownDocumentLinkFile("../Roadmap.markdown", "/mock-files/vault/docs/current.md", workspaceFiles)).toBe(
      workspaceFiles[2]
    );
    expect(resolveMarkdownDocumentLinkFile("https://example.com", "/mock-files/vault/index.md", workspaceFiles)).toBeNull();
  });

  it("resolves local markdown link paths without requiring the file tree entry", () => {
    expect(resolveMarkdownDocumentLinkPath("./docs/Guide%20Notes.md", "/mock-files/vault/index.md")).toBe(
      "/mock-files/vault/docs/Guide Notes.md"
    );
    expect(resolveMarkdownDocumentLinkPath("../Roadmap.markdown#plan", "/mock-files/vault/docs/current.md")).toBe(
      "/mock-files/vault/Roadmap.markdown"
    );
    expect(resolveMarkdownDocumentLinkPath("https://example.com/guide.md", "/mock-files/vault/index.md")).toBeNull();
  });
});
