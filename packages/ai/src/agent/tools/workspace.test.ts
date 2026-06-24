import type { AgentWorkspaceFile } from "../read-only-tools";
import { workspaceMarkdownFiles } from "./workspace";

describe("workspace files", () => {
  it("excludes attachment files from markdown workspace files", () => {
    const files = [
      { name: "current.md", path: "/vault/current.md", relativePath: "current.md" },
      {
        kind: "attachment",
        name: "export.md",
        path: "/vault/assets/export.md",
        relativePath: "assets/export.md"
      },
      { kind: "folder", name: "assets", path: "/vault/assets", relativePath: "assets" }
    ] satisfies AgentWorkspaceFile[];

    expect(workspaceMarkdownFiles(files)).toEqual([files[0]]);
  });
});
