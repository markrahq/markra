import { Type } from "@earendil-works/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import { typedWebSearchArgs } from "./params";
import { toolErrorResult } from "./results";
import { formatWebSearchToolResult, runCherryStyleWebSearch } from "./web-search";

export class WebSearchToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedWebSearchArgs>> {
  protected readonly description = [
    "Search the web with the configured search provider.",
    "This tool returns readable passages and source URLs with citation numbers.",
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

    const { runWebSearch, searchParallel, settings, transport } = this.context.webSearch;
    const response = await (runWebSearch
      ? runWebSearch(params.query, settings)
      : runCherryStyleWebSearch(params.query, settings, transport, searchParallel));

    return {
      content: [
        {
          text: formatWebSearchToolResult(response),
          type: "text" as const
        }
      ],
      details: {
        count: response.results.length,
        providerId: settings.providerId,
        query: response.query,
        urls: response.results.map((result) => result.url)
      },
      terminate: false
    };
  }
}
