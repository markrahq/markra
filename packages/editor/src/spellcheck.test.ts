import { Schema, type Fragment, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { buildITrieFromWords } from "cspell-trie-lib";
import {
  createAsyncCspellTrieSpellchecker,
  createWordSetSpellchecker,
  defaultEnglishSpellchecker,
  findSpellcheckMatchAtSelection,
  findSpellcheckMatchesInDoc,
  replaceSpellcheckMatch,
  tokenizeSpellcheckText
} from "./spellcheck";

const schema = new Schema({
  marks: {
    link: {
      attrs: { href: {} },
      inclusive: false,
      parseDOM: [],
      toDOM: () => ["a", 0]
    }
  },
  nodes: {
    blockquote: {
      content: "block+",
      group: "block"
    },
    code_block: {
      code: true,
      content: "text*",
      group: "block"
    },
    doc: { content: "block+" },
    frontmatter: {
      content: "text*",
      group: "block"
    },
    paragraph: {
      content: "inline*",
      group: "block"
    },
    text: { group: "inline" }
  }
});

const checker = createWordSetSpellchecker([
  "a",
  "and",
  "document",
  "example",
  "inside",
  "known",
  "link",
  "markdown",
  "spelling",
  "text",
  "valid",
  "with",
  "word",
  "words"
]);

function paragraph(children: Fragment | readonly ProseNode[]) {
  return schema.node("paragraph", null, children);
}

describe("spellcheck", () => {
  it("tokenizes ordinary words while skipping URLs, numbers, and short abbreviations", () => {
    expect(tokenizeSpellcheckText("A valid markdown-ish word, https://example.test, PDF, 2026, and teh.")).toEqual([
      { from: 2, text: "valid", to: 7 },
      { from: 8, text: "markdown-ish", to: 20 },
      { from: 21, text: "word", to: 25 },
      { from: 60, text: "and", to: 63 },
      { from: 64, text: "teh", to: 67 }
    ]);
  });

  it("tokenizes Latin accents and Cyrillic words without treating CJK text as spelling words", () => {
    expect(tokenizeSpellcheckText("café déjà-vu привет and 中文")).toEqual([
      { from: 0, text: "café", to: 4 },
      { from: 5, text: "déjà-vu", to: 12 },
      { from: 13, text: "привет", to: 19 },
      { from: 20, text: "and", to: 23 }
    ]);
  });

  it("finds misspelled document ranges and skips code, frontmatter, and link marks", () => {
    const link = schema.marks.link.create({ href: "https://example.test" });
    const doc = schema.node("doc", null, [
      schema.node("frontmatter", null, [schema.text("titel: wrnog")]),
      paragraph([
        schema.text("Known text with teh "),
        schema.text("wrnog link", [link]),
        schema.text(" and wrnog word.")
      ]),
      schema.node("code_block", null, [schema.text("wrnogCode")])
    ]);
    const state = EditorState.create({ doc });

    expect(findSpellcheckMatchesInDoc(state.doc, checker).map(({ from, to, word }) => ({ from, to, word }))).toEqual([
      { from: 31, to: 34, word: "teh" },
      { from: 50, to: 55, word: "wrnog" }
    ]);
  });

  it("uses a safe known-misspelling fallback when no dictionary is configured", () => {
    const doc = schema.node("doc", null, [
      paragraph([
        schema.text("This document mentions customterm and teh.")
      ])
    ]);
    const state = EditorState.create({ doc });

    expect(findSpellcheckMatchesInDoc(state.doc, defaultEnglishSpellchecker).map(({ word }) => word)).toEqual(["teh"]);
  });

  it("does not underline words while an async dictionary is still loading", async () => {
    const doc = schema.node("doc", null, [
      paragraph([
        schema.text("This document mentions environment and acommodate.")
      ])
    ]);
    const state = EditorState.create({ doc });
    const spellchecker = createAsyncCspellTrieSpellchecker(async () => buildITrieFromWords([
      "a",
      "and",
      "document",
      "environment",
      "mentions",
      "this",
      "word"
    ]));

    expect(findSpellcheckMatchesInDoc(state.doc, spellchecker).map(({ word }) => word)).toEqual([]);

    await spellchecker.load?.();

    expect(findSpellcheckMatchesInDoc(state.doc, spellchecker).map(({ word }) => word)).toEqual([
      "acommodate"
    ]);
  });

  it("finds and replaces the misspelled word under the current selection", () => {
    const doc = schema.node("doc", null, [
      paragraph([
        schema.text("Known text with acommodate word.")
      ])
    ]);
    const state = EditorState.create({ doc });
    const [match] = findSpellcheckMatchesInDoc(state.doc, checker);
    const stateInsideMisspelling = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, match.from + 2))
    );
    const stateOutsideMisspelling = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 2))
    );

    expect(findSpellcheckMatchAtSelection(stateInsideMisspelling, [match])).toEqual(match);
    expect(findSpellcheckMatchAtSelection(stateOutsideMisspelling, [match])).toBeNull();

    const transaction = replaceSpellcheckMatch(stateInsideMisspelling, match, "accommodate");

    expect(transaction).not.toBeNull();
    expect(stateInsideMisspelling.apply(transaction!).doc.textContent).toBe("Known text with accommodate word.");
  });
});
