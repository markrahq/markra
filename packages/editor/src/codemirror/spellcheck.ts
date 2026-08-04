import { syntaxTree } from "@codemirror/language";
import {
  EditorState,
  Facet,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  defaultEnglishSpellchecker,
  tokenizeSpellcheckText,
  type SpellcheckMatch,
  type SpellcheckOptions,
  type Spellchecker,
} from "../spellcheck.ts";
import { syntaxTreeChanged } from "./changes.ts";

export interface CodeMirrorSpellcheckState {
  readonly decorations: DecorationSet;
  readonly enabled: boolean;
  readonly ignoredWords: ReadonlySet<string>;
  readonly matches: readonly SpellcheckMatch[];
}

export interface CodeMirrorSpellcheckUpdate {
  enabled?: boolean;
  ignoredWords?: readonly string[];
}

interface InternalSpellcheckUpdate extends CodeMirrorSpellcheckUpdate {
  matches?: readonly SpellcheckMatch[];
}

interface SpellcheckConfig {
  enabled: boolean;
  ignoredWords: readonly string[];
  minWordLength: number;
  spellchecker: Spellchecker;
}

const defaultMinWordLength = 2;
const updateDelayMs = 150;
const skippedSyntaxNodes = new Set([
  "CodeBlock",
  "FencedCode",
  "HTMLBlock",
  "Image",
  "InlineCode",
  "InlineHTML",
  "Link",
  "MathBlock",
  "MathInline",
]);
const spellcheckConfig = Facet.define<SpellcheckConfig, SpellcheckConfig>({
  combine(values) {
    return (
      values[values.length - 1] ?? {
        enabled: false,
        ignoredWords: [],
        minWordLength: defaultMinWordLength,
        spellchecker: defaultEnglishSpellchecker,
      }
    );
  },
});
const updateSpellcheckEffect = StateEffect.define<InternalSpellcheckUpdate>();

function normalizeWord(word: string) {
  return word.trim().replaceAll("’", "'").toLocaleLowerCase();
}

function normalizedWordSet(words: Iterable<string>) {
  const normalized = new Set<string>();
  for (const word of words) {
    const candidate = normalizeWord(word);
    if (candidate) normalized.add(candidate);
  }
  return normalized;
}

function buildDecorations(matches: readonly SpellcheckMatch[]) {
  return Decoration.set(
    [...matches]
      .sort((left, right) => left.from - right.from || left.to - right.to)
      .map((match) =>
        Decoration.mark({
          attributes: { "data-markra-spellcheck-word": match.word },
          class: "cm-markra-spellcheck-error",
        }).range(match.from, match.to),
      ),
    true,
  );
}

function createState(
  enabled: boolean,
  ignoredWords: ReadonlySet<string>,
  matches: readonly SpellcheckMatch[],
): CodeMirrorSpellcheckState {
  if (!enabled) {
    return {
      decorations: Decoration.none,
      enabled: false,
      ignoredWords,
      matches: [],
    };
  }

  return {
    decorations: buildDecorations(matches),
    enabled: true,
    ignoredWords,
    matches: [...matches],
  };
}

const spellcheckField = StateField.define<CodeMirrorSpellcheckState>({
  create(state) {
    const config = state.facet(spellcheckConfig);
    return createState(
      config.enabled,
      normalizedWordSet(config.ignoredWords),
      [],
    );
  },
  provide(field) {
    return EditorView.decorations.from(field, (value) => value.decorations);
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (!effect.is(updateSpellcheckEffect)) continue;

      const enabled = effect.value.enabled ?? value.enabled;
      const ignoredWords = effect.value.ignoredWords
        ? normalizedWordSet(effect.value.ignoredWords)
        : value.ignoredWords;
      const matches =
        effect.value.matches ??
        (effect.value.ignoredWords
          ? value.matches.filter(
              (match) => !ignoredWords.has(normalizeWord(match.word)),
            )
          : value.matches);
      return createState(enabled, ignoredWords, matches);
    }

    const previousConfig = transaction.startState.facet(spellcheckConfig);
    const nextConfig = transaction.state.facet(spellcheckConfig);
    if (previousConfig !== nextConfig) {
      // Compartments preserve StateField instances, so facet reconfiguration must
      // explicitly synchronize the field or a startup `false` stays false forever.
      return createState(
        nextConfig.enabled,
        normalizedWordSet(nextConfig.ignoredWords),
        [],
      );
    }

    if (!transaction.docChanged) return value;
    return createState(value.enabled, value.ignoredWords, []);
  },
});

function rangeOverlaps(
  from: number,
  to: number,
  ranges: readonly { from: number; to: number }[],
) {
  return ranges.some((range) => from < range.to && range.from < to);
}

function skippedRanges(state: EditorState) {
  const ranges: Array<{ from: number; to: number }> = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (!skippedSyntaxNodes.has(node.name)) return;
      ranges.push({ from: node.from, to: node.to });
      return false;
    },
  });
  return ranges;
}

function findMatches(
  state: EditorState,
  spellchecker: Spellchecker,
  minWordLength: number,
  ignoredWords: ReadonlySet<string>,
) {
  const document = state.doc.toString();
  const skipped = skippedRanges(state);
  const matches: SpellcheckMatch[] = [];

  for (const token of tokenizeSpellcheckText(document, { minWordLength })) {
    if (rangeOverlaps(token.from, token.to, skipped)) continue;
    if (ignoredWords.has(normalizeWord(token.text))) continue;
    if (spellchecker.check(token.text)) continue;

    matches.push({
      from: token.from,
      suggestions: spellchecker.suggest?.(token.text).slice(0, 5) ?? [],
      to: token.to,
      word: token.text,
    });
  }

  return matches;
}

function updateContainsComputedMatches(update: ViewUpdate) {
  return update.transactions.some((transaction) =>
    transaction.effects.some(
      (effect) =>
        effect.is(updateSpellcheckEffect) &&
        Array.isArray(effect.value.matches),
    ),
  );
}

const spellcheckView = ViewPlugin.fromClass(
  class {
    private destroyed = false;
    private pendingLoad: Promise<unknown> | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(private view: EditorView) {
      if (getCodeMirrorSpellcheckState(view.state).enabled) this.schedule();
    }

    private cancel() {
      if (this.timer === null) return;
      clearTimeout(this.timer);
      this.timer = null;
    }

    private schedule() {
      this.cancel();
      this.timer = setTimeout(() => {
        this.timer = null;
        const state = getCodeMirrorSpellcheckState(this.view.state);
        if (!state.enabled) return;

        const config = this.view.state.facet(spellcheckConfig);
        if (config.spellchecker.isReady?.() === false) {
          const loading = config.spellchecker.load?.();
          if (loading && loading !== this.pendingLoad) {
            this.pendingLoad = loading;
            loading
              .then(() => {
                this.pendingLoad = null;
                if (
                  this.destroyed ||
                  config.spellchecker.isReady?.() === false
                ) {
                  return;
                }
                this.schedule();
              })
              .catch(() => {
                this.pendingLoad = null;
              });
          }
          return;
        }

        const matches = findMatches(
          this.view.state,
          config.spellchecker,
          config.minWordLength,
          state.ignoredWords,
        );
        this.view.dispatch({
          effects: updateSpellcheckEffect.of({ matches }),
        });
      }, updateDelayMs);
    }

    update(update: ViewUpdate) {
      this.view = update.view;
      const state = getCodeMirrorSpellcheckState(update.state);
      if (!state.enabled) {
        this.cancel();
        return;
      }
      if (updateContainsComputedMatches(update)) return;

      const previous = getCodeMirrorSpellcheckState(update.startState);
      const configChanged =
        update.startState.facet(spellcheckConfig) !==
        update.state.facet(spellcheckConfig);
      if (
        update.docChanged ||
        configChanged ||
        state.enabled !== previous.enabled ||
        state.ignoredWords !== previous.ignoredWords ||
        syntaxTreeChanged(update.startState, update.state)
      ) {
        this.schedule();
      }
    }

    destroy() {
      this.destroyed = true;
      this.cancel();
    }
  },
);

const spellcheckTheme = EditorView.baseTheme({
  ".cm-markra-spellcheck-error": {
    textDecoration: "underline wavy #ef4444",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "0.18em",
  },
});

export function codeMirrorSpellcheckPlugin(
  options: SpellcheckOptions = {},
): Extension {
  return [
    spellcheckConfig.of({
      enabled: Boolean(options.enabled),
      ignoredWords: options.ignoredWords ?? [],
      minWordLength: options.minWordLength ?? defaultMinWordLength,
      spellchecker: options.spellchecker ?? defaultEnglishSpellchecker,
    }),
    spellcheckField,
    spellcheckView,
    spellcheckTheme,
  ];
}

export function getCodeMirrorSpellcheckState(
  state: EditorState,
): CodeMirrorSpellcheckState {
  return (
    state.field(spellcheckField, false) ??
    createState(false, new Set<string>(), [])
  );
}

export function updateCodeMirrorSpellcheckOptions(
  view: EditorView,
  options: CodeMirrorSpellcheckUpdate,
) {
  view.dispatch({ effects: updateSpellcheckEffect.of(options) });
}

function selectionTouchesMatch(
  from: number,
  to: number,
  match: SpellcheckMatch,
) {
  if (from === to) return from >= match.from && from <= match.to;
  return from < match.to && to > match.from;
}

export function getActiveCodeMirrorSpellcheckMatch(view: EditorView) {
  const { from, to } = view.state.selection.main;
  return (
    getCodeMirrorSpellcheckState(view.state).matches.find((match) =>
      selectionTouchesMatch(from, to, match),
    ) ?? null
  );
}

export function replaceCodeMirrorSpellcheckMatch(
  view: EditorView,
  match: SpellcheckMatch | null | undefined,
  replacement: string,
) {
  const nextWord = replacement.trim();
  if (
    !match ||
    !nextWord ||
    view.state.facet(EditorState.readOnly) ||
    view.state.sliceDoc(match.from, match.to) !== match.word
  ) {
    return false;
  }

  view.dispatch({
    changes: { from: match.from, insert: nextWord, to: match.to },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}
