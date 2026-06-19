import { act, renderHook } from "@testing-library/react";
import { useDocumentSearchState } from "./useDocumentSearchState";

describe("useDocumentSearchState", () => {
  type SearchSurface = "source" | "visual";

  it("opens search or replace only while document search is available", () => {
    const { result, rerender } = renderHook(
      ({ available }) => useDocumentSearchState({
        available,
        sourceContent: "alpha beta alpha",
        surface: "source"
      }),
      { initialProps: { available: false } }
    );

    act(() => result.current.openSearch());
    expect(result.current.open).toBe(false);

    rerender({ available: true });
    act(() => result.current.openReplace());
    expect(result.current.open).toBe(true);
    expect(result.current.replaceOpen).toBe(true);

    rerender({ available: false });
    expect(result.current.open).toBe(false);
    expect(result.current.replaceOpen).toBe(false);
  });

  it("tracks query and case sensitivity while resetting the active match", () => {
    const { result } = renderHook(() => useDocumentSearchState({
      available: true,
      sourceContent: "Markra markra MARKRA",
      surface: "source"
    }));

    act(() => {
      result.current.openSearch();
      result.current.setQuery("markra");
    });
    act(() => {
      result.current.navigate(1);
    });

    expect(result.current.activeIndex).toBe(1);
    expect(result.current.matchCount).toBe(3);

    act(() => result.current.setCaseSensitive(true));

    expect(result.current.activeIndex).toBe(0);
    expect(result.current.matchCount).toBe(1);
    expect(result.current.activeMatch).toEqual({ from: 7, to: 13 });
  });

  it("switches between source and visual matches", () => {
    const { result, rerender } = renderHook(
      ({ surface }) => useDocumentSearchState({
        available: true,
        sourceContent: "alpha beta alpha",
        surface
      }),
      { initialProps: { surface: "source" as SearchSurface } }
    );

    act(() => {
      result.current.openSearch();
      result.current.setQuery("alpha");
      result.current.setVisualMatches([{ from: 100, to: 105 }]);
    });

    expect(result.current.matches).toEqual([{ from: 0, to: 5 }, { from: 11, to: 16 }]);
    expect(result.current.visibleSourceMatches).toEqual([{ from: 0, to: 5 }, { from: 11, to: 16 }]);

    rerender({ surface: "visual" });

    expect(result.current.matches).toEqual([{ from: 100, to: 105 }]);
    expect(result.current.visibleSourceMatches).toEqual([]);
  });

  it("normalizes navigation and tracks reveal revisions", () => {
    const { result } = renderHook(() => useDocumentSearchState({
      available: true,
      sourceContent: "one two one",
      surface: "source"
    }));

    act(() => {
      result.current.openSearch();
      result.current.setQuery("one");
    });
    act(() => {
      result.current.navigate(-1);
    });

    expect(result.current.activeIndex).toBe(1);
    expect(result.current.revealRevision).toBe(1);

    act(() => result.current.navigate(1));

    expect(result.current.activeIndex).toBe(0);
    expect(result.current.revealRevision).toBe(2);
  });

  it("selects an external match and requests reveal", () => {
    const { result } = renderHook(() => useDocumentSearchState({
      available: true,
      sourceContent: "one two one",
      surface: "source"
    }));

    act(() => {
      result.current.openSearch();
      result.current.setQuery("one");
    });
    act(() => result.current.selectMatch(1));

    expect(result.current.activeIndex).toBe(1);
    expect(result.current.activeMatch).toEqual({ from: 8, to: 11 });
    expect(result.current.revealRevision).toBe(1);
  });

  it("closes search without clearing query or replacement text", () => {
    const { result } = renderHook(() => useDocumentSearchState({
      available: true,
      sourceContent: "alpha",
      surface: "source"
    }));

    act(() => {
      result.current.openReplace();
      result.current.setQuery("alpha");
      result.current.setReplacement("beta");
      result.current.close();
    });

    expect(result.current.open).toBe(false);
    expect(result.current.replaceOpen).toBe(false);
    expect(result.current.activeIndex).toBe(-1);
    expect(result.current.query).toBe("alpha");
    expect(result.current.replacement).toBe("beta");
  });

  it("hides search without resetting replace mode", () => {
    const { result } = renderHook(() => useDocumentSearchState({
      available: true,
      sourceContent: "alpha",
      surface: "source"
    }));

    act(() => {
      result.current.openReplace();
      result.current.hide();
    });

    expect(result.current.open).toBe(false);
    expect(result.current.replaceOpen).toBe(true);
  });
});
