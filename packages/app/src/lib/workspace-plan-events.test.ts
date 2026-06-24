import {
  workspaceChangePlanFromToolResult,
  workspacePlanEventsFromToolResult
} from "./workspace-plan-events";

describe("workspace plan visual events", () => {
  it("converts prepared workspace change details into runner events", () => {
    const events = workspacePlanEventsFromToolResult({
      details: {
        changes: [
          {
            content: "# Alpha",
            label: "Create note: topics/alpha.md",
            path: "topics/alpha.md",
            type: "create_note"
          },
          {
            label: "Move note: docs/guide.md -> archive/guide.md",
            from: "docs/guide.md",
            to: "archive/guide.md",
            type: "move_note"
          },
          {
            label: "Add tags: current.md",
            path: "current.md",
            tags: ["alpha", "planning"],
            type: "add_tags"
          }
        ],
        count: 3,
        summary: "Organize synthetic notes."
      }
    });

    expect(events.map((event) => event.type)).toEqual([
      "plan_validating",
      "step_started",
      "step_previewed",
      "step_started",
      "step_previewed",
      "step_started",
      "step_previewed"
    ]);
    expect(events[1]).toEqual(expect.objectContaining({
      action: "create_note",
      index: 0,
      path: "topics/alpha.md",
      target: "file_tree"
    }));
    expect(events[2]).toEqual(expect.objectContaining({
      afterContent: "# Alpha",
      label: "Create note: topics/alpha.md"
    }));
    expect(events[4]).toEqual(expect.objectContaining({
      from: "docs/guide.md",
      to: "archive/guide.md",
      target: "file_tree"
    }));
    expect(events[6]).toEqual(expect.objectContaining({
      afterContent: "Tags: alpha, planning",
      path: "current.md",
      target: "editor"
    }));
  });

  it("ignores non-plan tool results", () => {
    expect(workspacePlanEventsFromToolResult({
      details: {
        count: 2
      }
    })).toEqual([]);
  });

  it("extracts an executable workspace change plan from prepared tool details", () => {
    expect(workspaceChangePlanFromToolResult({
      details: {
        changes: [
          {
            content: "",
            label: "Create note: topics/empty.md",
            path: "topics/empty.md",
            reason: "Synthetic empty note.",
            type: "create_note"
          },
          {
            label: "Add links: current.md",
            links: ["[[topics/empty]]"],
            path: "current.md",
            type: "add_links"
          }
        ],
        summary: "Organize synthetic notes."
      }
    })).toEqual({
      changes: [
        {
          content: "",
          label: "Create note: topics/empty.md",
          path: "topics/empty.md",
          reason: "Synthetic empty note.",
          type: "create_note"
        },
        {
          label: "Add links: current.md",
          links: ["[[topics/empty]]"],
          path: "current.md",
          type: "add_links"
        }
      ],
      summary: "Organize synthetic notes."
    });
  });
});
