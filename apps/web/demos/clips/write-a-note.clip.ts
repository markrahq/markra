import { clip } from "versioncam";

// Writes a short note over the welcome document, inserts a table from the
// slash menu, and walks the editor's view modes: Source, Split, and back to
// the formatted page.
export default clip(
  "write-a-note",
  { title: "Write a note, add a table, switch views", seed: 11 },
  async (s) => {
    await s.open("/");
    s.caption("Markra formats Markdown as you type");
    await s.hold(800);

    // Replace the welcome document with a new note.
    await s.click(s.byText("Reveal AI actions only around selected text"));
    await s.press("Meta+a");
    await s.type("# Packing list\n");
    await s.type("- Passport\nCharger\nRain jacket\n\n");
    await s.settle({ label: "note typed" });
    await s.hold(900);

    // The slash menu, narrowed to its Table entry.
    await s.type("/");
    await s.hold(500);
    await s.type("table");
    await s.settle({ label: "table command" });
    await s.hold(700);

    // Enter inserts the table; Tab moves from cell to cell.
    await s.press("Enter");
    await s.type("Day");
    await s.press("Tab");
    await s.type("City");
    await s.press("Tab");
    await s.type("Mon");
    await s.press("Tab");
    await s.type("Lisbon");
    await s.settle({ label: "table filled" });
    await s.hold(1000);

    // The view mode button cycles Preview, Source and Split.
    s.caption("Switch between the formatted page and its Markdown source");
    const viewMode = s.byRole("button", { name: "Editor view mode" });
    await s.click(viewMode);
    // The source editor is loaded on demand, behind a placeholder of grey
    // lines. Markra preloads it when the browser is idle, which a full
    // recording rarely is, so without this the beat can land on the
    // placeholder.
    await s.settle({
      label: "source mode",
      hook: async () => (await s.page.locator('[data-editor-engine="source-loading"]').count()) === 0,
    });
    await s.hold(1400);

    await s.click(viewMode);
    await s.settle({ label: "split view" });
    await s.hold(1400);

    await s.click(viewMode);
    await s.settle({ label: "back to preview" });
    await s.hold(400);
    await s.moveTo([1180, 640]);
    await s.hold(1000);
  },
);
