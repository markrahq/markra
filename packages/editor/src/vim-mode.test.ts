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

      pressKey(view, "v");
      expect(getVimMode(view.state)).toBe("visual");
      expect(view.dom.classList.contains("markra-vim-visual")).toBe(true);
      expect(paper?.classList.contains("markra-vim-visual")).toBe(true);

      pressKey(view, "Escape");
      expect(getVimMode(view.state)).toBe("normal");
      expect(view.dom.classList.contains("markra-vim-visual")).toBe(false);
      expect(paper?.classList.contains("markra-vim-visual")).toBe(false);

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
      expect(typeText(view, "z")).toBe(true);
      expect(textContent(view)).toBe("azlpha");
    } finally {
      destroyView(view);
    }
  });

  it("deletes the previous word with Ctrl-w in insert mode", () => {
    const view = createView(["alpha beta"]);

    try {
      moveCursor(view, findTextPosition(view, "beta", "beta".length));

      expect(getVimMode(view.state)).toBe("insert");
      expect(pressKey(view, "w", { ctrlKey: true })).toBe(true);
      expect(getVimMode(view.state)).toBe("insert");
      expect(textContent(view)).toBe("alpha ");
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha ", "alpha ".length));
    } finally {
      destroyView(view);
    }
  });

  it("treats Ctrl-[ as Escape", () => {
    const view = createView(["alpha"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 2));

      expect(pressKey(view, "[", { ctrlKey: true })).toBe(true);
      expect(getVimMode(view.state)).toBe("normal");
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha", 1));

      expect(pressKey(view, "v")).toBe(true);
      expect(pressKey(view, "l")).toBe(true);
      expect(getVimMode(view.state)).toBe("visual");

      expect(pressKey(view, "[", { ctrlKey: true })).toBe(true);
      expect(getVimMode(view.state)).toBe("normal");
      expect(view.state.selection.empty).toBe(true);
    } finally {
      destroyView(view);
    }
  });

  it("treats Ctrl-c as Escape", () => {
    const view = createView(["alpha"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 2));

      expect(pressKey(view, "c", { ctrlKey: true })).toBe(true);
      expect(getVimMode(view.state)).toBe("normal");
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha", 1));

      expect(pressKey(view, "v")).toBe(true);
      expect(pressKey(view, "l")).toBe(true);
      expect(getVimMode(view.state)).toBe("visual");

      expect(pressKey(view, "c", { ctrlKey: true })).toBe(true);
      expect(getVimMode(view.state)).toBe("normal");
      expect(view.state.selection.empty).toBe(true);
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

  it("deletes characters before the cursor with X", () => {
    const view = createView(["abcdef"]);
    const repeat = createView(["abcdef"]);

    try {
      const start = findTextPosition(view, "abcdef");
      moveCursor(view, start + 3);
      pressKey(view, "Escape");

      expect(pressKey(view, "X")).toBe(true);
      expect(textContent(view)).toBe("acdef");
      expect(view.state.selection.from).toBe(findTextPosition(view, "cdef"));

      moveCursor(view, findTextPosition(view, "e"));
      expect(pressKeys(view, ["2", "X"])).toEqual([true, true]);
      expect(textContent(view)).toBe("aef");
      expect(view.state.selection.from).toBe(findTextPosition(view, "e"));

      moveCursor(repeat, findTextPosition(repeat, "abcdef", 4));
      pressKey(repeat, "Escape");

      expect(pressKey(repeat, "X")).toBe(true);
      expect(textContent(repeat)).toBe("abdef");
      expect(pressKey(repeat, ".")).toBe(true);
      expect(textContent(repeat)).toBe("adef");
    } finally {
      destroyView(view);
      destroyView(repeat);
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

  it("moves by character with Space, Backspace, and Ctrl-h", () => {
    const view = createView(["abcdef"]);

    try {
      const start = findTextPosition(view, "abcdef");
      moveCursor(view, start + 3);
      pressKey(view, "Escape");

      expect(view.state.selection.from).toBe(start + 2);

      expect(pressKey(view, " ")).toBe(true);
      expect(view.state.selection.from).toBe(start + 3);

      expect(pressKey(view, "Backspace")).toBe(true);
      expect(view.state.selection.from).toBe(start + 2);

      expect(pressKey(view, "h", { ctrlKey: true })).toBe(true);
      expect(view.state.selection.from).toBe(start + 1);
      expect(textContent(view)).toBe("abcdef");
    } finally {
      destroyView(view);
    }
  });

  it("moves to first nonblank text blocks with Enter, +, and -", () => {
    const view = createView(["  alpha", "    beta", "  gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 1));
      pressKey(view, "Escape");

      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha"));

      expect(pressKey(view, "Enter")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "beta"));

      expect(pressKey(view, "-")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha"));

      expect(pressKeys(view, ["2", "+"])).toEqual([true, true]);
      expect(view.state.selection.from).toBe(findTextPosition(view, "gamma"));
    } finally {
      destroyView(view);
    }
  });

  it("moves to first and last nonblank characters with _ and g_", () => {
    const view = createView(["  alpha  ", "    beta   ", "  gamma  "]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 2));
      pressKey(view, "Escape");

      expect(pressKey(view, "_")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha"));

      expect(pressKeys(view, ["2", "_"])).toEqual([true, true]);
      expect(view.state.selection.from).toBe(findTextPosition(view, "beta"));

      moveCursor(view, findTextPosition(view, "alpha"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["g", "_"])).toEqual([true, true]);
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha", "alpha".length - 1));

      expect(pressKeys(view, ["2", "g", "_"])).toEqual([true, true, true]);
      expect(view.state.selection.from).toBe(findTextPosition(view, "beta", "beta".length - 1));
    } finally {
      destroyView(view);
    }
  });

  it("joins the current text block with the next one using J", () => {
    const view = createView(["alpha", "beta"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 2));
      pressKey(view, "Escape");

      expect(pressKey(view, "J")).toBe(true);
      expect(getVimMode(view.state)).toBe("normal");
      expect(textContent(view)).toBe("alpha beta");
    } finally {
      destroyView(view);
    }
  });

  it("treats a J count as the total number of joined text blocks", () => {
    const view = createView(["alpha", "beta", "gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 2));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["2", "J"])).toEqual([true, true]);
      expect(textContent(view)).toBe("alpha beta\ngamma");
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

  it("finds characters with Vim f, t, F, T, and repeat keys", () => {
    const view = createView(["ab-cd-ef"]);

    try {
      const start = findTextPosition(view, "ab-cd-ef");
      moveCursor(view, start);
      pressKey(view, "Escape");

      expect(pressKeys(view, ["2", "f", "-"])).toEqual([true, true, true]);
      expect(view.state.selection.from).toBe(start + 5);

      expect(pressKey(view, ",")).toBe(true);
      expect(view.state.selection.from).toBe(start + 2);

      expect(pressKeys(view, ["t", "-"])).toEqual([true, true]);
      expect(view.state.selection.from).toBe(start + 4);

      moveCursor(view, start + 7);
      expect(pressKeys(view, ["F", "-"])).toEqual([true, true]);
      expect(view.state.selection.from).toBe(start + 5);

      moveCursor(view, start + 7);
      expect(pressKeys(view, ["T", "-"])).toEqual([true, true]);
      expect(view.state.selection.from).toBe(start + 6);
    } finally {
      destroyView(view);
    }
  });

  it("replaces the character under the cursor with r and stays in normal mode", () => {
    const view = createView(["alpha"]);

    try {
      const start = findTextPosition(view, "alpha");
      moveCursor(view, start);
      pressKey(view, "Escape");

      expect(pressKeys(view, ["r", "X"])).toEqual([true, true]);
      expect(textContent(view)).toBe("Xlpha");
      expect(getVimMode(view.state)).toBe("normal");
      expect(view.state.selection.from).toBe(start);
    } finally {
      destroyView(view);
    }
  });

  it("toggles character case with ~", () => {
    const view = createView(["aBcDe"]);
    const repeat = createView(["abcdef"]);

    try {
      const start = findTextPosition(view, "aBcDe");
      moveCursor(view, start);
      pressKey(view, "Escape");

      expect(pressKey(view, "~")).toBe(true);
      expect(textContent(view)).toBe("ABcDe");
      expect(view.state.selection.from).toBe(start + 1);

      expect(pressKeys(view, ["3", "~"])).toEqual([true, true]);
      expect(textContent(view)).toBe("AbCde");
      expect(view.state.selection.from).toBe(start + 4);

      moveCursor(repeat, findTextPosition(repeat, "abcdef"));
      pressKey(repeat, "Escape");

      expect(pressKeys(repeat, ["2", "~"])).toEqual([true, true]);
      expect(textContent(repeat)).toBe("ABcdef");
      expect(pressKey(repeat, ".")).toBe(true);
      expect(textContent(repeat)).toBe("ABCDef");
    } finally {
      destroyView(view);
      destroyView(repeat);
    }
  });

  it("substitutes the character under the cursor with s and enters insert mode", () => {
    const view = createView(["alpha"]);

    try {
      const start = findTextPosition(view, "alpha");
      moveCursor(view, start);
      pressKey(view, "Escape");

      expect(pressKey(view, "s")).toBe(true);
      expect(getVimMode(view.state)).toBe("insert");
      expect(textContent(view)).toBe("lpha");

      expect(typeText(view, "X")).toBe(true);
      expect(textContent(view)).toBe("Xlpha");
    } finally {
      destroyView(view);
    }
  });

  it("uses Vim visual character selections for yank, delete, and change", () => {
    const yank = createView(["alpha beta"]);
    const deletion = createView(["alpha beta"]);
    const change = createView(["alpha beta"]);

    try {
      moveCursor(yank, findTextPosition(yank, "alpha"));
      pressKey(yank, "Escape");

      expect(pressKeys(yank, ["v", "l", "y"])).toEqual([true, true, true]);
      expect(getVimMode(yank.state)).toBe("normal");
      expect(textContent(yank)).toBe("alpha beta");

      moveCursor(yank, findTextPosition(yank, "beta"));
      expect(pressKey(yank, "p")).toBe(true);
      expect(textContent(yank)).toBe("alpha baleta");

      moveCursor(deletion, findTextPosition(deletion, "alpha"));
      pressKey(deletion, "Escape");

      expect(pressKeys(deletion, ["v", "l", "d"])).toEqual([true, true, true]);
      expect(getVimMode(deletion.state)).toBe("normal");
      expect(textContent(deletion)).toBe("pha beta");

      moveCursor(change, findTextPosition(change, "alpha"));
      pressKey(change, "Escape");

      expect(pressKeys(change, ["v", "l", "c"])).toEqual([true, true, true]);
      expect(getVimMode(change.state)).toBe("insert");
      expect(textContent(change)).toBe("pha beta");

      expect(typeText(change, "X")).toBe(false);
      expect(textContent(change)).toBe("Xpha beta");
    } finally {
      destroyView(yank);
      destroyView(deletion);
      destroyView(change);
    }
  });

  it("extends Vim visual selections with character find motions", () => {
    const find = createView(["alpha,beta"]);
    const repeat = createView(["a-b-c"]);

    try {
      moveCursor(find, findTextPosition(find, "alpha"));
      pressKey(find, "Escape");

      expect(pressKeys(find, ["v", "f", ",", "d"])).toEqual([true, true, true, true]);
      expect(getVimMode(find.state)).toBe("normal");
      expect(textContent(find)).toBe("beta");

      moveCursor(repeat, findTextPosition(repeat, "a-b-c"));
      pressKey(repeat, "Escape");

      expect(pressKeys(repeat, ["v", "f", "-", ";", "d"])).toEqual([true, true, true, true, true]);
      expect(textContent(repeat)).toBe("c");
    } finally {
      destroyView(find);
      destroyView(repeat);
    }
  });

  it("switches Vim visual selection ends with o", () => {
    const view = createView(["alpha beta gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "beta"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["v", "e", "o", "b", "d"])).toEqual([true, true, true, true, true]);
      expect(getVimMode(view.state)).toBe("normal");
      expect(textContent(view)).toBe(" gamma");
    } finally {
      destroyView(view);
    }
  });

  it("reselects the previous Vim visual selection with gv", () => {
    const view = createView(["alpha beta gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "beta", 1));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["v", "l", "y"])).toEqual([true, true, true]);
      expect(getVimMode(view.state)).toBe("normal");

      moveCursor(view, findTextPosition(view, "gamma"));

      expect(pressKeys(view, ["g", "v", "d"])).toEqual([true, true, true]);
      expect(getVimMode(view.state)).toBe("normal");
      expect(textContent(view)).toBe("alpha ta gamma");
    } finally {
      destroyView(view);
    }
  });

  it("uses Vim visual word text objects", () => {
    const inner = createView(["alpha beta gamma"]);
    const around = createView(["alpha beta gamma"]);

    try {
      moveCursor(inner, findTextPosition(inner, "beta", 1));
      pressKey(inner, "Escape");

      expect(pressKeys(inner, ["v", "i", "w", "d"])).toEqual([true, true, true, true]);
      expect(getVimMode(inner.state)).toBe("normal");
      expect(textContent(inner)).toBe("alpha  gamma");

      moveCursor(around, findTextPosition(around, "beta", 1));
      pressKey(around, "Escape");

      expect(pressKeys(around, ["v", "a", "w", "d"])).toEqual([true, true, true, true]);
      expect(getVimMode(around.state)).toBe("normal");
      expect(textContent(around)).toBe("alpha gamma");
    } finally {
      destroyView(inner);
      destroyView(around);
    }
  });

  it("uses Vim visual line selections for yank, delete, and change", () => {
    const yank = createView(["alpha", "beta", "gamma"]);
    const deletion = createView(["alpha", "beta", "gamma"]);
    const change = createView(["alpha", "beta", "gamma"]);

    try {
      moveCursor(yank, findTextPosition(yank, "alpha"));
      pressKey(yank, "Escape");

      expect(pressKeys(yank, ["V", "j", "y"])).toEqual([true, true, true]);
      expect(getVimMode(yank.state)).toBe("normal");
      expect(textContent(yank)).toBe("alpha\nbeta\ngamma");

      moveCursor(yank, findTextPosition(yank, "gamma"));
      expect(pressKey(yank, "p")).toBe(true);
      expect(textContent(yank)).toBe("alpha\nbeta\ngamma\nalpha\nbeta");

      moveCursor(deletion, findTextPosition(deletion, "alpha"));
      pressKey(deletion, "Escape");

      expect(pressKeys(deletion, ["V", "j", "d"])).toEqual([true, true, true]);
      expect(getVimMode(deletion.state)).toBe("normal");
      expect(textContent(deletion)).toBe("gamma");

      moveCursor(change, findTextPosition(change, "alpha"));
      pressKey(change, "Escape");

      expect(pressKeys(change, ["V", "j", "c"])).toEqual([true, true, true]);
      expect(getVimMode(change.state)).toBe("insert");
      expect(textContent(change)).toBe("\ngamma");

      expect(typeText(change, "X")).toBe(false);
      expect(textContent(change)).toBe("X\ngamma");
    } finally {
      destroyView(yank);
      destroyView(deletion);
      destroyView(change);
    }
  });

  it("extends Vim visual line selections with G and gg", () => {
    const toEnd = createView(["alpha", "beta", "gamma"]);
    const toStart = createView(["alpha", "beta", "gamma"]);

    try {
      moveCursor(toEnd, findTextPosition(toEnd, "beta"));
      pressKey(toEnd, "Escape");

      expect(pressKeys(toEnd, ["V", "G", "d"])).toEqual([true, true, true]);
      expect(textContent(toEnd)).toBe("alpha");

      moveCursor(toStart, findTextPosition(toStart, "beta"));
      pressKey(toStart, "Escape");

      expect(pressKeys(toStart, ["V", "g", "g", "d"])).toEqual([true, true, true, true]);
      expect(textContent(toStart)).toBe("gamma");
    } finally {
      destroyView(toEnd);
      destroyView(toStart);
    }
  });

  it("shrinks Vim visual line selections with reverse line motions", () => {
    const view = createView(["alpha", "beta", "gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "beta"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["V", "j", "k", "d"])).toEqual([true, true, true, true]);
      expect(getVimMode(view.state)).toBe("normal");
      expect(textContent(view)).toBe("alpha\ngamma");
    } finally {
      destroyView(view);
    }
  });

  it("exits Vim visual mode with Escape", () => {
    const view = createView(["alpha"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["v", "l"])).toEqual([true, true]);
      expect(getVimMode(view.state)).toBe("visual");
      expect(view.state.selection.empty).toBe(false);
      expect(pressKey(view, "Backspace")).toBe(true);
      expect(pressKey(view, "Delete")).toBe(true);
      expect(pressKey(view, "Enter")).toBe(true);
      expect(textContent(view)).toBe("alpha");
      expect(getVimMode(view.state)).toBe("visual");

      expect(pressKey(view, "Escape")).toBe(true);
      expect(getVimMode(view.state)).toBe("normal");
      expect(view.state.selection.empty).toBe(true);
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
      expect(typeText(view, "X")).toBe(true);
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

  it("applies counts to Vim $ motions", () => {
    const movement = createView(["alpha", "beta", "gamma"]);
    const deletion = createView(["alpha", "beta", "gamma"]);

    try {
      moveCursor(movement, findTextPosition(movement, "alpha"));
      pressKey(movement, "Escape");

      expect(pressKeys(movement, ["2", "$"])).toEqual([true, true]);
      expect(movement.state.selection.from).toBe(findTextPosition(movement, "beta", "beta".length - 1));

      moveCursor(deletion, findTextPosition(deletion, "alpha"));
      pressKey(deletion, "Escape");

      expect(pressKeys(deletion, ["d", "2", "$"])).toEqual([true, true, true]);
      expect(textContent(deletion)).toBe("\ngamma");
    } finally {
      destroyView(movement);
      destroyView(deletion);
    }
  });

  it("uses character find motions for Vim operators", () => {
    const deleteThrough = createView(["alpha,beta"]);
    const deleteTill = createView(["alpha,beta"]);

    try {
      moveCursor(deleteThrough, findTextPosition(deleteThrough, "alpha"));
      pressKey(deleteThrough, "Escape");

      expect(pressKeys(deleteThrough, ["d", "f", ","])).toEqual([true, true, true]);
      expect(textContent(deleteThrough)).toBe("beta");

      moveCursor(deleteTill, findTextPosition(deleteTill, "alpha"));
      pressKey(deleteTill, "Escape");

      expect(pressKeys(deleteTill, ["d", "t", ","])).toEqual([true, true, true]);
      expect(textContent(deleteTill)).toBe(",beta");
    } finally {
      destroyView(deleteThrough);
      destroyView(deleteTill);
    }
  });

  it("deletes to the end of the text block with D", () => {
    const view = createView(["alpha beta"]);

    try {
      pressKey(view, "Escape");
      moveCursor(view, findTextPosition(view, "beta"));

      expect(pressKey(view, "D")).toBe(true);
      expect(textContent(view)).toBe("alpha ");
    } finally {
      destroyView(view);
    }
  });

  it("changes to the end of the text block with C", () => {
    const view = createView(["alpha beta"]);

    try {
      pressKey(view, "Escape");
      moveCursor(view, findTextPosition(view, "beta"));

      expect(pressKey(view, "C")).toBe(true);
      expect(getVimMode(view.state)).toBe("insert");
      expect(textContent(view)).toBe("alpha ");

      expect(typeText(view, "X")).toBe(true);
      expect(textContent(view)).toBe("alpha X");
    } finally {
      destroyView(view);
    }
  });

  it("applies Vim counts to D and C line-tail commands", () => {
    const deletion = createView(["alpha", "beta", "gamma"]);
    const change = createView(["alpha", "beta", "gamma"]);

    try {
      moveCursor(deletion, findTextPosition(deletion, "alpha"));
      pressKey(deletion, "Escape");

      expect(pressKeys(deletion, ["2", "D"])).toEqual([true, true]);
      expect(textContent(deletion)).toBe("\ngamma");

      moveCursor(change, findTextPosition(change, "alpha"));
      pressKey(change, "Escape");

      expect(pressKeys(change, ["2", "C"])).toEqual([true, true]);
      expect(getVimMode(change.state)).toBe("insert");
      expect(textContent(change)).toBe("\ngamma");

      expect(typeText(change, "delta")).toBe(true);
      expect(textContent(change)).toBe("delta\ngamma");
    } finally {
      destroyView(deletion);
      destroyView(change);
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

      expect(typeText(view, "X")).toBe(true);
      expect(textContent(view)).toBe("X beta");
    } finally {
      destroyView(view);
    }
  });

  it("uses Vim inner word text objects for delete and change operators", () => {
    const deleteInner = createView(["alpha beta gamma"]);
    const changeInner = createView(["alpha beta gamma"]);

    try {
      moveCursor(deleteInner, findTextPosition(deleteInner, "beta", 1));
      pressKey(deleteInner, "Escape");

      expect(pressKeys(deleteInner, ["d", "i", "w"])).toEqual([true, true, true]);
      expect(textContent(deleteInner)).toBe("alpha  gamma");

      moveCursor(changeInner, findTextPosition(changeInner, "beta", 1));
      pressKey(changeInner, "Escape");

      expect(pressKeys(changeInner, ["c", "i", "w"])).toEqual([true, true, true]);
      expect(getVimMode(changeInner.state)).toBe("insert");
      expect(textContent(changeInner)).toBe("alpha  gamma");

      expect(typeText(changeInner, "delta")).toBe(true);
      expect(textContent(changeInner)).toBe("alpha delta gamma");
    } finally {
      destroyView(deleteInner);
      destroyView(changeInner);
    }
  });

  it("includes adjacent spacing for Vim a word text objects", () => {
    const view = createView(["alpha beta gamma"]);
    const lastWord = createView(["alpha beta gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "beta", 1));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["d", "a", "w"])).toEqual([true, true, true]);
      expect(textContent(view)).toBe("alpha gamma");

      moveCursor(lastWord, findTextPosition(lastWord, "gamma", 1));
      pressKey(lastWord, "Escape");

      expect(pressKeys(lastWord, ["d", "a", "w"])).toEqual([true, true, true]);
      expect(textContent(lastWord)).toBe("alpha beta");
    } finally {
      destroyView(view);
      destroyView(lastWord);
    }
  });

  it("yanks Vim word text objects", () => {
    const view = createView(["alpha beta gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "beta", 1));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["y", "i", "w"])).toEqual([true, true, true]);
      expect(textContent(view)).toBe("alpha beta gamma");

      expect(pressKey(view, "$")).toBe(true);
      expect(pressKey(view, "p")).toBe(true);
      expect(textContent(view)).toBe("alpha beta gammabeta");
    } finally {
      destroyView(view);
    }
  });

  it("uses Vim inner quote text objects for delete and change operators", () => {
    const deleteInner = createView(['alpha "beta" gamma']);
    const changeInner = createView(['alpha "beta" gamma']);

    try {
      moveCursor(deleteInner, findTextPosition(deleteInner, "beta", 1));
      pressKey(deleteInner, "Escape");

      expect(pressKeys(deleteInner, ["d", "i", '"'])).toEqual([true, true, true]);
      expect(textContent(deleteInner)).toBe('alpha "" gamma');

      moveCursor(changeInner, findTextPosition(changeInner, "beta", 1));
      pressKey(changeInner, "Escape");

      expect(pressKeys(changeInner, ["c", "i", '"'])).toEqual([true, true, true]);
      expect(getVimMode(changeInner.state)).toBe("insert");
      expect(textContent(changeInner)).toBe('alpha "" gamma');

      expect(typeText(changeInner, "delta")).toBe(true);
      expect(textContent(changeInner)).toBe('alpha "delta" gamma');
    } finally {
      destroyView(deleteInner);
      destroyView(changeInner);
    }
  });

  it("uses Vim around quote text objects and yanks inline code", () => {
    const deleteAround = createView(['alpha "beta" gamma']);
    const yankInlineCode = createView(["alpha `code` gamma"]);

    try {
      moveCursor(deleteAround, findTextPosition(deleteAround, "beta", 1));
      pressKey(deleteAround, "Escape");

      expect(pressKeys(deleteAround, ["d", "a", '"'])).toEqual([true, true, true]);
      expect(textContent(deleteAround)).toBe("alpha  gamma");

      moveCursor(yankInlineCode, findTextPosition(yankInlineCode, "code", 1));
      pressKey(yankInlineCode, "Escape");

      expect(pressKeys(yankInlineCode, ["y", "i", "`"])).toEqual([true, true, true]);
      expect(textContent(yankInlineCode)).toBe("alpha `code` gamma");

      expect(pressKey(yankInlineCode, "$")).toBe(true);
      expect(pressKey(yankInlineCode, "p")).toBe(true);
      expect(textContent(yankInlineCode)).toBe("alpha `code` gammacode");
    } finally {
      destroyView(deleteAround);
      destroyView(yankInlineCode);
    }
  });

  it("uses Vim inner pair text objects for nested parentheses and braces", () => {
    const deleteNested = createView(["alpha (beta (gamma) delta)"]);
    const changeBraces = createView(["alpha {beta} gamma"]);

    try {
      moveCursor(deleteNested, findTextPosition(deleteNested, "gamma", 1));
      pressKey(deleteNested, "Escape");

      expect(pressKeys(deleteNested, ["d", "i", "("])).toEqual([true, true, true]);
      expect(textContent(deleteNested)).toBe("alpha (beta () delta)");

      moveCursor(changeBraces, findTextPosition(changeBraces, "beta", 1));
      pressKey(changeBraces, "Escape");

      expect(pressKeys(changeBraces, ["c", "i", "{"])).toEqual([true, true, true]);
      expect(getVimMode(changeBraces.state)).toBe("insert");
      expect(textContent(changeBraces)).toBe("alpha {} gamma");

      expect(typeText(changeBraces, "delta")).toBe(true);
      expect(textContent(changeBraces)).toBe("alpha {delta} gamma");
    } finally {
      destroyView(deleteNested);
      destroyView(changeBraces);
    }
  });

  it("uses Vim around pair text objects and yanks bracket contents", () => {
    const deleteAround = createView(["alpha (beta) gamma"]);
    const yankBrackets = createView(["alpha [beta] gamma"]);

    try {
      moveCursor(deleteAround, findTextPosition(deleteAround, "beta", 1));
      pressKey(deleteAround, "Escape");

      expect(pressKeys(deleteAround, ["d", "a", ")"])).toEqual([true, true, true]);
      expect(textContent(deleteAround)).toBe("alpha  gamma");

      moveCursor(yankBrackets, findTextPosition(yankBrackets, "beta", 1));
      pressKey(yankBrackets, "Escape");

      expect(pressKeys(yankBrackets, ["y", "i", "]"])).toEqual([true, true, true]);
      expect(textContent(yankBrackets)).toBe("alpha [beta] gamma");

      expect(pressKey(yankBrackets, "$")).toBe(true);
      expect(pressKey(yankBrackets, "p")).toBe(true);
      expect(textContent(yankBrackets)).toBe("alpha [beta] gammabeta");
    } finally {
      destroyView(deleteAround);
      destroyView(yankBrackets);
    }
  });

  it("changes the current text block with cc and enters insert mode", () => {
    const view = createView(["alpha", "beta"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 2));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["c", "c"])).toEqual([true, true]);
      expect(getVimMode(view.state)).toBe("insert");
      expect(textContent(view)).toBe("\nbeta");

      expect(typeText(view, "X")).toBe(true);
      expect(textContent(view)).toBe("X\nbeta");
    } finally {
      destroyView(view);
    }
  });

  it("substitutes the current text block with S and enters insert mode", () => {
    const view = createView(["alpha", "beta"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha", 2));
      pressKey(view, "Escape");

      expect(pressKey(view, "S")).toBe(true);
      expect(getVimMode(view.state)).toBe("insert");
      expect(textContent(view)).toBe("\nbeta");

      expect(typeText(view, "X")).toBe(true);
      expect(textContent(view)).toBe("X\nbeta");
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

  it("moves by Vim WORD motions across punctuation", () => {
    const view = createView(["one.two three four"]);

    try {
      const start = findTextPosition(view, "one.two");
      moveCursor(view, start);
      pressKey(view, "Escape");

      expect(pressKey(view, "W")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "three"));

      expect(pressKey(view, "B")).toBe(true);
      expect(view.state.selection.from).toBe(start);

      expect(pressKey(view, "E")).toBe(true);
      expect(view.state.selection.from).toBe(start + "one.two".length - 1);

      moveCursor(view, start);
      expect(pressKeys(view, ["2", "W"])).toEqual([true, true]);
      expect(view.state.selection.from).toBe(findTextPosition(view, "four"));

      moveCursor(view, findTextPosition(view, "four"));
      expect(pressKeys(view, ["g", "E"])).toEqual([true, true]);
      expect(view.state.selection.from).toBe(findTextPosition(view, "three", "three".length - 1));
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

  it("uses Vim WORD motions for operators", () => {
    const deleteToNextWord = createView(["one.two three"]);
    const deleteToWordEnd = createView(["one.two three"]);
    const changeWord = createView(["one.two three"]);

    try {
      moveCursor(deleteToNextWord, findTextPosition(deleteToNextWord, "one.two"));
      pressKey(deleteToNextWord, "Escape");

      expect(pressKeys(deleteToNextWord, ["d", "W"])).toEqual([true, true]);
      expect(textContent(deleteToNextWord)).toBe("three");

      moveCursor(deleteToWordEnd, findTextPosition(deleteToWordEnd, "one.two"));
      pressKey(deleteToWordEnd, "Escape");

      expect(pressKeys(deleteToWordEnd, ["d", "E"])).toEqual([true, true]);
      expect(textContent(deleteToWordEnd)).toBe(" three");

      moveCursor(changeWord, findTextPosition(changeWord, "one.two"));
      pressKey(changeWord, "Escape");

      expect(pressKeys(changeWord, ["c", "W"])).toEqual([true, true]);
      expect(getVimMode(changeWord.state)).toBe("insert");
      expect(textContent(changeWord)).toBe(" three");

      expect(typeText(changeWord, "token")).toBe(true);
      expect(textContent(changeWord)).toBe("token three");
    } finally {
      destroyView(deleteToNextWord);
      destroyView(deleteToWordEnd);
      destroyView(changeWord);
    }
  });

  it("jumps between matching pairs with %", () => {
    const view = createView(["alpha (beta [gamma]) delta"]);

    try {
      const openParen = findTextPosition(view, "(");
      const closeParen = findTextPosition(view, ")");
      const openBracket = findTextPosition(view, "[");
      const closeBracket = findTextPosition(view, "]");

      moveCursor(view, openParen + 1);
      pressKey(view, "Escape");

      expect(pressKey(view, "%")).toBe(true);
      expect(view.state.selection.from).toBe(closeParen);

      expect(pressKey(view, "%")).toBe(true);
      expect(view.state.selection.from).toBe(openParen);

      moveCursor(view, closeBracket);
      expect(pressKey(view, "%")).toBe(true);
      expect(view.state.selection.from).toBe(openBracket);
    } finally {
      destroyView(view);
    }
  });

  it("searches with / and repeats matches with n and N", () => {
    const view = createView(["alpha beta", "gamma beta", "beta delta"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["/", "b", "e", "t", "a", "Enter"])).toEqual([true, true, true, true, true, true]);
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha beta", "alpha ".length));
      expect(textContent(view)).toBe("alpha beta\ngamma beta\nbeta delta");

      expect(pressKey(view, "n")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "gamma beta", "gamma ".length));

      expect(pressKey(view, "n")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "beta delta"));

      expect(pressKey(view, "N")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "gamma beta", "gamma ".length));

      expect(pressKey(view, "n")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "beta delta"));
    } finally {
      destroyView(view);
    }
  });

  it("supports reverse Vim searches with ?", () => {
    const view = createView(["alpha beta", "gamma beta"]);

    try {
      moveCursor(view, findTextPosition(view, "gamma"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["?", "b", "e", "t", "a", "Enter"])).toEqual([true, true, true, true, true, true]);
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha beta", "alpha ".length));
    } finally {
      destroyView(view);
    }
  });

  it("searches the current word with * and #", () => {
    const forward = createView(["alpha alphabet alpha", "beta alpha"]);
    const backward = createView(["alpha beta alpha"]);

    try {
      moveCursor(forward, findTextPosition(forward, "alpha alphabet alpha"));
      pressKey(forward, "Escape");

      expect(pressKey(forward, "*")).toBe(true);
      expect(forward.state.selection.from).toBe(
        findTextPosition(forward, "alpha alphabet alpha", "alpha alphabet ".length)
      );

      expect(pressKey(forward, "n")).toBe(true);
      expect(forward.state.selection.from).toBe(findTextPosition(forward, "beta alpha", "beta ".length));

      expect(pressKey(forward, "N")).toBe(true);
      expect(forward.state.selection.from).toBe(
        findTextPosition(forward, "alpha alphabet alpha", "alpha alphabet ".length)
      );

      moveCursor(backward, findTextPosition(backward, "alpha beta alpha", "alpha beta ".length + 1));
      pressKey(backward, "Escape");

      expect(pressKey(backward, "#")).toBe(true);
      expect(backward.state.selection.from).toBe(findTextPosition(backward, "alpha beta alpha"));
    } finally {
      destroyView(forward);
      destroyView(backward);
    }
  });

  it("uses Vim searches as operator motions", () => {
    const deleteForward = createView(["alpha beta gamma"]);
    const changeBackward = createView(["alpha beta gamma"]);

    try {
      moveCursor(deleteForward, findTextPosition(deleteForward, "alpha"));
      pressKey(deleteForward, "Escape");

      expect(pressKeys(deleteForward, ["d", "/", "b", "e", "t", "a", "Enter"])).toEqual([
        true,
        true,
        true,
        true,
        true,
        true,
        true
      ]);
      expect(textContent(deleteForward)).toBe("beta gamma");

      moveCursor(changeBackward, findTextPosition(changeBackward, "gamma"));
      pressKey(changeBackward, "Escape");

      expect(pressKeys(changeBackward, ["c", "?", "b", "e", "t", "a", "Enter"])).toEqual([
        true,
        true,
        true,
        true,
        true,
        true,
        true
      ]);
      expect(getVimMode(changeBackward.state)).toBe("insert");
      expect(textContent(changeBackward)).toBe("alpha gamma");

      expect(typeText(changeBackward, "delta ")).toBe(true);
      expect(textContent(changeBackward)).toBe("alpha delta gamma");
    } finally {
      destroyView(deleteForward);
      destroyView(changeBackward);
    }
  });

  it("uses repeated searches as operator motions", () => {
    const view = createView(["alpha beta gamma beta"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["/", "b", "e", "t", "a", "Enter"])).toEqual([true, true, true, true, true, true]);
      expect(view.state.selection.from).toBe(findTextPosition(view, "alpha beta", "alpha ".length));

      expect(pressKeys(view, ["d", "n"])).toEqual([true, true]);
      expect(textContent(view)).toBe("alpha beta");
    } finally {
      destroyView(view);
    }
  });

  it("uses Vim line motions as linewise operators", () => {
    const deleteToEnd = createView(["alpha", "beta", "gamma"]);
    const deleteToStart = createView(["alpha", "beta", "gamma"]);
    const changeToEnd = createView(["alpha", "beta", "gamma"]);
    const yankToEnd = createView(["alpha", "beta", "gamma"]);

    try {
      moveCursor(deleteToEnd, findTextPosition(deleteToEnd, "beta"));
      pressKey(deleteToEnd, "Escape");

      expect(pressKeys(deleteToEnd, ["d", "G"])).toEqual([true, true]);
      expect(textContent(deleteToEnd)).toBe("alpha");

      moveCursor(deleteToStart, findTextPosition(deleteToStart, "beta"));
      pressKey(deleteToStart, "Escape");

      expect(pressKeys(deleteToStart, ["d", "g", "g"])).toEqual([true, true, true]);
      expect(textContent(deleteToStart)).toBe("gamma");

      moveCursor(changeToEnd, findTextPosition(changeToEnd, "beta"));
      pressKey(changeToEnd, "Escape");

      expect(pressKeys(changeToEnd, ["c", "G"])).toEqual([true, true]);
      expect(getVimMode(changeToEnd.state)).toBe("insert");
      expect(textContent(changeToEnd)).toBe("alpha\n");

      expect(typeText(changeToEnd, "delta")).toBe(true);
      expect(textContent(changeToEnd)).toBe("alpha\ndelta");

      moveCursor(yankToEnd, findTextPosition(yankToEnd, "beta"));
      pressKey(yankToEnd, "Escape");

      expect(pressKeys(yankToEnd, ["y", "G"])).toEqual([true, true]);
      expect(pressKey(yankToEnd, "p")).toBe(true);
      expect(textContent(yankToEnd)).toBe("alpha\nbeta\nbeta\ngamma\ngamma");
    } finally {
      destroyView(deleteToEnd);
      destroyView(deleteToStart);
      destroyView(changeToEnd);
      destroyView(yankToEnd);
    }
  });

  it("uses % as a Vim operator motion", () => {
    const view = createView(["alpha (beta) gamma"]);
    const backward = createView(["alpha (beta) gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "(") + 1);
      pressKey(view, "Escape");

      expect(pressKeys(view, ["d", "%"])).toEqual([true, true]);
      expect(textContent(view)).toBe("alpha  gamma");

      moveCursor(backward, findTextPosition(backward, ")") + 1);
      pressKey(backward, "Escape");

      expect(pressKeys(backward, ["d", "%"])).toEqual([true, true]);
      expect(textContent(backward)).toBe("alpha  gamma");
    } finally {
      destroyView(view);
      destroyView(backward);
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

  it("yanks whole text blocks with Y", () => {
    const single = createView(["alpha", "beta"]);
    const counted = createView(["alpha", "beta", "gamma"]);

    try {
      moveCursor(single, findTextPosition(single, "alpha"));
      pressKey(single, "Escape");

      expect(pressKey(single, "Y")).toBe(true);
      expect(textContent(single)).toBe("alpha\nbeta");
      expect(pressKey(single, "j")).toBe(true);
      expect(pressKey(single, "p")).toBe(true);
      expect(textContent(single)).toBe("alpha\nbeta\nalpha");

      moveCursor(counted, findTextPosition(counted, "alpha"));
      pressKey(counted, "Escape");

      expect(pressKeys(counted, ["2", "Y"])).toEqual([true, true]);
      expect(pressKey(counted, "G")).toBe(true);
      expect(pressKey(counted, "p")).toBe(true);
      expect(textContent(counted)).toBe("alpha\nbeta\ngamma\nalpha\nbeta");
    } finally {
      destroyView(single);
      destroyView(counted);
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

  it("repeats normal-mode changes with .", () => {
    const characterDelete = createView(["abcdef"]);
    const wordDelete = createView(["alpha beta gamma"]);
    const lineDelete = createView(["alpha", "beta", "gamma"]);
    const replace = createView(["alpha"]);
    const paste = createView(["alpha", "beta"]);
    const join = createView(["alpha", "beta", "gamma"]);
    const insertEdit = createView(["abcd"]);

    try {
      moveCursor(characterDelete, findTextPosition(characterDelete, "abcdef"));
      pressKey(characterDelete, "Escape");

      expect(pressKeys(characterDelete, ["2", "x"])).toEqual([true, true]);
      expect(textContent(characterDelete)).toBe("cdef");
      expect(pressKey(characterDelete, ".")).toBe(true);
      expect(textContent(characterDelete)).toBe("ef");

      moveCursor(wordDelete, findTextPosition(wordDelete, "alpha"));
      pressKey(wordDelete, "Escape");

      expect(pressKeys(wordDelete, ["d", "w"])).toEqual([true, true]);
      expect(textContent(wordDelete)).toBe("beta gamma");
      expect(pressKey(wordDelete, ".")).toBe(true);
      expect(textContent(wordDelete)).toBe("gamma");

      moveCursor(lineDelete, findTextPosition(lineDelete, "alpha"));
      pressKey(lineDelete, "Escape");

      expect(pressKeys(lineDelete, ["d", "d"])).toEqual([true, true]);
      expect(textContent(lineDelete)).toBe("beta\ngamma");
      expect(pressKey(lineDelete, ".")).toBe(true);
      expect(textContent(lineDelete)).toBe("gamma");

      moveCursor(replace, findTextPosition(replace, "alpha"));
      pressKey(replace, "Escape");

      expect(pressKeys(replace, ["r", "X"])).toEqual([true, true]);
      expect(textContent(replace)).toBe("Xlpha");
      expect(pressKey(replace, "l")).toBe(true);
      expect(pressKey(replace, ".")).toBe(true);
      expect(textContent(replace)).toBe("XXpha");

      moveCursor(paste, findTextPosition(paste, "alpha"));
      pressKey(paste, "Escape");

      expect(pressKeys(paste, ["y", "y"])).toEqual([true, true]);
      expect(pressKey(paste, "j")).toBe(true);
      expect(pressKey(paste, "p")).toBe(true);
      expect(textContent(paste)).toBe("alpha\nbeta\nalpha");
      expect(pressKey(paste, ".")).toBe(true);
      expect(textContent(paste)).toBe("alpha\nbeta\nalpha\nalpha");

      moveCursor(join, findTextPosition(join, "alpha"));
      pressKey(join, "Escape");

      expect(pressKey(join, "J")).toBe(true);
      expect(textContent(join)).toBe("alpha beta\ngamma");
      expect(pressKey(join, ".")).toBe(true);
      expect(textContent(join)).toBe("alpha beta gamma");

      moveCursor(insertEdit, findTextPosition(insertEdit, "abcd"));
      pressKey(insertEdit, "Escape");

      expect(pressKey(insertEdit, "x")).toBe(true);
      expect(textContent(insertEdit)).toBe("bcd");
      expect(pressKey(insertEdit, "i")).toBe(true);
      expect(typeText(insertEdit, "Z")).toBe(true);
      expect(textContent(insertEdit)).toBe("Zbcd");
      expect(pressKey(insertEdit, "Escape")).toBe(true);
      expect(pressKey(insertEdit, ".")).toBe(true);
      expect(textContent(insertEdit)).toBe("ZZbcd");
    } finally {
      destroyView(characterDelete);
      destroyView(wordDelete);
      destroyView(lineDelete);
      destroyView(replace);
      destroyView(paste);
      destroyView(join);
      destroyView(insertEdit);
    }
  });

  it("repeats insert-text changes with .", () => {
    const view = createView(["alpha beta gamma"]);

    try {
      moveCursor(view, findTextPosition(view, "alpha"));
      pressKey(view, "Escape");

      expect(pressKeys(view, ["c", "w"])).toEqual([true, true]);
      expect(getVimMode(view.state)).toBe("insert");
      expect(typeText(view, "X")).toBe(true);
      expect(textContent(view)).toBe("X beta gamma");
      expect(pressKey(view, "Escape")).toBe(true);

      expect(pressKey(view, "w")).toBe(true);
      expect(view.state.selection.from).toBe(findTextPosition(view, "beta"));
      expect(pressKey(view, ".")).toBe(true);
      expect(getVimMode(view.state)).toBe("normal");
      expect(textContent(view)).toBe("X X gamma");
    } finally {
      destroyView(view);
    }
  });

  it("repeats plain insert commands with .", () => {
    const append = createView(["alpha", "beta"]);
    const openLine = createView(["alpha"]);

    try {
      moveCursor(append, findTextPosition(append, "alpha"));
      pressKey(append, "Escape");

      expect(pressKey(append, "A")).toBe(true);
      expect(typeText(append, "!")).toBe(true);
      expect(textContent(append)).toBe("alpha!\nbeta");
      expect(pressKey(append, "Escape")).toBe(true);

      expect(pressKey(append, "j")).toBe(true);
      expect(pressKey(append, ".")).toBe(true);
      expect(textContent(append)).toBe("alpha!\nbeta!");

      moveCursor(openLine, findTextPosition(openLine, "alpha"));
      pressKey(openLine, "Escape");

      expect(pressKey(openLine, "o")).toBe(true);
      expect(typeText(openLine, "beta")).toBe(true);
      expect(textContent(openLine)).toBe("alpha\nbeta");
      expect(pressKey(openLine, "Escape")).toBe(true);

      expect(pressKey(openLine, ".")).toBe(true);
      expect(textContent(openLine)).toBe("alpha\nbeta\nbeta");
    } finally {
      destroyView(append);
      destroyView(openLine);
    }
  });

  it("applies Vim counts to direct insert text changes", () => {
    const insert = createView(["alpha"]);
    const append = createView(["alpha"]);
    const repeat = createView(["alpha"]);

    try {
      moveCursor(insert, findTextPosition(insert, "alpha"));
      pressKey(insert, "Escape");

      expect(pressKeys(insert, ["3", "i"])).toEqual([true, true]);
      expect(typeText(insert, "X")).toBe(true);
      expect(pressKey(insert, "Escape")).toBe(true);
      expect(textContent(insert)).toBe("XXXalpha");
      expect(insert.state.selection.from).toBe(findTextPosition(insert, "XXXalpha", 2));

      moveCursor(append, findTextPosition(append, "alpha"));
      pressKey(append, "Escape");

      expect(pressKeys(append, ["2", "A"])).toEqual([true, true]);
      expect(typeText(append, "!")).toBe(true);
      expect(pressKey(append, "Escape")).toBe(true);
      expect(textContent(append)).toBe("alpha!!");

      moveCursor(repeat, findTextPosition(repeat, "alpha"));
      pressKey(repeat, "Escape");

      expect(pressKeys(repeat, ["3", "i"])).toEqual([true, true]);
      expect(typeText(repeat, "X")).toBe(true);
      expect(pressKey(repeat, "Escape")).toBe(true);
      expect(pressKey(repeat, ".")).toBe(true);
      expect(textContent(repeat)).toBe("XXXXXXalpha");
    } finally {
      destroyView(insert);
      destroyView(append);
      destroyView(repeat);
    }
  });

  it("applies Vim counts to open-line insert changes", () => {
    const openBelow = createView(["alpha"]);
    const openAbove = createView(["alpha"]);
    const repeat = createView(["alpha"]);

    try {
      moveCursor(openBelow, findTextPosition(openBelow, "alpha"));
      pressKey(openBelow, "Escape");

      expect(pressKeys(openBelow, ["3", "o"])).toEqual([true, true]);
      expect(typeText(openBelow, "beta")).toBe(true);
      expect(pressKey(openBelow, "Escape")).toBe(true);
      expect(textContent(openBelow)).toBe("alpha\nbeta\nbeta\nbeta");

      moveCursor(openAbove, findTextPosition(openAbove, "alpha"));
      pressKey(openAbove, "Escape");

      expect(pressKeys(openAbove, ["2", "O"])).toEqual([true, true]);
      expect(typeText(openAbove, "beta")).toBe(true);
      expect(pressKey(openAbove, "Escape")).toBe(true);
      expect(textContent(openAbove)).toBe("beta\nbeta\nalpha");

      moveCursor(repeat, findTextPosition(repeat, "alpha"));
      pressKey(repeat, "Escape");

      expect(pressKeys(repeat, ["2", "o"])).toEqual([true, true]);
      expect(typeText(repeat, "beta")).toBe(true);
      expect(pressKey(repeat, "Escape")).toBe(true);
      expect(pressKey(repeat, ".")).toBe(true);
      expect(textContent(repeat)).toBe("alpha\nbeta\nbeta\nbeta\nbeta");
    } finally {
      destroyView(openBelow);
      destroyView(openAbove);
      destroyView(repeat);
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
