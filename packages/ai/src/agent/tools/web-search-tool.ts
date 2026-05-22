import { Type } from "@mariozechner/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import { typedWebSearchArgs } from "./params";
import { toolErrorResult } from "./results";
import { formatWebSearchToolResult, runCherryStyleWebSearch } from "./web-search";

export class WebSearchToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedWebSearchArgs>> {
  protected readonly description = [
    "Search the web with the configured Cherry-style search provider.",
    "This tool searches first, fetches readable page content for the best results, and returns source URLs with citation numbers.",
    "Use it only when the user's request needs current or external web information."
  ].join(" ");
  protected readonly label = "Web search";
  protected readonly name = "web_search";
  protected readonly parameters = Type.Object({
    query: Type.String({ minLength: 1 })
  });

  protected parseParams(params: unknown) {
    return typedWebSearchArgs(params);
  }

  protected async executeTool(_toolCallId: string, params: ReturnType<typeof typedWebSearchArgs>) {
    if (!this.context.webSearch) {
      return toolErrorResult("Web search is unavailable in this session.");
    }

    const search = this.context.webSearch.runWebSearch ?? ((query, settings) =>
      runCherryStyleWebSearch(query, settings, this.context.webSearch?.transport));
    const response = await search(params.query, this.context.webSearch.settings);

    return {
      content: [
        {
          text: formatWebSearchToolResult(response),
          type: "text" as const
        }
      ],
      details: {
        count: response.results.length,
        providerId: this.context.webSearch.settings.providerId,
        query: response.query,
        urls: response.results.map((result) => result.url)
      },
      terminate: false
    };
  }
}
