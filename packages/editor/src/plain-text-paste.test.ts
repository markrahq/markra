import { GFM, parser as markdownParser } from "@lezer/markdown";
import { describe, expect, it, vi } from "vitest";
import {
  dispatchPlainTextPaste,
  escapePlainTextMarkdown,
} from "./plain-text-paste.ts";

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

  it("keeps link references and footnote definitions visually literal", () => {
    const source = [
      "[mock-label]: https://example.test/reference",
      "",
      "[^mock-note]: Synthetic footnote",
      "",
      "See [^mock-note]",
    ].join("\n");

    const escaped = escapePlainTextMarkdown(source);

    expect(escaped).toBe([
      "[mock-label\\]\u2060: https\\://example.test/reference",
      "",
      "[\u2060^mock-note\\]\u2060: Synthetic footnote",
      "",
      "See [\u2060^mock-note\\]",
    ].join("\n"));
    expect(escaped).not.toContain("\\[");
    expect(escaped).not.toContain("[^");
    expect(gfmParser.parse(escaped).toString()).not.toMatch(
      /LinkReference|Link\(/u,
    );
  });

  it("keeps indented plain text out of code blocks", () => {
    const escaped = escapePlainTextMarkdown("    Synthetic indentation");

    expect(escaped).toBe("\u2060    Synthetic indentation");
    expect(gfmParser.parse(escaped).toString()).not.toContain("CodeBlock");
  });

  it("inserts plain text into a nested contenteditable selection", () => {
    const content = document.createElement("div");
    const table = document.createElement("table");
    const row = table.insertRow();
    const cell = row.insertCell();
    const input = vi.fn();
    content.className = "cm-content";
    content.setAttribute("contenteditable", "true");
    table.setAttribute("contenteditable", "true");
    cell.textContent = "Before";
    content.append(table);
    document.body.append(content);
    table.addEventListener("input", input);
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(dispatchPlainTextPaste(content, "PASTED")).toBe(true);

    expect(cell.textContent).toBe("BeforePASTED");
    expect(input).toHaveBeenCalledTimes(1);
  });

  it("keeps plain text raw inside nested source inputs", () => {
    const content = document.createElement("div");
    const input = document.createElement("input");
    const onInput = vi.fn();
    content.className = "cm-content";
    content.setAttribute("contenteditable", "true");
    input.value = "Before";
    input.setSelectionRange(input.value.length, input.value.length);
    content.append(input);
    document.body.append(content);
    input.addEventListener("input", onInput);

    expect(dispatchPlainTextPaste(input, "https://example.test/image.png"))
      .toBe(true);

    expect(input.value).toBe("Beforehttps://example.test/image.png");
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it("keeps cross-cell selections structurally intact", () => {
    const content = document.createElement("div");
    const table = document.createElement("table");
    const row = table.insertRow();
    const first = row.insertCell();
    const second = row.insertCell();
    content.className = "cm-content";
    content.setAttribute("contenteditable", "true");
    table.setAttribute("contenteditable", "true");
    first.textContent = "First";
    second.textContent = "Second";
    content.append(table);
    document.body.append(content);
    const range = document.createRange();
    range.setStart(first.firstChild!, first.textContent.length);
    range.setEnd(second.firstChild!, second.textContent.length);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(dispatchPlainTextPaste(content, "PASTED")).toBe(true);

    expect(table.rows).toHaveLength(1);
    expect(row.cells).toHaveLength(2);
    expect(first.textContent).toBe("FirstPASTED");
    expect(second.textContent).toBe("Second");
  });

  it("uses controlled line breaks for multiline nested paste", () => {
    const content = document.createElement("div");
    const table = document.createElement("table");
    const cell = table.insertRow().insertCell();
    content.className = "cm-content";
    content.setAttribute("contenteditable", "true");
    table.setAttribute("contenteditable", "true");
    cell.textContent = "Before";
    content.append(table);
    document.body.append(content);
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(dispatchPlainTextPaste(content, "Line one\nLine two")).toBe(true);

    expect(cell.textContent).toBe("BeforeLine oneLine two");
    expect(cell.querySelector('br[data-markra-source-break="true"]')).not.toBeNull();
  });
});
