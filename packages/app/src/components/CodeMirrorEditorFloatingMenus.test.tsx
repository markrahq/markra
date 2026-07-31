import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  blocksPlugin,
  documentLinksPlugin,
  getMarkraSlashMenuState,
  liveMarkdown,
} from "@markra/editor/codemirror";
import {
  MarkraEditorProvider,
  markraEditorReactBridge,
} from "@markra/editor-react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CodeMirrorEditorFloatingMenus,
  fitCodeMirrorFloatingMenu,
} from "./CodeMirrorEditorFloatingMenus";

const views: EditorView[] = [];

function createView({ documentLinks = false } = {}) {
  const doc = documentLinks ? "Open [[plug" : "/";
  const parent = document.createElement("div");
  document.body.append(parent);
  const plugins = [blocksPlugin()];
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
      extensions: [
        liveMarkdown({ plugins, slashMenu: !documentLinks }),
        markraEditorReactBridge,
      ],
      selection: EditorSelection.cursor(doc.length),
    }),
  });
  vi.spyOn(view, "coordsAtPos").mockReturnValue({
    bottom: 40,
    left: 24,
    right: 24,
    top: 20,
  });
  views.push(view);
  return view;
}

async function flushMeasurement() {
  await act(
    async () =>
      new Promise((resolve) => {
        setTimeout(resolve, 30);
      }),
  );
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe("CodeMirrorEditorFloatingMenus", () => {
  it("keeps a tall caret menu inside the viewport", () => {
    expect(
      fitCodeMirrorFloatingMenu(
        { left: 760, top: 700 },
        { height: 426, width: 320 },
        { height: 720, width: 800 },
      ),
    ).toEqual({ left: 468, top: 282 });
  });

  it("renders and runs plugin-contributed slash commands", async () => {
    const view = createView();
    const host = render(
      <MarkraEditorProvider view={view}>
        <CodeMirrorEditorFloatingMenus />
      </MarkraEditorProvider>,
    );

    await flushMeasurement();
    const heading2 = [...host.container.querySelectorAll("button")].find(
      (button) => button.textContent === "Heading 2",
    );

    expect(host.container.querySelector(".markra-slash-menu")).not.toBeNull();
    act(() => heading2?.click());
    expect(view.state.doc.toString()).toBe("## ");
  });

  it("keeps the slash command list compact and scrollable", async () => {
    const view = createView();
    const host = render(
      <MarkraEditorProvider view={view}>
        <CodeMirrorEditorFloatingMenus />
      </MarkraEditorProvider>,
    );

    await flushMeasurement();
    expect(host.container.querySelector(".markra-slash-menu")).toHaveStyle({
      maxHeight: "320px",
      overflowY: "auto",
    });
  });

  it("scrolls the keyboard-selected slash command into view", async () => {
    const view = createView();
    const host = render(
      <MarkraEditorProvider view={view}>
        <CodeMirrorEditorFloatingMenus />
      </MarkraEditorProvider>,
    );

    await flushMeasurement();
    const options = host.container.querySelectorAll<HTMLButtonElement>(
      ".markra-slash-menu-option",
    );
    const lastOption = options.item(options.length - 1);
    const scrollIntoView = vi.fn();
    lastOption.scrollIntoView = scrollIntoView;

    fireEvent.keyDown(view.contentDOM, { key: "ArrowUp" });

    expect(lastOption).toHaveAttribute("aria-selected", "true");
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  });

  it("dismisses slash commands when the user points outside the menu", async () => {
    const view = createView();
    render(
      <MarkraEditorProvider view={view}>
        <CodeMirrorEditorFloatingMenus />
      </MarkraEditorProvider>,
    );

    await flushMeasurement();
    expect(getMarkraSlashMenuState(view).open).toBe(true);
    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(getMarkraSlashMenuState(view).open).toBe(false);
  });

  it("renders and runs document-link completion items", async () => {
    const view = createView({ documentLinks: true });
    const host = render(
      <MarkraEditorProvider view={view}>
        <CodeMirrorEditorFloatingMenus />
      </MarkraEditorProvider>,
    );

    await flushMeasurement();
    const item = host.container.querySelector<HTMLButtonElement>(
      ".markra-document-link-option",
    );

    expect(item?.textContent).toContain("Plugin authoring");
    act(() => item?.click());
    expect(view.state.doc.toString()).toBe(
      "Open [Plugin authoring](./docs/plugins.md)",
    );
  });
});
