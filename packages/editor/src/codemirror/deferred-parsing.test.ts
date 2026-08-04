import { forceParsing } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blocksPlugin,
  codeMirrorBlockDragPlugin,
  codeMirrorSpellcheckPlugin,
  foldTogglePlugin,
  footnotePreviewPlugin,
  getCodeMirrorSpellcheckState,
  liveMarkdown,
  markraLanguage,
  mathPreviewPlugin,
  rawHtmlPreviewPlugin,
  readCodeMirrorBlockRanges,
  tableFragmentMergePlugin,
  type MarkraPlugin,
} from "./index.ts";
import "./dom.test-support.ts";

const views: EditorView[] = [];
const prefix = Array.from(
  { length: 400 },
  (_, index) => `Synthetic paragraph ${index}.`,
).join("\n\n");

function createView(doc: string, plugin: MarkraPlugin, anchor = doc.length) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [liveMarkdown({ plugins: [plugin] })],
      selection: { anchor },
    }),
  });
  view.focus();
  view.dispatch({ selection: view.state.selection });
  views.push(view);
  return view;
}

function decorationWidgetNames(view: EditorView) {
  const names: string[] = [];
  for (const source of view.state.facet(EditorView.decorations)) {
    const decorations = typeof source === "function" ? source(view) : source;
    decorations.between(0, view.state.doc.length, (_from, _to, decoration) => {
      const name = decoration.spec.widget?.constructor.name;
      if (name) names.push(name);
    });
  }
  return names;
}

function widgetCount(view: EditorView, name: string) {
  return decorationWidgetNames(view).filter((candidate) => candidate === name)
    .length;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("deferred Markdown parsing", () => {
  it("renders raw HTML when background parsing catches up", () => {
    const source = `${prefix}\n\n<div>Synthetic HTML</div>\n\nEdit`;
    const view = createView(source, rawHtmlPreviewPlugin());

    expect(decorationWidgetNames(view)).not.toContain("RawHtmlWidget");
    expect(forceParsing(view, source.length, 1_000)).toBe(true);
    expect(decorationWidgetNames(view)).toContain("RawHtmlWidget");
  });

  it("removes math preview from a deferred code fence", () => {
    const source = `${prefix}\n\n\`\`\`text\n$synthetic$\n\`\`\`\n\nEdit`;
    const view = createView(source, mathPreviewPlugin());

    expect(decorationWidgetNames(view)).toContain("MathWidget");
    expect(forceParsing(view, source.length, 1_000)).toBe(true);
    expect(decorationWidgetNames(view)).not.toContain("MathWidget");
  });

  it("removes footnote preview from a deferred code fence", () => {
    const source = `${prefix}\n\n\`\`\`text\nAlpha[^one]\n\n[^one]: Synthetic detail.\n\`\`\`\n\nEdit`;
    const view = createView(source, footnotePreviewPlugin());

    expect(decorationWidgetNames(view)).toContain("FootnoteReferenceWidget");
    expect(forceParsing(view, source.length, 1_000)).toBe(true);
    expect(decorationWidgetNames(view)).not.toContain(
      "FootnoteReferenceWidget",
    );
  });

  it("adds block toolbars when background parsing catches up", () => {
    const source = `${prefix}\n\nFinal synthetic paragraph.`;
    const view = createView(source, codeMirrorBlockDragPlugin());
    const initialCount = widgetCount(view, "BlockToolbarWidget");

    expect(forceParsing(view, source.length, 1_000)).toBe(true);
    expect(widgetCount(view, "BlockToolbarWidget")).toBeGreaterThan(
      initialCount,
    );
    expect(widgetCount(view, "BlockToolbarWidget")).toBe(
      readCodeMirrorBlockRanges(view.state).length,
    );
  });

  it("offers table fragment merging when background parsing catches up", () => {
    const table = [
      "| Name | Value |",
      "| --- | --- |",
      "| Alpha | 1 |",
      "",
      "| Beta | 2 |",
    ].join("\n");
    const source = `${prefix}\n\n${table}\n\nEdit`;
    const view = createView(source, tableFragmentMergePlugin());

    expect(decorationWidgetNames(view)).not.toContain(
      "TableFragmentMergeWidget",
    );
    expect(forceParsing(view, source.length, 1_000)).toBe(true);
    expect(decorationWidgetNames(view)).toContain("TableFragmentMergeWidget");
  });

  it("adds fold toggles when background parsing catches up", () => {
    const source = `${prefix}\n\n# Final heading\n\nSynthetic body.`;
    const view = createView(source, foldTogglePlugin());

    expect(decorationWidgetNames(view)).not.toContain("FoldToggleWidget");
    expect(forceParsing(view, source.length, 1_000)).toBe(true);
    expect(decorationWidgetNames(view)).toContain("FoldToggleWidget");
  });

  it("shows active heading controls when background parsing catches up", () => {
    const heading = "# Final heading";
    const source = `${prefix}\n\n${heading}`;
    const view = createView(
      source,
      blocksPlugin(),
      source.length - heading.length + 3,
    );

    expect(decorationWidgetNames(view)).not.toContain("HeadingLevelWidget");
    expect(forceParsing(view, source.length, 1_000)).toBe(true);
    expect(decorationWidgetNames(view)).toContain("HeadingLevelWidget");
  });

  it("rechecks stale spellcheck matches from deferred code fences", () => {
    vi.useFakeTimers();
    const source = `${prefix}\n\n\`\`\`text\nmisspeled\n\`\`\``;
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: source,
        extensions: [
          markraLanguage,
          codeMirrorSpellcheckPlugin({
            enabled: true,
            spellchecker: {
              check: (word) => word !== "misspeled",
              suggest: () => [],
            },
          }),
        ],
      }),
    });
    views.push(view);

    vi.advanceTimersByTime(160);
    expect(
      getCodeMirrorSpellcheckState(view.state).matches.map((match) => match.word),
    ).toContain("misspeled");

    expect(forceParsing(view, source.length, 1_000)).toBe(true);
    vi.advanceTimersByTime(160);
    expect(
      getCodeMirrorSpellcheckState(view.state).matches.map((match) => match.word),
    ).not.toContain("misspeled");
  });
});
