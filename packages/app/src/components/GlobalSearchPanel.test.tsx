import { fireEvent, render, screen, within } from "@testing-library/react";
import { GlobalSearchPanel } from "./GlobalSearchPanel";
import type { WorkspaceSearchResult } from "../lib/workspace-search";

const result = {
  columnNumber: 7,
  file: {
    name: "guide.md",
    path: "/mock-vault/guide.md",
    relativePath: "docs/guide.md"
  },
  id: "/mock-vault/guide.md:0",
  lineNumber: 3,
  lineText: "First alpha note",
  match: { from: 6, to: 11 },
  matchIndex: 0,
  snippet: "First alpha note"
} satisfies WorkspaceSearchResult;

const secondResult = {
  columnNumber: 12,
  file: result.file,
  id: "/mock-vault/guide.md:24",
  lineNumber: 5,
  lineText: "Second alpha entry",
  match: { from: 37, to: 42 },
  matchIndex: 1,
  snippet: "Second alpha entry"
} satisfies WorkspaceSearchResult;

const otherFileResult = {
  columnNumber: 1,
  file: {
    name: "notes.md",
    path: "/mock-vault/notes.md",
    relativePath: "notes.md"
  },
  id: "/mock-vault/notes.md:0",
  lineNumber: 1,
  lineText: "alpha in root",
  match: { from: 0, to: 5 },
  matchIndex: 0,
  snippet: "alpha in root"
} satisfies WorkspaceSearchResult;

describe("GlobalSearchPanel", () => {
  it("groups workspace search results by file and opens a selected match", () => {
    const openResult = vi.fn();
    render(
      <GlobalSearchPanel
        caseSensitive={false}
        language="en"
        loading={false}
        query="alpha"
        results={[result, secondResult, otherFileResult]}
        searchedFileCount={2}
        unreadableFileCount={0}
        onCaseSensitiveChange={() => {}}
        onClose={() => {}}
        onOpenResult={openResult}
        onQueryChange={() => {}}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Search workspace" });
    const results = within(dialog).getByRole("list", { name: "Search results" });

    expect(within(dialog).getByRole("searchbox", { name: "Search workspace" })).toHaveValue("alpha");
    expect(within(dialog).getByText("3 results")).toBeInTheDocument();

    const guideGroup = within(results).getByRole("group", { name: "docs/guide.md search results" });
    expect(within(guideGroup).getByRole("button", { name: "Collapse docs/guide.md search results" })).toHaveTextContent("2");
    expect(within(guideGroup).getByText("guide.md")).toBeInTheDocument();
    expect(within(guideGroup).getByText("docs /")).toBeInTheDocument();
    expect(within(guideGroup).getByRole("button", { name: "Open docs/guide.md line 3" })).toHaveTextContent("First alpha note");
    expect(within(guideGroup).getByRole("button", { name: "Open docs/guide.md line 5" })).toHaveTextContent("Second alpha entry");

    const notesGroup = within(results).getByRole("group", { name: "notes.md search results" });
    expect(within(notesGroup).getByRole("button", { name: "Collapse notes.md search results" })).toHaveTextContent("1");
    expect(within(notesGroup).queryByText("/")).not.toBeInTheDocument();

    fireEvent.click(within(guideGroup).getByRole("button", { name: "Open docs/guide.md line 3" }));

    expect(openResult).toHaveBeenCalledWith(result);
  });

  it("highlights matching text in search result snippets", () => {
    render(
      <GlobalSearchPanel
        caseSensitive={false}
        language="en"
        loading={false}
        query="alpha"
        results={[result]}
        searchedFileCount={1}
        unreadableFileCount={0}
        onCaseSensitiveChange={() => {}}
        onClose={() => {}}
        onOpenResult={() => {}}
        onQueryChange={() => {}}
      />
    );

    const snippet = within(screen.getByRole("button", { name: "Open docs/guide.md line 3" }))
      .getByText((_, element) => element?.tagName.toLowerCase() === "span" && element.textContent === "First alpha note");
    const highlight = snippet.querySelector("mark");

    expect(highlight).toHaveTextContent("alpha");
    expect(highlight).toHaveClass("global-search-match");
  });

  it("toggles case-sensitive search", () => {
    const setCaseSensitive = vi.fn();
    render(
      <GlobalSearchPanel
        caseSensitive={false}
        language="en"
        loading={false}
        query=""
        results={[]}
        searchedFileCount={0}
        unreadableFileCount={0}
        onCaseSensitiveChange={setCaseSensitive}
        onClose={() => {}}
        onOpenResult={() => {}}
        onQueryChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Case sensitive" }));

    expect(setCaseSensitive).toHaveBeenCalledWith(true);
  });
});
