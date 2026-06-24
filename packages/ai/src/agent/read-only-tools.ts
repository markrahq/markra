export type AgentWorkspaceFile = {
  kind?: "asset" | "attachment" | "folder";
  name: string;
  path: string;
  relativePath: string;
};

export type ReadOnlyAgentToolContext = {
  documentContent: string;
  documentPath: string | null;
  workspaceFiles: AgentWorkspaceFile[];
};

export type AgentToolResult = {
  content: string;
  name: "current_document" | "workspace_markdown_files";
};

const maxCurrentDocumentChars = 8_000;
const maxWorkspaceFileCount = 120;

export async function runReadOnlyAgentTools(context: ReadOnlyAgentToolContext): Promise<AgentToolResult[]> {
  return [
    {
      content: currentDocumentToolContent(context),
      name: "current_document"
    },
    {
      content: workspaceMarkdownFilesToolContent(context.workspaceFiles, context.documentPath),
      name: "workspace_markdown_files"
    }
  ];
}

function currentDocumentToolContent(context: ReadOnlyAgentToolContext) {
  return [
    `Path: ${context.documentPath ?? "Untitled"}`,
    "Content:",
    truncateAgentToolContent(context.documentContent, maxCurrentDocumentChars)
  ].join("\n");
}

function workspaceMarkdownFilesToolContent(files: AgentWorkspaceFile[], currentPath: string | null) {
  if (files.length === 0) return "No workspace Markdown files are available.";

  const visibleFiles = files.slice(0, maxWorkspaceFileCount);
  const lines = visibleFiles.map((file) => {
    const marker = currentPath && file.path === currentPath ? " (current)" : "";
    return `- ${file.relativePath || file.name}${marker}`;
  });

  if (files.length > visibleFiles.length) {
    lines.push(`- ... truncated ${files.length - visibleFiles.length} more files`);
  }

  return lines.join("\n");
}

function truncateAgentToolContent(content: string, maxChars: number) {
  if (content.length <= maxChars) return content;

  return `${content.slice(0, maxChars)}\n\n[truncated ${content.length - maxChars} more characters]`;
}
