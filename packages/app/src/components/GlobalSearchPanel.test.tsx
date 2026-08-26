import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

const fileNameResult = {
  file: {
    name: "alpha-guide.md",
    path: "/mock-vault/docs/alpha-guide.md",
    relativePath: "docs/alpha-guide.md"
  },
  id: "file-name:/mock-vault/docs/alpha-guide.md",
  kind: "fileName"
} satisfies WorkspaceSearchResult;

describe("GlobalSearchPanel", () => {
  it("renders file-name matches as openable results in the sidebar", () => {
    const openFile = vi.fn();
    render(
      <GlobalSearchPanel
        caseSensitive={false}
        language="en"
        loading={false}
        placement="sidebar"
        query="alpha"
        results={[fileNameResult]}
        searchedFileCount={1}
        truncated={false}
        unreadableFileCount={0}
        onCaseSensitiveChange={() => {}}
        onClose={() => {}}
        onOpenFile={openFile}
        onOpenResult={() => {}}
        onQueryChange={() => {}}
      />
    );

    const search = screen.getByRole("search", { name: "Search workspace" });
    const fileButton = within(search).getByRole("button", { name: "Open docs/alpha-guide.md" });

    expect(fileButton.querySelector("mark")).toHaveTextContent("alpha");
    expect(screen.queryByRole("dialog", { name: "Search workspace" })).not.toBeInTheDocument();

    fireEvent.click(fileButton);

    expect(openFile).toHaveBeenCalledWith(fileNameResult.file);
  });

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
        truncated={false}
        unreadableFileCount={0}
        onCaseSensitiveChange={() => {}}
        onClose={() => {}}
        onOpenFile={() => {}}
        onOpenResult={openResult}
        onQueryChange={() => {}}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Search workspace" });
    const results = within(dialog).getByRole("list", { name: "Search results" });

    expect(within(dialog).getByRole("searchbox", { name: "Search workspace" })).toHaveValue("alpha");
    expect(within(dialog).getByText("3 results")).toBeInTheDocument();

    const guideGroup = within(results).getByRole("group", { name: "docs/guide.md search results" });
    expect(within(guideGroup).getByRole("button", { name: "Collapse docs/guide.md search results" })).toBeInTheDocument();
    expect(within(guideGroup).getByText("2")).toBeInTheDocument();
    expect(within(guideGroup).getByText("guide.md")).toBeInTheDocument();
    expect(within(guideGroup).getByText("docs /")).toBeInTheDocument();
    expect(within(guideGroup).getByRole("button", { name: "Open docs/guide.md line 3" })).toHaveTextContent("First alpha note");
    expect(within(guideGroup).getByRole("button", { name: "Open docs/guide.md line 5" })).toHaveTextContent("Second alpha entry");

    const notesGroup = within(results).getByRole("group", { name: "notes.md search results" });
    expect(within(notesGroup).getByRole("button", { name: "Collapse notes.md search results" })).toBeInTheDocument();
    expect(within(notesGroup).getByText("1")).toBeInTheDocument();
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
        truncated={false}
        unreadableFileCount={0}
        onCaseSensitiveChange={() => {}}
        onClose={() => {}}
        onOpenFile={() => {}}
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

  it("highlights matching relative-path segments for file results", () => {
    const { container } = render(
      <GlobalSearchPanel
        caseSensitive={false}
        language="en"
        loading={false}
        query="docs"
        results={[{
          ...fileNameResult,
          file: {
            ...fileNameResult.file,
            name: "guide.md"
          }
        }]}
        searchedFileCount={1}
        truncated={false}
        unreadableFileCount={0}
        onCaseSensitiveChange={() => {}}
        onClose={() => {}}
        onOpenFile={() => {}}
        onOpenResult={() => {}}
        onQueryChange={() => {}}
      />
    );

    const directory = container.querySelector(".font-mono");

    expect(directory).toHaveTextContent("docs /");
    expect(directory?.querySelector("mark")).toHaveTextContent("docs");
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
        truncated={false}
        unreadableFileCount={0}
        onCaseSensitiveChange={setCaseSensitive}
        onClose={() => {}}
        onOpenFile={() => {}}
        onOpenResult={() => {}}
        onQueryChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Case sensitive" }));

    expect(setCaseSensitive).toHaveBeenCalledWith(true);
  });

  it("shows recent workspace searches before entering a query", () => {
    const selectRecentQuery = vi.fn();
    render(
      <GlobalSearchPanel
        caseSensitive={false}
        language="en"
        loading={false}
        query=""
        recentQueries={["alpha", "beta"]}
        results={[]}
        searchedFileCount={2}
        truncated={false}
        unreadableFileCount={0}
        onCaseSensitiveChange={() => {}}
        onClose={() => {}}
        onOpenFile={() => {}}
        onOpenResult={() => {}}
        onQueryChange={() => {}}
        onRecentQuerySelect={selectRecentQuery}
      />
    );

    const recentSearches = screen.getByRole("list", { name: "Recent searches" });

    fireEvent.click(within(recentSearches).getByRole("button", { name: "Search for beta" }));

    expect(selectRecentQuery).toHaveBeenCalledWith("beta");
    expect(screen.queryByText("Type to search")).not.toBeInTheDocument();
  });

  it("shows when workspace search results are truncated", () => {
    render(
      <GlobalSearchPanel
        caseSensitive={false}
        language="en"
        loading={false}
        query="alpha"
        results={[result]}
        searchedFileCount={1}
        truncated={true}
        unreadableFileCount={0}
        onCaseSensitiveChange={() => {}}
        onClose={() => {}}
        onOpenFile={() => {}}
        onOpenResult={() => {}}
        onQueryChange={() => {}}
      />
    );

    expect(screen.getByText("First 1 results")).toBeInTheDocument();
  });

  it("resets expanded file previews when the query changes", () => {
    const results = Array.from({ length: 5 }, (_, index) => ({
      ...result,
      id: `/mock-vault/guide.md:${index}`,
      lineNumber: index + 1,
      matchIndex: index,
      snippet: `alpha result ${index + 1}`
    })) satisfies WorkspaceSearchResult[];
    const props = {
      caseSensitive: false,
      language: "en" as const,
      loading: false,
      results,
      searchedFileCount: 1,
      truncated: false,
      unreadableFileCount: 0,
      onCaseSensitiveChange: () => {},
      onClose: () => {},
      onOpenFile: () => {},
      onOpenResult: () => {},
      onQueryChange: () => {}
    };
    const { rerender } = render(<GlobalSearchPanel {...props} query="alpha" />);

    expect(screen.queryByRole("button", { name: "Open docs/guide.md line 5" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "show 1 more match" }));
    expect(screen.getByRole("button", { name: "Open docs/guide.md line 5" })).toBeInTheDocument();

    rerender(<GlobalSearchPanel {...props} query="beta" />);

    expect(screen.queryByRole("button", { name: "Open docs/guide.md line 5" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "show 1 more match" })).toBeInTheDocument();
  });

  it("virtualizes large result groups instead of rendering every group", async () => {
    vi.useFakeTimers();

    try {
      const manyResults = Array.from({ length: 80 }, (_, index) => ({
        ...result,
        file: {
          name: `note-${index}.md`,
          path: `/mock-vault/note-${index}.md`,
          relativePath: `note-${index}.md`
        },
        id: `/mock-vault/note-${index}.md:0`
      })) satisfies WorkspaceSearchResult[];

      render(
        <GlobalSearchPanel
          caseSensitive={false}
          language="en"
          loading={false}
          query="alpha"
          results={manyResults}
          searchedFileCount={80}
          truncated={false}
          unreadableFileCount={0}
          onCaseSensitiveChange={() => {}}
          onClose={() => {}}
          onOpenFile={() => {}}
          onOpenResult={() => {}}
          onQueryChange={() => {}}
        />
      );

      expect(screen.getByText("note-0.md")).toBeInTheDocument();

      await act(async () => {
        vi.runAllTimers();
      });

      expect(screen.queryByText("note-79.md")).not.toBeInTheDocument();
      expect(screen.getAllByRole("group", { name: /search results$/u }).length).toBeLessThan(40);
    } finally {
      vi.useRealTimers();
    }
  });
});
