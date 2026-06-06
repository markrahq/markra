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
});
