import { Type } from "@mariozechner/pi-ai";
import { documentTableAnchors } from "./anchors";
import { DocumentAgentToolFactory } from "./base";
import { typedSearchDocumentArgs } from "./params";
import { toolErrorResult } from "./results";
import { normalizeText, sliceDocumentText } from "./text";

export class SearchDocumentToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedSearchDocumentArgs>> {
  protected readonly description = "Search the current Markdown document by exact text, regex, heading title, or table content.";
  protected readonly label = "Search document";
  protected readonly name = "search_document";
  protected readonly parameters = Type.Object({
    caseSensitive: Type.Optional(Type.Boolean()),
    maxResults: Type.Optional(Type.Number({ maximum: 50, minimum: 1 })),
    mode: Type.Optional(Type.Union([
      Type.Literal("heading"),
      Type.Literal("regex"),
      Type.Literal("table"),
      Type.Literal("text")
    ])),
    query: Type.String({ minLength: 1 })
  });

  protected parseParams(params: unknown) {
    return typedSearchDocumentArgs(params);
  }

  protected executeTool(_toolCallId: string, params: ReturnType<typeof typedSearchDocumentArgs>) {
    if (!params.query) {
      return toolErrorResult("Cannot search document because the query is empty.");
    }

    const matches = this.findMatches(params).slice(0, params.maxResults ?? 20);

    return {
      content: [
        {
          text: matches.length
            ? [
                `Found ${matches.length} document match${matches.length === 1 ? "" : "es"} for "${params.query}":`,
                ...matches.map((match, index) => [
                  `${index + 1}. ${match.kind} ${match.anchorId ?? ""} (${match.from}-${match.to})`,
                  match.snippet
                ].filter(Boolean).join("\n"))
              ].join("\n")
            : `No document matches found for "${params.query}".`,
          type: "text" as const
        }
      ],
      details: {
        count: matches.length,
        matches,
        mode: params.mode,
        query: params.query
      },
      terminate: false
    };
  }

  private findMatches(params: ReturnType<typeof typedSearchDocumentArgs>) {
    if (params.mode === "heading") return this.findHeadingMatches(params);
    if (params.mode === "table") return this.findTableMatches(params);
    if (params.mode === "regex") return this.findRegexMatches(params);

    return this.findTextMatches(params);
  }

  private findHeadingMatches(params: ReturnType<typeof typedSearchDocumentArgs>) {
    const query = normalizeComparable(params.query, params.caseSensitive);
    if (!query) return toolErrorResult("Cannot search document because the query is empty.");

    return (this.context.headingAnchors ?? [])
      .map((heading, index) => ({
        anchorId: `heading:${index}`,
        from: heading.from,
        kind: "heading",
        snippet: `${"#".repeat(Math.max(1, heading.level))} ${heading.title}`,
        text: normalizeComparable(heading.title, params.caseSensitive),
        to: heading.to
      }))
      .filter((heading) => heading.text.includes(query))
      .map(({ text: _text, ...heading }) => heading);
  }

  private findTableMatches(params: ReturnType<typeof typedSearchDocumentArgs>) {
    const query = normalizeComparable(params.query, params.caseSensitive);
    if (!query) return toolErrorResult("Cannot search document because the query is empty.");

    return documentTableAnchors(this.context)
      .filter((table) => normalizeComparable(table.text ?? "", params.caseSensitive).includes(query))
      .map((table) => ({
        anchorId: table.id,
        from: table.from,
        kind: "table",
        snippet: summarizeSnippet(table.text ?? "", params.query),
        to: table.to
      }));
  }

  private findRegexMatches(params: ReturnType<typeof typedSearchDocumentArgs>) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(params.query, params.caseSensitive ? "gu" : "giu");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid regular expression.";
      return toolErrorResult(`Cannot search document with that regular expression: ${message}`);
    }

    return collectPatternMatches(this.context.documentContent, pattern, "regex", params.query);
  }

  private findTextMatches(params: ReturnType<typeof typedSearchDocumentArgs>) {
    const escaped = escapeRegExp(params.query);
    const pattern = new RegExp(escaped, params.caseSensitive ? "gu" : "giu");

    return collectPatternMatches(this.context.documentContent, pattern, "text", params.query);
  }
}

function collectPatternMatches(content: string, pattern: RegExp, kind: string, query: string) {
  const matches: Array<{ anchorId?: string; from: number; kind: string; snippet: string; to: number }> = [];
  let match: RegExpExecArray | null = pattern.exec(content);

  while (match) {
    const text = match[0] ?? "";
    const block = containingBlock(content, match.index, match.index + text.length);
    matches.push({
      from: block.from,
      kind,
      snippet: summarizeSnippet(sliceDocumentText(content, block.from, block.to), query),
      to: block.to
    });
    if (text.length === 0) pattern.lastIndex += 1;
    match = pattern.exec(content);
  }

  return matches;
}

function containingBlock(content: string, from: number, to: number) {
  const blockStart = content.lastIndexOf("\n\n", from);
  const blockEnd = content.indexOf("\n\n", to);

  return {
    from: blockStart >= 0 ? blockStart + 2 : 0,
    to: blockEnd >= 0 ? blockEnd : content.length
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizeComparable(value: string, caseSensitive: boolean | undefined) {
  return caseSensitive ? value : normalizeText(value);
}

function summarizeSnippet(text: string, query: string) {
  const trimmed = text.trim();
  if (trimmed) return trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed;

  return query;
}
