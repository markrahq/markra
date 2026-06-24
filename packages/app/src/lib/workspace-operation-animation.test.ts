import {
  workspaceOperationRevealPaths,
  type WorkspaceOperationAnimationEvent
} from "./workspace-operation-animation";

describe("workspaceOperationRevealPaths", () => {
  it("returns active file-tree target paths while a workspace operation is applying", () => {
    const events: WorkspaceOperationAnimationEvent[] = [
      {
        totalSteps: 1,
        type: "operation_started"
      },
      {
        action: "create_note",
        index: 0,
        label: "Create note: notes/new.md",
        path: "notes/new.md",
        target: "file_tree",
        type: "step_started"
      }
    ];

    expect(workspaceOperationRevealPaths(events, "applying")).toEqual(["notes/new.md"]);
  });

  it("does not keep file-tree reveal paths after the operation leaves the applying state", () => {
    const events: WorkspaceOperationAnimationEvent[] = [
      {
        totalSteps: 1,
        type: "operation_started"
      },
      {
        action: "move_note",
        from: "drafts/example.md",
        index: 0,
        label: "Move note: drafts/example.md -> notes/example.md",
        target: "file_tree",
        to: "notes/example.md",
        type: "step_applied"
      }
    ];

    expect(workspaceOperationRevealPaths(events, "applied")).toEqual([]);
  });
});
