import { applyWorkspaceChangePlan, type WorkspacePlanVisualEvent } from "./workspace-change-plan";
import type { AgentWorkspaceFile } from "./read-only-tools";

const workspaceFiles: AgentWorkspaceFile[] = [
  {
    name: "current.md",
    path: "/vault/current.md",
    relativePath: "current.md"
  },
  {
    name: "guide.md",
    path: "/vault/docs/guide.md",
    relativePath: "docs/guide.md"
  }
];

describe("workspace change plan executor", () => {
  it("creates notes and writes full-note updates through confirmed operations", async () => {
    const createFile = vi.fn(async () => {});
    const readFile = vi.fn(async () => "# Current\n\nOld body.");
    const writeFile = vi.fn(async () => {});
    const moveFile = vi.fn(async () => {});

    const result = await applyWorkspaceChangePlan({
      changes: [
        {
          content: "# Alpha\n\nSynthetic note.",
          path: "topics/alpha.md",
          type: "create_note"
        },
        {
          content: "# Current\n\nUpdated body.",
          path: "current.md",
          type: "update_note"
        }
      ],
      summary: "Apply a confirmed organization plan."
    }, {
      operations: {
        createFile,
        moveFile,
        readFile,
        writeFile
      },
      workspaceFiles
    });

    expect(createFile).toHaveBeenCalledWith("topics/alpha.md", "# Alpha\n\nSynthetic note.");
    expect(readFile).toHaveBeenCalledWith(workspaceFiles[0]);
    expect(writeFile).toHaveBeenCalledWith(workspaceFiles[0], "# Current\n\nUpdated body.");
    expect(moveFile).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      count: 2,
      summary: "Apply a confirmed organization plan."
    }));
    expect(result.journal.changes).toEqual([
      expect.objectContaining({
        afterContent: "# Alpha\n\nSynthetic note.",
        path: "topics/alpha.md",
        type: "create_note"
      }),
      expect.objectContaining({
        afterContent: "# Current\n\nUpdated body.",
        beforeContent: "# Current\n\nOld body.",
        path: "current.md",
        type: "update_note"
      })
    ]);
  });

  it("emits visual events that can drive an AI operation overlay", async () => {
    const events: WorkspacePlanVisualEvent[] = [];
    const createFile = vi.fn(async () => {});
    const readFile = vi.fn(async () => "# Current\n\nOld body.");
    const writeFile = vi.fn(async () => {});
    const moveFile = vi.fn(async () => {});

    await applyWorkspaceChangePlan({
      changes: [
        {
          content: "# Alpha",
          path: "topics/alpha.md",
          type: "create_note"
        },
        {
          content: "# Current\n\nUpdated body.",
          path: "current.md",
          type: "update_note"
        }
      ]
    }, {
      onVisualEvent: (event) => events.push(event),
      operations: {
        createFile,
        moveFile,
        readFile,
        writeFile
      },
      workspaceFiles
    });

    expect(events.map((event) => event.type)).toEqual([
      "plan_validating",
      "step_started",
      "step_previewed",
      "step_applied",
      "step_started",
      "step_previewed",
      "step_applied",
      "plan_completed"
    ]);
    expect(events[1]).toEqual(expect.objectContaining({
      action: "create_note",
      index: 0,
      path: "topics/alpha.md",
      target: "file_tree"
    }));
    expect(events[2]).toEqual(expect.objectContaining({
      afterContent: "# Alpha",
      action: "create_note",
      index: 0,
      path: "topics/alpha.md"
    }));
    expect(events[4]).toEqual(expect.objectContaining({
      action: "update_note",
      index: 1,
      path: "current.md",
      target: "editor"
    }));
    expect(events[5]).toEqual(expect.objectContaining({
      afterContent: "# Current\n\nUpdated body.",
      beforeContent: "# Current\n\nOld body.",
      path: "current.md"
    }));
  });

  it("emits a failed visual event before rethrowing apply errors", async () => {
    const events: WorkspacePlanVisualEvent[] = [];
    const createFile = vi.fn(async () => {
      throw new Error("Disk unavailable");
    });
    const readFile = vi.fn(async () => "");
    const writeFile = vi.fn(async () => {});
    const moveFile = vi.fn(async () => {});

    await expect(applyWorkspaceChangePlan({
      changes: [
        {
          content: "# Alpha",
          path: "topics/alpha.md",
          type: "create_note"
        }
      ]
    }, {
      onVisualEvent: (event) => events.push(event),
      operations: {
        createFile,
        moveFile,
        readFile,
        writeFile
      },
      workspaceFiles
    })).rejects.toThrow("Disk unavailable");

    expect(events.map((event) => event.type)).toEqual([
      "plan_validating",
      "step_started",
      "step_previewed",
      "step_failed"
    ]);
    expect(events[3]).toEqual(expect.objectContaining({
      action: "create_note",
      error: "Disk unavailable",
      index: 0,
      path: "topics/alpha.md"
    }));
  });

  it("does not let visual event observers block file execution", async () => {
    const createFile = vi.fn(async () => {});
    const readFile = vi.fn(async () => "");
    const writeFile = vi.fn(async () => {});
    const moveFile = vi.fn(async () => {});

    await expect(applyWorkspaceChangePlan({
      changes: [
        {
          content: "# Alpha",
          path: "topics/alpha.md",
          type: "create_note"
        }
      ]
    }, {
      onVisualEvent: () => {
        throw new Error("Overlay unavailable");
      },
      operations: {
        createFile,
        moveFile,
        readFile,
        writeFile
      },
      workspaceFiles
    })).resolves.toEqual(expect.objectContaining({
      count: 1
    }));

    expect(createFile).toHaveBeenCalledWith("topics/alpha.md", "# Alpha");
  });

  it("adds missing tags and related links without duplicating existing values", async () => {
    const createFile = vi.fn(async () => {});
    const readFile = vi.fn(async () => [
      "---",
      "title: Current",
      "tags:",
      "  - existing",
      "---",
      "",
      "# Current",
      "",
      "Body with [[Alpha]] already linked."
    ].join("\n"));
    const writeFile = vi.fn(async () => {});
    const moveFile = vi.fn(async () => {});

    await applyWorkspaceChangePlan({
      changes: [
        {
          path: "current.md",
          tags: ["existing", "alpha"],
          type: "add_tags"
        },
        {
          links: ["[[Alpha]]", "[Guide](./docs/guide.md)"],
          path: "current.md",
          type: "add_links"
        }
      ]
    }, {
      operations: {
        createFile,
        moveFile,
        readFile,
        writeFile
      },
      workspaceFiles
    });

    expect(writeFile).toHaveBeenNthCalledWith(1, workspaceFiles[0], [
      "---",
      "title: Current",
      "tags:",
      "  - existing",
      "  - alpha",
      "---",
      "",
      "# Current",
      "",
      "Body with [[Alpha]] already linked."
    ].join("\n"));
    expect(writeFile).toHaveBeenNthCalledWith(2, workspaceFiles[0], [
      "---",
      "title: Current",
      "tags:",
      "  - existing",
      "  - alpha",
      "---",
      "",
      "# Current",
      "",
      "Body with [[Alpha]] already linked.",
      "",
      "## Related",
      "",
      "- [Guide](./docs/guide.md)"
    ].join("\n"));
    expect(createFile).not.toHaveBeenCalled();
    expect(moveFile).not.toHaveBeenCalled();
  });

  it("moves notes only after validating selected plan entries", async () => {
    const createFile = vi.fn(async () => {});
    const readFile = vi.fn(async () => "");
    const writeFile = vi.fn(async () => {});
    const moveFile = vi.fn(async () => {});

    const result = await applyWorkspaceChangePlan({
      changes: [
        {
          from: "docs/guide.md",
          to: "archive/guide.md",
          type: "move_note"
        },
        {
          from: "current.md",
          to: "docs/current-renamed.md",
          type: "rename_note"
        }
      ]
    }, {
      operations: {
        createFile,
        moveFile,
        readFile,
        writeFile
      },
      selectedChangeIndexes: [1],
      workspaceFiles
    });

    expect(moveFile).toHaveBeenCalledTimes(1);
    expect(moveFile).toHaveBeenCalledWith(workspaceFiles[0], "docs/current-renamed.md");
    expect(createFile).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(result.journal.changes).toEqual([
      expect.objectContaining({
        from: "current.md",
        to: "docs/current-renamed.md",
        type: "rename_note"
      })
    ]);
  });

  it("rejects duplicate target paths before touching files", async () => {
    const createFile = vi.fn(async () => {});
    const readFile = vi.fn(async () => "");
    const writeFile = vi.fn(async () => {});
    const moveFile = vi.fn(async () => {});

    await expect(applyWorkspaceChangePlan({
      changes: [
        {
          content: "# Alpha",
          path: "topics/alpha.md",
          type: "create_note"
        },
        {
          from: "current.md",
          to: "topics/alpha.md",
          type: "move_note"
        }
      ]
    }, {
      operations: {
        createFile,
        moveFile,
        readFile,
        writeFile
      },
      workspaceFiles
    })).rejects.toThrow("Workspace change path \"topics/alpha.md\" is targeted by more than one change.");

    expect(createFile).not.toHaveBeenCalled();
    expect(moveFile).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });
});
