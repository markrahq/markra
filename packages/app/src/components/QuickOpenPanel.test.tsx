import { fireEvent, render, screen, within } from "@testing-library/react";
import type { NativeMarkdownFolderFile } from "../lib/tauri";
import { QuickOpenPanel } from "./QuickOpenPanel";

const files = [
  {
    name: "daily-notes.md",
    path: "/mock-vault/daily-notes.md",
    relativePath: "daily-notes.md"
  },
  {
    name: "meeting-notes.md",
    path: "/mock-vault/work/meeting-notes.md",
    relativePath: "work/meeting-notes.md"
  }
] satisfies NativeMarkdownFolderFile[];

const manyFiles = Array.from({ length: 12 }, (_, index) => {
  const sequence = String(index + 1).padStart(2, "0");

  return {
    name: `note-${sequence}.md`,
    path: `/mock-vault/note-${sequence}.md`,
    relativePath: `note-${sequence}.md`
  };
}) satisfies NativeMarkdownFolderFile[];

describe("QuickOpenPanel", () => {
  it("opens the keyboard-selected file", () => {
    const openFile = vi.fn();

    render(
      <QuickOpenPanel
        files={files}
        language="en"
        onClose={() => {}}
        onOpenFile={openFile}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Quick open" });
    const input = within(dialog).getByRole("searchbox", { name: "Quick open" });

    fireEvent.change(input, { target: { value: "notes" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(openFile).toHaveBeenCalledWith(files[1], { toSide: false });
  });

  it("scrolls the keyboard-selected file into view", () => {
    render(
      <QuickOpenPanel
        files={files}
        language="en"
        onClose={() => {}}
        onOpenFile={() => {}}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Quick open" });
    const input = within(dialog).getByRole("searchbox", { name: "Quick open" });
    const options = within(dialog).getAllByRole("option");
    const scrollIntoView = vi.fn();
    options[1].scrollIntoView = scrollIntoView;

    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("keeps keyboard selection when scrolling emits mouse movement under a stationary pointer", () => {
    const openFile = vi.fn();

    render(
      <QuickOpenPanel
        files={manyFiles}
        language="en"
        onClose={() => {}}
        onOpenFile={openFile}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Quick open" });
    const input = within(dialog).getByRole("searchbox", { name: "Quick open" });
    const options = within(dialog).getAllByRole("option");

    for (let index = 1; index < manyFiles.length; index += 1) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    }
    fireEvent.mouseMove(options[manyFiles.length - 3]);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(openFile).toHaveBeenCalledWith(manyFiles.at(-1), { toSide: false });
  });

  it("opens a clicked result independently from keyboard selection", () => {
    const openFile = vi.fn();

    render(
      <QuickOpenPanel
        files={files}
        language="en"
        onClose={() => {}}
        onOpenFile={openFile}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Quick open" });
    const input = within(dialog).getByRole("searchbox", { name: "Quick open" });
    const options = within(dialog).getAllByRole("option");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.mouseMove(options[0]);
    fireEvent.click(within(options[0]).getAllByRole("button")[0]);

    expect(openFile).toHaveBeenCalledWith(files[0], { toSide: false });
  });
});
