import { Type } from "@earendil-works/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import { typedSearchWorkspaceArgs } from "./params";
import { normalizeText } from "./text";
import { truncateWorkspaceFileContent, workspaceMarkdownFiles } from "./workspace";

export class SearchWorkspaceToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedSearchWorkspaceArgs>> {
  protected readonly description = "Inspect nearby Markdown workspace files. Omit query to list files, or pass query to search filenames, relative paths, and readable content snippets when file reading is available.";
  protected readonly label = "Search workspace";
  protected readonly name = "search_workspace";
  protected readonly parameters = Type.Object({
    maxResults: Type.Optional(Type.Number({ maximum: 100, minimum: 1 })),
    query: Type.Optional(Type.String())
  });

  protected parseParams(params: unknown) {
    return typedSearchWorkspaceArgs(params);
  }

  protected async executeTool(_toolCallId: string, params: ReturnType<typeof typedSearchWorkspaceArgs>) {
    const rawQuery = params.query ?? "";
    const query = normalizeText(rawQuery);
    if (!query) return listWorkspaceMarkdownFiles(workspaceMarkdownFiles(this.context.workspaceFiles), params.maxResults);

    const matches = [];

    for (const file of workspaceMarkdownFiles(this.context.workspaceFiles)) {
      const pathText = normalizeText(`${file.relativePath} ${file.name}`);
      let contentSnippet: string | undefined;
      let score = pathText.includes(query) ? 4 : 0;

      if (this.context.readWorkspaceFile) {
        try {
          const content = await this.context.readWorkspaceFile(file.path);
          const readableContent = truncateWorkspaceFileContent(content).text;
          if (normalizeText(readableContent).includes(query)) {
            score += 8;
            contentSnippet = snippetAround(readableContent, rawQuery);
          }
        } catch {
          // Ignore unreadable workspace files during search; read_workspace_file reports exact read errors.
        }
      }

      if (score > 0) {
        matches.push({
          name: file.name,
          path: file.path,
          relativePath: file.relativePath,
          score,
          snippet: contentSnippet
        });
      }
    }

    matches.sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath));
    const limitedMatches = matches.slice(0, params.maxResults ?? 20);

    return {
      content: [
        {
          text: limitedMatches.length
            ? [
                `Found ${limitedMatches.length} workspace match${limitedMatches.length === 1 ? "" : "es"} for "${rawQuery}":`,
                ...limitedMatches.map((match, index) => [
                  `${index + 1}. ${match.relativePath}`,
                  match.snippet
                ].filter(Boolean).join("\n"))
              ].join("\n")
            : `No workspace matches found for "${rawQuery}".`,
          type: "text" as const
        }
      ],
      details: {
        count: limitedMatches.length,
        matches: limitedMatches,
        query: rawQuery
      },
      terminate: false
    };
  }
}

function listWorkspaceMarkdownFiles(
  files: ReturnType<typeof workspaceMarkdownFiles>,
  maxResults: number | undefined
) {
  const sortedFiles = [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const limitedFiles = sortedFiles.slice(0, maxResults ?? 50);

  return {
    content: [
      {
        text: limitedFiles.length
          ? [
              `Workspace has ${limitedFiles.length} Markdown file${limitedFiles.length === 1 ? "" : "s"}:`,
              ...limitedFiles.map((file, index) => `${index + 1}. ${file.relativePath}`)
            ].join("\n")
          : "No Markdown workspace files are available.",
        type: "text" as const
      }
    ],
    details: {
      count: limitedFiles.length,
      files: limitedFiles.map((file) => ({
        name: file.name,
        path: file.path,
        relativePath: file.relativePath
      })),
      query: ""
    },
    terminate: false
  };
}

function snippetAround(content: string, query: string) {
  const normalizedContent = content.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const index = normalizedContent.indexOf(normalizedQuery);
  if (index < 0) return content.slice(0, 160).trim();

  const from = Math.max(0, index - 60);
  const to = Math.min(content.length, index + query.length + 100);

  return content.slice(from, to).trim();
}
