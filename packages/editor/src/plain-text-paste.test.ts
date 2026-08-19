import { GFM, parser as markdownParser } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { escapePlainTextMarkdown } from "./plain-text-paste.ts";

const gfmParser = markdownParser.configure([GFM]);

describe("escapePlainTextMarkdown", () => {
  it("keeps Markdown-looking plain text visually literal", () => {
    const source = [
      "### Mock heading",
      "",
      "**Mock bold**",
      "",
      "- Mock item",
      "",
      "> Mock quote",
      "",
      "`mock code`",
    ].join("\n");

    const escaped = escapePlainTextMarkdown(source);

    expect(escaped).toBe([
      "\\#\\#\\# Mock heading",
      "",
      "\\*\\*Mock bold\\*\\*",
      "",
      "\\- Mock item",
      "",
      "\\> Mock quote",
      "",
      "\\`mock code\\`",
    ].join("\n"));
    const tree = gfmParser.parse(escaped).toString();
    expect(tree).not.toMatch(
      /ATXHeading|Blockquote|BulletList|InlineCode|StrongEmphasis/u,
    );
  });
});
