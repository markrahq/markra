import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type DecorationSet,
} from "@codemirror/view";
import type { SearchRange } from "@markra/shared";

export interface CodeMirrorSearchState {
  readonly activeIndex: number;
  readonly decorations: DecorationSet;
  readonly matches: readonly SearchRange[];
}

interface SearchUpdate {
  activeIndex: number;
  matches: readonly SearchRange[];
}

const emptySearchState: CodeMirrorSearchState = {
  activeIndex: -1,
  decorations: Decoration.none,
  matches: [],
};
const searchMatchClass = "cm-markra-search-match";
const currentSearchMatchClass = "cm-markra-search-match-current";
const setSearchEffect = StateEffect.define<SearchUpdate>();

function validMatches(
  matches: readonly SearchRange[],
  documentLength: number,
) {
  return matches
    .map((match, originalIndex) => ({ ...match, originalIndex }))
    .filter(
      (match) =>
        Number.isInteger(match.from) &&
        Number.isInteger(match.to) &&
        match.from >= 0 &&
        match.from < match.to &&
        match.to <= documentLength,
    )
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

function createSearchState(
  update: SearchUpdate,
  documentLength: number,
): CodeMirrorSearchState {
  const matches = validMatches(update.matches, documentLength);
  if (matches.length === 0) return emptySearchState;
  const activeIndex = matches.findIndex(
    (match) => match.originalIndex === update.activeIndex,
  );
  const decorations = Decoration.set(
    matches.map((match, index) =>
      Decoration.mark({
        class: index === activeIndex
          ? `${searchMatchClass} ${currentSearchMatchClass}`
          : searchMatchClass,
        active: index === activeIndex,
      }).range(match.from, match.to),
    ),
    true,
  );

  return {
    activeIndex,
    decorations,
    matches: matches.map(({ from, to }) => ({ from, to })),
  };
}

const searchField = StateField.define<CodeMirrorSearchState>({
  create() {
    return emptySearchState;
  },
  provide(field) {
    return EditorView.decorations.from(field, (value) => value.decorations);
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSearchEffect)) {
        return createSearchState(effect.value, transaction.newDoc.length);
      }
    }
    return transaction.docChanged ? emptySearchState : value;
  },
});

const searchTheme = EditorView.baseTheme({
  [`.${searchMatchClass}`]: {
    backgroundColor: "color-mix(in srgb, #f59e0b 32%, transparent)",
    borderRadius: "0.18em",
  },
  [`.${currentSearchMatchClass}`]: {
    backgroundColor: "color-mix(in srgb, #f59e0b 58%, transparent)",
    boxShadow: "0 0 0 1px color-mix(in srgb, #d97706 72%, transparent)",
  },
});

export function codeMirrorSearchPlugin(): Extension {
  return [searchField, searchTheme];
}

export function getCodeMirrorSearchState(
  state: EditorState,
): CodeMirrorSearchState {
  return state.field(searchField, false) ?? emptySearchState;
}

export function codeMirrorSearchHighlights(
  state: EditorState,
  from: number,
  to: number,
) {
  const highlights: (SearchRange & { className: string; active: boolean })[] = [];
  if (from >= to) return highlights;

  getCodeMirrorSearchState(state).decorations.between(from, to, (start, end, mark) => {
    if (start >= to || end <= from) return;
    highlights.push({
      from: Math.max(start, from) - from,
      to: Math.min(end, to) - from,
      className: mark.spec.class,
      active: mark.spec.active,
    });
  });
  return highlights.sort((left, right) => left.from - right.from);
}

export function updateCodeMirrorSearchDecorations(
  view: EditorView,
  matches: readonly SearchRange[],
  activeIndex: number,
) {
  view.dispatch({ effects: setSearchEffect.of({ activeIndex, matches }) });
}

function validScrollMatch(
  match: SearchRange | null | undefined,
  documentLength: number,
): match is SearchRange {
  return Boolean(
    match &&
      Number.isInteger(match.from) &&
      Number.isInteger(match.to) &&
      match.from >= 0 &&
      match.from < match.to &&
      match.to <= documentLength,
  );
}

export function scrollCodeMirrorSearchMatchIntoView(
  view: EditorView,
  match: SearchRange | null | undefined,
) {
  if (!validScrollMatch(match, view.state.doc.length)) return false;

  view.dispatch({
    effects: EditorView.scrollIntoView(match.from, { y: "center" }),
  });

  const paper = view.dom.closest<HTMLElement>(".paper-scroll");
  const window = view.dom.ownerDocument.defaultView;
  if (!paper || !window) return true;

  const { doc } = view.state;
  const search = getCodeMirrorSearchState(view.state);
  const active = search.matches[search.activeIndex];
  const isCurrent = () =>
    view.dom.isConnected &&
    paper.contains(view.dom) &&
    view.state.doc === doc &&
    getCodeMirrorSearchState(view.state) === search;
  const scrollToRenderedMatch = () => {
    if (active?.from !== match.from || active.to !== match.to) return false;
    // A table's source rows can have marks in the DOM but no visible box.
    for (const selector of [
      `.${currentSearchMatchClass}`,
      "[data-markra-search-target]",
    ]) {
      const rendered = Array.from(view.dom.querySelectorAll<HTMLElement>(selector))
        .find((element) => element.getClientRects().length > 0);
      if (rendered) {
        rendered.scrollIntoView({ block: "center", inline: "nearest" });
        return true;
      }
    }
    return false;
  };

  window.requestAnimationFrame(() => {
    if (!isCurrent() || scrollToRenderedMatch()) return;

    // CodeMirror's height map can locate matches outside the rendered
    // viewport. Move the paper first so those marks can be measured.
    const block = view.lineBlockAt(match.from);
    const viewportTop = paper.getBoundingClientRect().top + paper.clientTop;
    const center = view.documentTop + block.top + block.height / 2;
    paper.scrollTop = Math.max(
      0, paper.scrollTop + center - viewportTop - paper.clientHeight / 2,
    );
    window.requestAnimationFrame(() => {
      if (isCurrent()) scrollToRenderedMatch();
    });
  });
  return true;
}
