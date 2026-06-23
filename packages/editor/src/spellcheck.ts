import type { Mark, Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import type { ITrie } from "cspell-trie-lib";

export type Spellchecker = {
  check: (word: string) => boolean;
  isReady?: () => boolean;
  load?: () => Promise<unknown>;
  suggest?: (word: string) => string[];
};

export type SpellcheckToken = {
  from: number;
  text: string;
  to: number;
};

export type SpellcheckMatch = {
  from: number;
  suggestions: string[];
  to: number;
  word: string;
};

export type SpellcheckOptions = {
  enabled?: boolean;
  ignoredWords?: readonly string[];
  minWordLength?: number;
  spellchecker?: Spellchecker;
};

type SpellcheckMatchOptions = {
  ignoredWords?: Iterable<string>;
  minWordLength?: number;
};

type SpellcheckMeta = Partial<Pick<SpellcheckOptions, "enabled" | "ignoredWords">> & {
  matches?: readonly SpellcheckMatch[];
};

type SpellcheckState = {
  decorations: DecorationSet;
  enabled: boolean;
  ignoredWords: Set<string>;
  matches: SpellcheckMatch[];
};

const urlPattern = /\b(?:https?:\/\/|www\.)[^\s<>()]+/giu;
const wordPattern = /[\p{Script=Latin}\p{Script=Cyrillic}]+(?:['’][\p{Script=Latin}\p{Script=Cyrillic}]+)?(?:-[\p{Script=Latin}\p{Script=Cyrillic}]+(?:['’][\p{Script=Latin}\p{Script=Cyrillic}]+)?)*/gu;
const defaultMinWordLength = 2;
const spellcheckUpdateDelayMs = 150;
const skippedNodeTypes = new Set(["code_block", "frontmatter", "html_block", "math_block"]);
const skippedMarkTypes = new Set(["code", "link"]);
const spellcheckKey = new PluginKey<SpellcheckState>("markra-spellcheck");

const defaultKnownMisspellings = [
  ["adress", ["address"]],
  ["definately", ["definitely"]],
  ["enviroment", ["environment"]],
  ["langauge", ["language"]],
  ["occured", ["occurred"]],
  ["recieve", ["receive"]],
  ["seperate", ["separate"]],
  ["teh", ["the"]],
  ["untill", ["until"]],
  ["wich", ["which"]]
] as const;

export const defaultEnglishSpellchecker = createKnownMisspellingSpellchecker(defaultKnownMisspellings);

export function createLazyCspellTrieSpellchecker(
  loadTrie: () => ITrie,
  options: {
    preferredSuggestions?: Iterable<readonly [word: string, suggestions: readonly string[]]>;
  } = {}
): Spellchecker {
  let spellchecker: Spellchecker | null = null;

  const getSpellchecker = () => {
    if (!spellchecker) {
      spellchecker = createCspellTrieSpellchecker(loadTrie(), options);
    }

    return spellchecker;
  };

  return {
    check(word) {
      return getSpellchecker().check(word);
    },
    isReady() {
      return true;
    },
    async load() {
      getSpellchecker();
    },
    suggest(word) {
      return getSpellchecker().suggest?.(word) ?? [];
    }
  };
}

export function createAsyncCspellTrieSpellchecker(
  loadTrie: () => Promise<ITrie>,
  options: {
    preferredSuggestions?: Iterable<readonly [word: string, suggestions: readonly string[]]>;
  } = {}
): Spellchecker {
  let loading: Promise<unknown> | null = null;
  let spellchecker: Spellchecker | null = null;
  let failed = false;

  const load = () => {
    if (spellchecker || failed) return Promise.resolve();
    if (!loading) {
      loading = loadTrie()
        .then((trie) => {
          spellchecker = createCspellTrieSpellchecker(trie, options);
        })
        .catch(() => {
          failed = true;
        });
    }

    return loading;
  };

  return {
    check(word) {
      if (!spellchecker) {
        load().catch(() => {});
        return true;
      }

      return spellchecker.check(word);
    },
    isReady() {
      return Boolean(spellchecker);
    },
    load,
    suggest(word) {
      return spellchecker?.suggest?.(word) ?? [];
    }
  };
}

export function createCspellTrieSpellchecker(
  trie: ITrie,
  options: {
    preferredSuggestions?: Iterable<readonly [word: string, suggestions: readonly string[]]>;
  } = {}
): Spellchecker {
  const preferredSuggestions = createSuggestionMap(options.preferredSuggestions ?? []);

  return {
    check(word) {
      const normalizedWord = normalizeSpellcheckWord(word);
      if (!normalizedWord) return true;
      if (hasTrieWord(trie, normalizedWord)) return true;
      if (normalizedWord.includes("-")) {
        return normalizedWord
          .split("-")
          .filter(Boolean)
          .every((part) => hasTrieWord(trie, part));
      }

      return false;
    },
    suggest(word) {
      const normalizedWord = normalizeSpellcheckWord(word);
      if (!normalizedWord) return [];

      return preferredSuggestions.get(normalizedWord)
        ?? trie
          .suggest(normalizedWord, {
            ignoreCase: true,
            numSuggestions: 5,
            timeout: 25
          });
    }
  };
}

export function createKnownMisspellingSpellchecker(
  entries: Iterable<readonly [word: string, suggestions: readonly string[]]>
): Spellchecker {
  const misspellings = createSuggestionMap(entries);

  return {
    check(word) {
      const normalizedWord = normalizeSpellcheckWord(word);
      if (!normalizedWord) return true;

      return !misspellings.has(normalizedWord);
    },
    suggest(word) {
      return misspellings.get(normalizeSpellcheckWord(word)) ?? [];
    }
  };
}

export function createWordSetSpellchecker(words: Iterable<string>): Spellchecker {
  const dictionary = new Set<string>();

  for (const word of words) {
    const normalizedWord = normalizeSpellcheckWord(word);
    if (normalizedWord) {
      dictionary.add(normalizedWord);
    }
  }

  return {
    check(word) {
      const normalizedWord = normalizeSpellcheckWord(word);
      if (!normalizedWord) return true;
      if (dictionary.has(normalizedWord)) return true;
      if (normalizedWord.includes("-")) {
        return normalizedWord
          .split("-")
          .filter(Boolean)
          .every((part) => dictionary.has(part));
      }

      return false;
    },
    suggest(word) {
      return suggestClosestWords(normalizeSpellcheckWord(word), dictionary);
    }
  };
}

export function tokenizeSpellcheckText(text: string, options: Pick<SpellcheckOptions, "minWordLength"> = {}) {
  const minWordLength = options.minWordLength ?? defaultMinWordLength;
  const urlRanges = findUrlRanges(text);
  const tokens: SpellcheckToken[] = [];

  for (const match of text.matchAll(wordPattern)) {
    const token = match[0];
    const from = match.index ?? 0;
    const to = from + token.length;
    if (token.length < minWordLength) continue;
    if (rangeOverlaps(from, to, urlRanges)) continue;
    if (shouldSkipToken(token)) continue;

    tokens.push({ from, text: token, to });
  }

  return tokens;
}

export function findSpellcheckMatchesInDoc(
  doc: ProseNode,
  spellchecker: Spellchecker,
  options: SpellcheckMatchOptions = {}
): SpellcheckMatch[] {
  const ignoredWords = normalizedWordSet(options.ignoredWords ?? []);
  const matches: SpellcheckMatch[] = [];

  doc.descendants((node, position) => {
    if (skippedNodeTypes.has(node.type.name) || node.type.spec.code) return false;
    if (!node.isTextblock) return true;

    node.descendants((child, offset) => {
      if (!child.isText || !child.text || hasSkippedMark(child.marks)) return true;

      const childFrom = position + 1 + offset;
      for (const token of tokenizeSpellcheckText(child.text, { minWordLength: options.minWordLength })) {
        const normalizedWord = normalizeSpellcheckWord(token.text);
        if (!normalizedWord || ignoredWords.has(normalizedWord)) continue;
        if (spellchecker.check(token.text)) continue;

        matches.push({
          from: childFrom + token.from,
          suggestions: spellchecker.suggest?.(token.text).slice(0, 5) ?? [],
          to: childFrom + token.to,
          word: token.text
        });
      }

      return true;
    });

    return false;
  });

  return matches;
}

export function createSpellcheckPlugin(options: SpellcheckOptions = {}) {
  const spellchecker = options.spellchecker ?? defaultEnglishSpellchecker;
  const minWordLength = options.minWordLength ?? defaultMinWordLength;

  return new Plugin<SpellcheckState>({
    key: spellcheckKey,
    props: {
      decorations(state) {
        return spellcheckKey.getState(state)?.decorations ?? DecorationSet.empty;
      }
    },
    state: {
      init(_, state) {
        const enabled = Boolean(options.enabled);
        const ignoredWords = normalizedWordSet(options.ignoredWords ?? []);

        return createSpellcheckState(state, { enabled, ignoredWords, matches: [] });
      },
      apply(transaction, previous, _oldState, newState) {
        const meta = transaction.getMeta(spellcheckKey) as SpellcheckMeta | undefined;
        const enabled = typeof meta?.enabled === "boolean" ? meta.enabled : previous.enabled;
        const ignoredWords = meta?.ignoredWords ? normalizedWordSet(meta.ignoredWords) : previous.ignoredWords;
        const enabledChanged = typeof meta?.enabled === "boolean" && meta.enabled !== previous.enabled;
        const ignoredWordsChanged = Boolean(meta?.ignoredWords);

        if (!enabled) {
          return {
            decorations: DecorationSet.empty,
            enabled,
            ignoredWords,
            matches: []
          };
        }

        if (Array.isArray(meta?.matches)) {
          return createSpellcheckState(newState, {
            enabled,
            ignoredWords,
            matches: [...meta.matches]
          });
        }

        if (!transaction.docChanged && !meta) {
          return {
            ...previous,
            decorations: previous.decorations.map(transaction.mapping, transaction.doc)
          };
        }

        if (!transaction.docChanged && meta && !enabledChanged && !ignoredWordsChanged) {
          return {
            ...previous,
            enabled,
            ignoredWords
          };
        }

        if (transaction.docChanged) {
          return {
            ...previous,
            enabled,
            ignoredWords,
            decorations: previous.decorations.map(transaction.mapping, transaction.doc)
          };
        }

        return createSpellcheckState(newState, {
          enabled: true,
          ignoredWords,
          matches: []
        });
      }
    },
    view(view) {
      return createSpellcheckPluginView(view, {
        minWordLength,
        spellchecker
      });
    }
  });
}

function createSpellcheckPluginView(
  view: EditorView,
  options: Required<Pick<SpellcheckOptions, "minWordLength" | "spellchecker">>
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let pendingLoad: Promise<unknown> | null = null;

  const cancel = () => {
    if (timeoutId === null) return;

    clearTimeout(timeoutId);
    timeoutId = null;
  };

  const schedule = (currentView: EditorView) => {
    cancel();
    timeoutId = setTimeout(() => {
      timeoutId = null;
      const state = spellcheckKey.getState(currentView.state);
      if (!state?.enabled) return;

      if (options.spellchecker.isReady?.() === false) {
        const loading = options.spellchecker.load?.();
        if (loading && loading !== pendingLoad) {
          pendingLoad = loading;
          loading
            .then(() => {
              pendingLoad = null;
              if (destroyed || options.spellchecker.isReady?.() === false) return;
              schedule(currentView);
            })
            .catch(() => {
              pendingLoad = null;
            });
        }
        return;
      }

      const matches = findSpellcheckMatchesInDoc(currentView.state.doc, options.spellchecker, {
        ignoredWords: state.ignoredWords,
        minWordLength: options.minWordLength
      });

      currentView.dispatch(currentView.state.tr.setMeta(spellcheckKey, { matches }));
    }, spellcheckUpdateDelayMs);
  };

  if (spellcheckKey.getState(view.state)?.enabled) {
    schedule(view);
  }

  return {
    update(currentView: EditorView, previousState: EditorState) {
      const state = spellcheckKey.getState(currentView.state);
      if (!state?.enabled) {
        cancel();
        return;
      }

      const previous = spellcheckKey.getState(previousState);
      if (
        currentView.state.doc !== previousState.doc
        || state.enabled !== previous?.enabled
        || state.ignoredWords !== previous?.ignoredWords
      ) {
        schedule(currentView);
      }
    },
    destroy() {
      destroyed = true;
      cancel();
    }
  };
}

export function markraSpellcheckPlugin(options: SpellcheckOptions = {}) {
  return $prose(() => createSpellcheckPlugin(options));
}

export function updateSpellcheckOptions(view: EditorView, options: SpellcheckMeta) {
  view.dispatch(view.state.tr.setMeta(spellcheckKey, options));
}

export function getActiveSpellcheckMatch(view: EditorView) {
  const matches = spellcheckKey.getState(view.state)?.matches ?? [];

  return findSpellcheckMatchAtSelection(view.state, matches);
}

export function findSpellcheckMatchAtSelection(state: EditorState, matches: readonly SpellcheckMatch[]) {
  const { from, to } = state.selection;

  return matches.find((match) => selectionTouchesSpellcheckMatch(from, to, match)) ?? null;
}

export function replaceSpellcheckMatch(state: EditorState, match: SpellcheckMatch, replacement: string) {
  const nextWord = replacement.trim();
  if (!nextWord) return null;
  if (state.doc.textBetween(match.from, match.to) !== match.word) return null;

  return state.tr.insertText(nextWord, match.from, match.to).scrollIntoView();
}

function createSpellcheckState(
  state: EditorState,
  options: {
    enabled: boolean;
    ignoredWords: Set<string>;
    matches: SpellcheckMatch[];
  }
): SpellcheckState {
  if (!options.enabled) {
    return {
      decorations: DecorationSet.empty,
      enabled: false,
      ignoredWords: options.ignoredWords,
      matches: []
    };
  }

  return {
    decorations: buildSpellcheckDecorations(state.doc, options.matches),
    enabled: true,
    ignoredWords: options.ignoredWords,
    matches: options.matches
  };
}

function buildSpellcheckDecorations(doc: ProseNode, matches: SpellcheckMatch[]) {
  if (matches.length === 0) return DecorationSet.empty;

  return DecorationSet.create(
    doc,
    matches.map((match) => Decoration.inline(match.from, match.to, {
      class: "markra-spellcheck-error",
      "data-markra-spellcheck-word": match.word
    }))
  );
}

function findUrlRanges(text: string) {
  return Array.from(text.matchAll(urlPattern), (match) => {
    const from = match.index ?? 0;

    return {
      from,
      to: from + match[0].length
    };
  });
}

function rangeOverlaps(from: number, to: number, ranges: Array<{ from: number; to: number }>) {
  return ranges.some((range) => from < range.to && range.from < to);
}

function selectionTouchesSpellcheckMatch(from: number, to: number, match: SpellcheckMatch) {
  if (from === to) return from >= match.from && from <= match.to;

  return from < match.to && to > match.from;
}

function shouldSkipToken(token: string) {
  if (/^[A-Z]{2,}$/u.test(token)) return true;
  if (/[0-9]/u.test(token)) return true;

  return false;
}

function hasSkippedMark(marks: readonly Mark[]) {
  return marks.some((mark) => skippedMarkTypes.has(mark.type.name));
}

function normalizedWordSet(words: Iterable<string>) {
  const normalizedWords = new Set<string>();

  for (const word of words) {
    const normalizedWord = normalizeSpellcheckWord(word);
    if (normalizedWord) {
      normalizedWords.add(normalizedWord);
    }
  }

  return normalizedWords;
}

function createSuggestionMap(entries: Iterable<readonly [word: string, suggestions: readonly string[]]>) {
  const suggestionsByWord = new Map<string, string[]>();

  for (const [word, suggestions] of entries) {
    const normalizedWord = normalizeSpellcheckWord(word);
    if (normalizedWord) {
      suggestionsByWord.set(normalizedWord, suggestions.map((suggestion) => normalizeSpellcheckWord(suggestion)));
    }
  }

  return suggestionsByWord;
}

function hasTrieWord(trie: ITrie, word: string) {
  const result = trie.findWord(word, {
    caseSensitive: false,
    checkForbidden: true
  });

  return Boolean(result.found) && !result.forbidden;
}

function normalizeSpellcheckWord(word: string) {
  return word
    .trim()
    .replaceAll("’", "'")
    .toLocaleLowerCase();
}

function suggestClosestWords(word: string, dictionary: Set<string>) {
  if (!word || word.length < 3) return [];

  return Array.from(dictionary)
    .filter((candidate) => Math.abs(candidate.length - word.length) <= 2)
    .map((candidate) => ({
      distance: levenshteinDistance(word, candidate),
      word: candidate
    }))
    .filter((candidate) => candidate.distance <= 2)
    .sort((first, second) => first.distance - second.distance || first.word.localeCompare(second.word))
    .slice(0, 5)
    .map((candidate) => candidate.word);
}

function levenshteinDistance(first: string, second: string) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  const current = Array.from({ length: second.length + 1 }, () => 0);

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    current[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const substitutionCost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[second.length] ?? 0;
}
