import { Schema } from "@milkdown/kit/prose/model";
import { history } from "@milkdown/kit/prose/history";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView } from "@milkdown/kit/prose/view";
import {
  createVimModePlugin,
  getVimMode
} from "./vim-mode";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0]
    },
    text: { group: "inline" }
  }
});

function paragraph(text: string) {
  return schema.node("paragraph", null, text ? [schema.text(text)] : []);
}

function createView(texts: readonly string[], enabled = true) {
  const parent = document.createElement("div");
  parent.className = "markdown-paper";
  document.body.append(parent);

  const view = new EditorView(parent, {
    state: EditorState.create({
      doc: schema.node("doc", null, texts.map(paragraph)),
      plugins: [history(), createVimModePlugin({ enabled: () => enabled })]
    })
  });

  return view;
}

function destroyView(view: EditorView) {
  view.destroy();
  view.dom.parentElement?.remove();
}

function textContent(view: EditorView) {
  return view.state.doc.textBetween(0, view.state.doc.content.size, "\n");
}

function findTextPosition(view: EditorView, text: string, offset = 0) {
  let position: number | null = null;

  view.state.doc.descendants((node, nodePosition) => {
    if (!node.isText || typeof node.text !== "string") return true;

    const textOffset = node.text.indexOf(text);
    if (textOffset < 0) return true;

    position = nodePosition + textOffset + offset;
    return false;
  });

  if (position === null) throw new Error(`Could not find text "${text}".`);

  return position;
}

function moveCursor(view: EditorView, position: number) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)));
}

function pressKey(view: EditorView, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...init
  });

  return Boolean(view.someProp("handleKeyDown", (handler) => handler(view, event)));
}

function pressKeys(view: EditorView, keys: readonly string[]) {
  return keys.map((key) => pressKey(view, key));
}

function typeText(view: EditorView, text: string) {
  const { from, to } = view.state.selection;
  const insertText = () => view.state.tr.insertText(text, from, to);
  const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, text, insertText));

  if (!handled) {
    view.dispatch(insertText());
  }

  return Boolean(handled);
}

describe("vim mode plugin", () => {
  it("marks the editor DOM with the active Vim mode", () => {
    const view = createView(["alpha"]);

    try {
      const paper = view.dom.closest(".markdown-paper");

      expect(view.dom.classList.contains("markra-vim-mode")).toBe(true);
      expect(view.dom.classList.contains("markra-vim-insert")).toBe(true);
      expect(view.dom.classList.contains("markra-vim-normal")).toBe(false);
      expect(paper?.classList.contains("markra-vim-mode")).toBe(true);
      expect(paper?.classList.contains("markra-vim-insert")).toBe(true);

      pressKey(view, "Escape");
      expect(view.dom.classList.contains("markra-vim-normal")).toBe(true);
      expect(view.dom.classList.contains("markra-vim-insert")).toBe(false);
      expect(paper?.classList.contains("markra-vim-normal")).toBe(true);
      expect(paper?.classList.contains("markra-vim-insert")).toBe(false);

      pressKey(view, "i");
      expect(view.dom.classList.contains("markra-vim-insert")).toBe(true);
      expect(view.dom.classList.contains("markra-vim-normal")).toBe(false);
      expect(paper?.classList.contains("markra-vim-insert")).toBe(true);
      expect(paper?.classList.contains("markra-vim-normal")).toBe(false);
    } finally {
      destroyView(view);
    }
  });

  it("blocks text input in normal mode and resumes text input from insert mode", () => {
    const view = createView(["alpha"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 2));

      expect(pressKey(view, "Escape")).toBe(true);
      expect(getVimMode(view.state)).toBe("normal");
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha", 1));
      expect(typeText(view, "z")).toBe(true);
      expect(textContent(view)).toBe("alpha");

      expect(pressKey(view, "i")).toBe(true);
      expect(getVimMode(view.state)).toBe("insert");
      expect(typeText(view, "z")).toBe(false);
      expect(textContent(view)).toBe("azlpha");
    } finally {
      destroyView(view);
    }
  });

  it("moves the cursor and deletes the character under the cursor in normal mode", () => {
    const view = createView(["alpha"]);

    try {
      const start = findTextPosition(view, "alpha");
      moveCursor(view, start + 1);

      pressKey(view, "Escape");
      expect(pressKey(view, "l")).toBe(true);
      expect(view.state.selection.from).toBe(start + 1);

      expect(pressKey(view, "h")).toBe(true);
      expect(view.state.selection.from).toBe(start);

      moveCursor(view, start);
      expect(pressKey(view, "x")).toBe(true);
      expect(textContent(view)).toBe("lpha");
    } finally {
      destroyView(view);
    }
  });

  it("moves between text blocks with j and k", () => {
    const view = createView(["alpha", "beta"]);

    try {
      const alphaOffset = 2;
      moveCursor(view, findTextPosition(view, "alpha", alphaOffset));

      pressKey(view, "Escape");
      expect(pressKey(view, "j")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "beta", alphaOffset - 1));

      expect(pressKey(view, "k")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha", alphaOffset - 1));
    } finally {
      destroyView(view);
    }
  });

  it("applies counts to motions and character deletes", () => {
    const view = createView(["abcdef"]);

    try {
      const start = findTextPosition(view, "abcdef");
      moveCursor(view, start);
      pressKey(view, "Escape");

      expect(pressKeys(view, ["3", "l"])).toEqual([true, true]);
      expect(view.state.selection.from).toBe(start + 3);

      expect(pressKeys(view, ["2", "x"])).toEqual([true, true]);
      expect(textContent(view)).toBe("abcf");
      expect(view.state.selection.from).toBe(start + 3);
    } finally {
      destroyView(view);
    }
  });

  it("appends after the current character at the end of a text block", () => {
    const view = createView(["abc"]);

    try {
      const start = findTextPosition(view, "abc");
      moveCursor(view, start);
      pressKey(view, "Escape");

      expect(pressKey(view, "$")).toBe(true);
      expect(pressKey(view, "a")).toBe(true);
      expect(getVimMode(view.state)).toBe("insert");
      expect(typeText(view, "X")).toBe(false);
      expect(textContent(view)).toBe("abcX");
    } finally {
      destroyView(view);
    }
  });

  it("supports word and line operator motions", () => {
    const view = createView(["alpha beta gamma"]);

    try {
      const start = findTextPosition(view, "alpha");
      moveCursor(view, start);
      pressKey(view, "Escape");

      expect(pressKeys(view, ["d", "w"])).toEqual([true, true]);
      expect(textContent(view)).toBe("beta gamma");

      moveCursor(view, findTextPosition(view, "gamma"));
      pressKey(view, "Escape");
      expect(pressKeys(view, ["d", "$"])).toEqual([true, true]);
      expect(textContent(view)).toBe("beta ");
    } finally {
      destroyView(view);
    }
  });

  it("includes the final character for Vim end-word operators", () => {
    const view = createView(["alpha beta"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["d", "e"])).toEqual([true, true]);
      expect(textContent(view)).toBe(" beta");
    } finally {
      destroyView(view);
    }
  });

  it("changes the current word with cw and enters insert mode", () => {
    const view = createView(["alpha beta"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["c", "w"])).toEqual([true, true]);
      expect(getVimMode(view.state)).toBe("insert");
      expect(textContent(view)).toBe(" beta");

      expect(typeText(view, "X")).toBe(false);
      expect(textContent(view)).toBe("X beta");
    } finally {
      destroyView(view);
    }
  });

  it("moves w and b across text blocks", () => {
    const view = createView(["alpha", "beta gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha"));
      pressKey(view, "Escape");

      expect(pressKey(view, "w")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "beta"));

      expect(pressKey(view, "w")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "gamma"));

      expect(pressKey(view, "b")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "beta"));
    } finally {
      destroyView(view);
    }
  });

  it("deletes with word operators across text blocks", () => {
    const view = createView(["alpha", "beta gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["d", "w"])).toEqual([true, true]);
      expect(textContent(view)).toBe("beta gamma");
    } finally {
      destroyView(view);
    }
  });

  it("multiplies operator counts with motion counts", () => {
    const view = createView(["one two three four"]);

    try {
      const start = findTextPosition(view, "one");
      moveCursor(view, start);
      pressKey(view, "Escape");

      expect(pressKeys(view, ["2", "d", "w"])).toEqual([true, true, true]);
      expect(textContent(view)).toBe("three four");
    } finally {
      destroyView(view);
    }
  });

  it("yanks and pastes whole text blocks with yy and p", () => {
    const view = createView(["alpha", "beta"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["y", "y"])).toEqual([true, true]);
      expect(textContent(view)).toBe("alpha\nbeta");

      expect(pressKey(view, "j")).toBe(true);
      expect(pressKey(view, "p")).toBe(true);
      expect(textContent(view)).toBe("alpha\nbeta\nalpha");
    } finally {
      destroyView(view);
    }
  });

  it("undoes and redoes Vim edits", () => {
    const view = createView(["alpha"]);
    const coordsSpy = vi.spyOn(view, "coordsAtPos").mockReturnValue({
      bottom: 24,
      left: 8,
      right: 9,
      top: 4
    });
    const scrollBySpy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});

    try {
      const start = findTextPosition(view, "alpha");
      moveCursor(view, start);
      pressKey(view, "Escape");

      expect(pressKey(view, "x")).toBe(true);
      expect(textContent(view)).toBe("lpha");

      expect(pressKey(view, "u")).toBe(true);
      expect(textContent(view)).toBe("alpha");

      expect(pressKey(view, "r", { ctrlKey: true })).toBe(true);
      expect(textContent(view)).toBe("lpha");
    } finally {
      coordsSpy.mockRestore();
      scrollBySpy.mockRestore();
      destroyView(view);
    }
  });

  it("consumes destructive editing keys in normal mode", () => {
    const view = createView(["alpha"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 2));
      pressKey(view, "Escape");

      expect(pressKey(view, "Backspace")).toBe(true);
      expect(pressKey(view, "Delete")).toBe(true);
      expect(pressKey(view, "Enter")).toBe(true);
      expect(textContent(view)).toBe("alpha");
    } finally {
      destroyView(view);
    }
  });

  it("deletes the current text block with dd", () => {
    const view = createView(["alpha", "beta"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 2));
      pressKey(view, "Escape");

      expect(pressKey(view, "d")).toBe(true);
      expect(textContent(view)).toBe("alpha\nbeta");

      expect(pressKey(view, "d")).toBe(true);
      expect(textContent(view)).toBe("beta");
    } finally {
      destroyView(view);
    }
  });
});
