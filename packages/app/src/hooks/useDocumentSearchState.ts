import { useCallback, useEffect, useMemo, useState } from "react";
import {
  findSearchRanges,
  isValidSearchQuery,
  normalizeSearchIndex,
  type SearchRange
} from "@markra/shared";

type DocumentSearchSurface = "source" | "visual";

type UseDocumentSearchStateOptions = {
  available: boolean;
  sourceContent: string;
  surface: DocumentSearchSurface;
};

export function useDocumentSearchState({
  available,
  sourceContent,
  surface
}: UseDocumentSearchStateOptions) {
  const [open, setOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitiveState] = useState(false);
  const [regularExpression, setRegularExpressionState] = useState(false);
  const [activeIndexState, setActiveIndexState] = useState(0);
  const [revealRevision, setRevealRevision] = useState(0);
  const [visualMatches, setVisualMatches] = useState<SearchRange[]>([]);
  const queryValid = isValidSearchQuery(query, { caseSensitive, regularExpression });

  const sourceMatches = useMemo(
    () =>
      open && surface === "source"
        ? findSearchRanges(sourceContent, query, { caseSensitive, regularExpression })
        : [],
    [caseSensitive, open, query, regularExpression, sourceContent, surface]
  );
  const matches = surface === "source" ? sourceMatches : visualMatches;
  const matchCount = matches.length;
  const activeIndex = normalizeSearchIndex(activeIndexState, matchCount);
  const activeMatch = activeIndex >= 0 ? matches[activeIndex] ?? null : null;
  const visibleSourceMatches = open && surface === "source" ? sourceMatches : [];

  const openSearch = useCallback(() => {
    if (!available) return;

    setOpen(true);
    setReplaceOpen(false);
    setVisualMatches([]);
    setActiveIndexState(0);
  }, [available]);

  const openReplace = useCallback(() => {
    if (!available) return;

    setOpen(true);
    setReplaceOpen(true);
    setVisualMatches([]);
    setActiveIndexState(0);
  }, [available]);

  const close = useCallback(() => {
    setOpen(false);
    setReplaceOpen(false);
    setActiveIndexState(0);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  const setQuery = useCallback((nextQuery: string) => {
    setQueryState(nextQuery);
    // Visual matches refresh after render; invalidate them now so Replace cannot use the previous pattern's ranges.
    setVisualMatches([]);
    setActiveIndexState(0);
  }, []);

  const setCaseSensitive = useCallback((nextCaseSensitive: boolean) => {
    setCaseSensitiveState(nextCaseSensitive);
    setVisualMatches([]);
    setActiveIndexState(0);
  }, []);

  const setRegularExpression = useCallback((nextRegularExpression: boolean) => {
    setRegularExpressionState(nextRegularExpression);
    setVisualMatches([]);
    setActiveIndexState(0);
  }, []);

  const navigate = useCallback((direction: 1 | -1) => {
    if (matchCount <= 0) return;

    setActiveIndexState((current) =>
      normalizeSearchIndex((current < 0 ? 0 : current) + direction, matchCount)
    );
    setRevealRevision((current) => current + 1);
  }, [matchCount]);

  const resetActiveIndex = useCallback(() => {
    setActiveIndexState(0);
  }, []);

  const selectMatch = useCallback((index: number) => {
    setActiveIndexState(index);
    setRevealRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    if (available) return;

    setOpen(false);
    setReplaceOpen(false);
  }, [available]);

  useEffect(() => {
    // Keep the stored index at the first result while visual matches recompute; -1 would wrap to the last result.
    const nextIndex = matchCount <= 0
      ? 0
      : normalizeSearchIndex(activeIndexState, matchCount);
    if (nextIndex !== activeIndexState) setActiveIndexState(nextIndex);
  }, [activeIndexState, matchCount]);

  return {
    activeIndex,
    activeMatch,
    caseSensitive,
    close,
    hide,
    matchCount,
    matches,
    navigate,
    open,
    openReplace,
    openSearch,
    query,
    queryValid,
    regularExpression,
    replacement,
    replaceOpen,
    resetActiveIndex,
    revealRevision,
    selectMatch,
    setCaseSensitive,
    setReplacement,
    setReplaceOpen,
    setQuery,
    setRegularExpression,
    setVisualMatches,
    visibleSourceMatches,
    visualMatches
  };
}
