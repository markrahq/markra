import { Type } from "@mariozechner/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import { typedValidateEditArgs } from "./params";
import {
  getMarkdownLines,
  looksLikeTableRow,
  splitTableCells
} from "./text";

export class ValidateEditToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedValidateEditArgs>> {
  protected readonly description = "Validate Markdown structure for issues such as duplicate headings, malformed tables, and frontmatter boundaries.";
  protected readonly label = "Validate edit";
  protected readonly name = "validate_edit";
  protected readonly parameters = Type.Object({
    content: Type.Optional(Type.String())
  });

  protected parseParams(params: unknown) {
    return typedValidateEditArgs(params);
  }

  protected executeTool(_toolCallId: string, params: ReturnType<typeof typedValidateEditArgs>) {
    const content = params.content ?? this.context.documentContent;
    const issues = [
      ...duplicateHeadingIssues(content),
      ...tableIssues(content),
      ...frontmatterIssues(content)
    ];

    return {
      content: [
        {
          text: issues.length
            ? [
                `Found ${issues.length} Markdown validation issue${issues.length === 1 ? "" : "s"}:`,
                ...issues.map((issue, index) => `${index + 1}. ${issue.message}`)
              ].join("\n")
            : "No Markdown validation issues found.",
          type: "text" as const
        }
      ],
      details: {
        issueCount: issues.length,
        issues
      },
      terminate: false
    };
  }
}

function duplicateHeadingIssues(content: string) {
  const seen = new Map<string, { line: number; title: string }>();
  const issues: Array<{ line: number; message: string; type: string }> = [];

  getMarkdownLines(content).forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line.text.trim());
    if (!match) return;

    const title = match[2] ?? "";
    const key = title.toLowerCase();
    const previous = seen.get(key);
    if (previous) {
      issues.push({
        line: index + 1,
        message: `Duplicate heading "${title}" also appears on line ${previous.line}.`,
        type: "duplicate_heading"
      });
      return;
    }

    seen.set(key, {
      line: index + 1,
      title
    });
  });

  return issues;
}

function tableIssues(content: string) {
  const lines = getMarkdownLines(content);
  const issues: Array<{ line: number; message: string; type: string }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!looksLikeTableRow(line.text)) continue;

    const expectedCells = splitTableCells(line.text).length;
    let rowIndex = index + 1;
    let reported = false;
    while (rowIndex < lines.length && looksLikeTableRow(lines[rowIndex]!.text)) {
      const cellCount = splitTableCells(lines[rowIndex]!.text).length;
      if (!reported && cellCount !== expectedCells) {
        issues.push({
          line: rowIndex + 1,
          message: `Markdown table row has ${cellCount} cells but expected ${expectedCells}.`,
          type: "malformed_table"
        });
        reported = true;
      }
      rowIndex += 1;
    }
    index = Math.max(index, rowIndex - 1);
  }

  return issues;
}

function frontmatterIssues(content: string) {
  if (!content.startsWith("---")) return [];

  const closingIndex = content.indexOf("\n---", 3);
  if (closingIndex >= 0) return [];

  return [
    {
      line: 1,
      message: "Frontmatter starts with --- but has no closing --- boundary.",
      type: "frontmatter"
    }
  ];
}
