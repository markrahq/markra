import {
  EditorSelection,
  EditorState,
  type SelectionRange,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blocksPlugin,
  documentLinksPlugin,
  formattingPlugin,
  liveMarkdown,
} from "@markra/editor/codemirror";
import {
  MarkraEditorProvider,
  markraEditorReactBridge,
  useMarkraEditorCaretAnchor,
  useMarkraEditorDocumentLinks,
  useMarkraEditorSelectionToolbar,
  useMarkraEditorSlashMenu,
  useMarkraEditorUi,
} from "./index.ts";

const roots: Root[] = [];
const views: EditorView[] = [];

interface EditorOptions {
  doc: string;
  documentLinks?: boolean;
  formatting?: boolean;
  selection?: EditorSelection | SelectionRange;
  slashMenu?: boolean;
}

function createView({
  doc,
  documentLinks = false,
  formatting = false,
  selection = EditorSelection.cursor(doc.length),
  slashMenu = false,
}: EditorOptions) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const plugins = formatting ? [formattingPlugin()] : [blocksPlugin()];
  if (documentLinks) {
    plugins.push(
      documentLinksPlugin({
        items: [
          {
            detail: "docs/plugins.md",
            href: "./docs/plugins.md",
            id: "plugins",
            label: "Plugin authoring",
          },
        ],
      }),
    );
  }
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection,
      extensions: [
        liveMarkdown({ plugins, slashMenu }),
        markraEditorReactBridge,
      ],
    }),
  });
  views.push(view);
  return view;
}

function render(view: EditorView | null, children: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() =>
    root.render(<MarkraEditorProvider view={view}>{children}</MarkraEditorProvider>),
  );
  return host;
}

function SlashProbe() {
  const menu = useMarkraEditorSlashMenu();
  return (
    <section data-open={menu.open} data-query={menu.query}>
      {menu.actions.map((action, index) => (
        <button
          aria-selected={index === menu.selectedIndex}
          key={action.command}
          onClick={action.run}
          type="button"
        >
          {action.label}
        </button>
      ))}
    </section>
  );
}

function FormattingProbe() {
  const actions = useMarkraEditorUi("selection-toolbar");
  return (
    <div>
      {actions.map((action) => (
        <button
          aria-pressed={action.active}
          key={action.command}
          onClick={action.run}
          type="button"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function DocumentLinksProbe() {
  const completion = useMarkraEditorDocumentLinks();
  return (
    <section data-open={completion.open} data-query={completion.query}>
      {completion.items.map((item, index) => (
        <button
          aria-selected={index === completion.selectedIndex}
          key={item.id}
          onClick={item.run}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </section>
  );
}

function SelectionProbe() {
  const toolbar = useMarkraEditorSelectionToolbar();
  return (
    <section
      data-actions={toolbar.actions.length}
      data-from={toolbar.from ?? ""}
      data-open={toolbar.open}
      data-to={toolbar.to ?? ""}
    />
  );
}

function AnchorProbe() {
  const anchor = useMarkraEditorCaretAnchor(0);
  return <section data-left={anchor?.left ?? ""} data-top={anchor?.top ?? ""} />;
}

async function flushEditorMeasure() {
  await act(
    async () =>
      new Promise((resolve) => {
        setTimeout(resolve, 30);
      }),
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("@markra/editor-react", () => {
  it("publishes slash-menu state and rerenders after editor updates", () => {
    const view = createView({ doc: "/", slashMenu: true });
    const host = render(view, <SlashProbe />);

    expect(host.querySelector("section")?.getAttribute("data-open")).toBe("true");
    expect(host.querySelectorAll("button")).toHaveLength(14);
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(
      expect.arrayContaining(["Task list", "Callout", "Table"]),
    );

    act(() => {
      view.dispatch({
        changes: { from: 1, insert: "h2" },
        selection: EditorSelection.cursor(3),
      });
    });

    expect(host.querySelector("section")?.getAttribute("data-query")).toBe("h2");
    expect(host.querySelectorAll("button")).toHaveLength(1);
    expect(host.querySelector("button")?.textContent).toBe("Heading 2");
  });

  it("runs slash and selection-toolbar actions against the current view", () => {
    const slashView = createView({ doc: "/h2", slashMenu: true });
    const slashHost = render(slashView, <SlashProbe />);

    act(() => slashHost.querySelector("button")?.click());
    expect(slashView.state.doc.toString()).toBe("## ");
    expect(slashHost.querySelector("section")?.getAttribute("data-open")).toBe(
      "false",
    );

    const formattingView = createView({
      doc: "Alpha",
      formatting: true,
      selection: EditorSelection.range(0, 5),
    });
    const formattingHost = render(formattingView, <FormattingProbe />);
    const bold = [...formattingHost.querySelectorAll("button")].find(
      (button) => button.textContent === "Bold",
    );

    expect(bold?.getAttribute("aria-pressed")).toBe("false");
    act(() => bold?.click());
    expect(formattingView.state.doc.toString()).toBe("**Alpha**");
    expect(bold?.getAttribute("aria-pressed")).toBe("true");
  });

  it("publishes document-link completion state and actions", () => {
    const view = createView({ doc: "Open [[plug", documentLinks: true });
    const host = render(view, <DocumentLinksProbe />);

    expect(host.querySelector("section")?.dataset).toMatchObject({
      open: "true",
      query: "plug",
    });
    expect(host.querySelector("button")?.textContent).toBe("Plugin authoring");

    act(() => host.querySelector("button")?.click());
    expect(view.state.doc.toString()).toBe(
      "Open [Plugin authoring](./docs/plugins.md)",
    );
    expect(host.querySelector("section")?.dataset.open).toBe("false");
  });

  it("supports a null view while React is mounting the editor", () => {
    const host = render(null, <SlashProbe />);

    expect(host.querySelector("section")?.getAttribute("data-open")).toBe(
      "false",
    );
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });

  it("tracks whether a selection toolbar has an editable text selection", () => {
    const view = createView({
      doc: "Alpha",
      formatting: true,
      selection: EditorSelection.range(0, 5),
    });
    const host = render(view, <SelectionProbe />);

    expect(host.querySelector("section")?.dataset).toMatchObject({
      actions: "5",
      from: "0",
      open: "true",
      to: "5",
    });

    act(() => view.dispatch({ selection: EditorSelection.cursor(2) }));
    expect(host.querySelector("section")?.dataset).toMatchObject({
      actions: "5",
      from: "",
      open: "false",
      to: "",
    });
  });

  it("clears a stale floating anchor when CodeMirror cannot measure it", async () => {
    const view = createView({ doc: "Alpha" });
    const coords = vi.spyOn(view, "coordsAtPos").mockReturnValue({
      bottom: 20,
      left: 10,
      right: 10,
      top: 10,
    });
    const host = render(view, <AnchorProbe />);

    await flushEditorMeasure();
    expect(host.querySelector("section")?.dataset).toMatchObject({
      left: "10",
      top: "28",
    });

    coords.mockReturnValue(null);
    act(() => view.dispatch({}));
    await flushEditorMeasure();
    expect(host.querySelector("section")?.dataset).toMatchObject({
      left: "",
      top: "",
    });
  });
});
