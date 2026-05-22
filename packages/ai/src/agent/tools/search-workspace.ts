import { Type } from "@mariozechner/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import { typedSearchWorkspaceArgs } from "./params";
import { toolErrorResult } from "./results";
import { normalizeText } from "./text";
import { truncateWorkspaceFileContent } from "./workspace";

export class SearchWorkspaceToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedSearchWorkspaceArgs>> {
  protected readonly description = "Search nearby Markdown workspace files by filename, relative path, and readable content snippets when file reading is available.";
  protected readonly label = "Search workspace";
  protected readonly name = "search_workspace";
  protected readonly parameters = Type.Object({
    maxResults: Type.Optional(Type.Number({ maximum: 100, minimum: 1 })),
    query: Type.String({ minLength: 1 })
  });

  protected parseParams(params: unknown) {
    return typedSearchWorkspaceArgs(params);
  }

  protected async executeTool(_toolCallId: string, params: ReturnType<typeof typedSearchWorkspaceArgs>) {
    const query = normalizeText(params.query);
    if (!query) {
      return toolErrorResult("Cannot search workspace because the query is empty.");
    }

    const matches = [];

    for (const file of this.context.workspaceFiles) {
      const pathText = normalizeText(`${file.relativePath} ${file.name}`);
      let contentSnippet: string | undefined;
      let score = pathText.includes(query) ? 4 : 0;

      if (this.context.readWorkspaceFile) {
        try {
          const content = await this.context.readWorkspaceFile(file.path);
          const readableContent = truncateWorkspaceFileContent(content).text;
          if (normalizeText(readableContent).includes(query)) {
            score += 8;
            contentSnippet = snippetAround(readableContent, params.query);
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
                `Found ${limitedMatches.length} workspace match${limitedMatches.length === 1 ? "" : "es"} for "${params.query}":`,
                ...limitedMatches.map((match, index) => [
                  `${index + 1}. ${match.relativePath}`,
                  match.snippet
                ].filter(Boolean).join("\n"))
              ].join("\n")
            : `No workspace matches found for "${params.query}".`,
          type: "text" as const
        }
      ],
      details: {
        count: limitedMatches.length,
        matches: limitedMatches,
        query: params.query
      },
      terminate: false
    };
  }
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
