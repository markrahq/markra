import { pairInlineHtmlBoundaries, type InlineHtmlBoundaryNode } from "./inline-html";

function boundaries(sources: string[]) {
  let position = 1;

  return sources.map((source) => {
    const boundary = {
      from: position,
      source,
      to: position + 1
    } satisfies InlineHtmlBoundaryNode;
    position += 2;
    return boundary;
  });
}

describe("inline HTML pairing", () => {
  it("pairs nested inline tags while preserving opening source", () => {
    const ranges = pairInlineHtmlBoundaries(boundaries([
      '<span title="a > b">',
      "<sup>",
      "</sup>",
      "</span>"
    ]));

    expect(ranges).toMatchObject([
      { openSource: "<sup>", tagName: "sup" },
      { openSource: '<span title="a > b">', tagName: "span" }
    ]);
  });

  it("leaves mismatched inline HTML boundaries unpaired", () => {
    const ranges = pairInlineHtmlBoundaries(boundaries(["<sup>", "<em>", "</sup>", "</em>"]));

    expect(ranges).toEqual([]);
  });

  it("ignores void tags inside a balanced inline pair", () => {
    const ranges = pairInlineHtmlBoundaries(boundaries(["<span>", "<br>", "</span>"]));

    expect(ranges).toMatchObject([{ tagName: "span" }]);
  });
});
