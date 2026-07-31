import type { AgentWorkspaceFile } from "./read-only-tools";
import {
  buildWorkspaceCustomizationPrompt,
  loadWorkspaceCustomization
} from "./customization";

const workspaceRoot = "/mock-vault";

function workspaceFile(
  relativePath: string,
  metadata: { modifiedAt?: number; sizeBytes?: number } = {}
): AgentWorkspaceFile {
  return {
    ...metadata,
    name: relativePath.split("/").at(-1) ?? relativePath,
    path: `${workspaceRoot}/${relativePath}`,
    relativePath
  } as AgentWorkspaceFile;
}

describe("workspace AI customization", () => {
  it("loads AGENTS.md from the workspace root to the current document directory with override precedence", async () => {
    const files = [
      workspaceFile("AGENTS.md"),
      workspaceFile("docs/AGENTS.md"),
      workspaceFile("docs/AGENTS.override.md"),
      workspaceFile("docs/guides/AGENTS.md"),
      workspaceFile("other/AGENTS.md")
    ];
    const contents = new Map([
      [`${workspaceRoot}/AGENTS.md`, "# Root rules\nUse synthetic examples."],
      [`${workspaceRoot}/docs/AGENTS.md`, "# Ignored docs rules"],
      [`${workspaceRoot}/docs/AGENTS.override.md`, "# Docs override\nKeep guides concise."],
      [`${workspaceRoot}/docs/guides/AGENTS.md`, "# Guide rules\nPrefer short sections."],
      [`${workspaceRoot}/other/AGENTS.md`, "# Unrelated rules"]
    ]);
    const readWorkspaceFile = vi.fn(async (path: string) => contents.get(path) ?? "");

    const customization = await loadWorkspaceCustomization({
      documentPath: `${workspaceRoot}/docs/guides/example.md`,
      prompt: "Review this guide",
      readWorkspaceFile,
      workspaceFiles: files
    });

    expect(customization.instructions).toEqual([
      {
        content: "# Root rules\nUse synthetic examples.",
        path: `${workspaceRoot}/AGENTS.md`,
        relativePath: "AGENTS.md"
      },
      {
        content: "# Docs override\nKeep guides concise.",
        path: `${workspaceRoot}/docs/AGENTS.override.md`,
        relativePath: "docs/AGENTS.override.md"
      },
      {
        content: "# Guide rules\nPrefer short sections.",
        path: `${workspaceRoot}/docs/guides/AGENTS.md`,
        relativePath: "docs/guides/AGENTS.md"
      }
    ]);
    expect(readWorkspaceFile).not.toHaveBeenCalledWith(`${workspaceRoot}/docs/AGENTS.md`);
    expect(readWorkspaceFile).not.toHaveBeenCalledWith(`${workspaceRoot}/other/AGENTS.md`);
  });

  it("discovers standard repo skills in active directories and loads explicitly mentioned skills", async () => {
    const files = [
      workspaceFile(".agents/skills/concise/SKILL.md"),
      workspaceFile("docs/.agents/skills/research/SKILL.md"),
      workspaceFile("other/.agents/skills/unrelated/SKILL.md"),
      workspaceFile(".agents/skills/invalid/SKILL.md")
    ];
    const contents = new Map([
      [
        `${workspaceRoot}/.agents/skills/concise/SKILL.md`,
        [
          "---",
          "name: concise",
          "description: Tighten prose while preserving meaning. Use for concise rewrites.",
          "---",
          "",
          "# Concise writing",
          "",
          "Remove repetition before changing structure."
        ].join("\n")
      ],
      [
        `${workspaceRoot}/docs/.agents/skills/research/SKILL.md`,
        [
          "---",
          "name: research",
          "description: >",
          "  Compare workspace notes",
          "  and summarize evidence.",
          "---",
          "",
          "# Research",
          "",
          "Cite the note path for every claim."
        ].join("\n")
      ],
      [
        `${workspaceRoot}/other/.agents/skills/unrelated/SKILL.md`,
        "---\nname: unrelated\ndescription: Should not be visible here.\n---\nIgnore."
      ],
      [
        `${workspaceRoot}/.agents/skills/invalid/SKILL.md`,
        "---\nname: wrong-name\ndescription: Invalid because the directory differs.\n---\nIgnore."
      ]
    ]);

    const customization = await loadWorkspaceCustomization({
      documentPath: `${workspaceRoot}/docs/example.md`,
      prompt: "请用$concise处理这篇草稿",
      readWorkspaceFile: async (path) => contents.get(path) ?? "",
      workspaceFiles: files
    });

    expect(customization.skills).toEqual([
      {
        description: "Tighten prose while preserving meaning. Use for concise rewrites.",
        name: "concise",
        path: `${workspaceRoot}/.agents/skills/concise/SKILL.md`,
        relativePath: ".agents/skills/concise/SKILL.md"
      },
      {
        description: "Compare workspace notes and summarize evidence.",
        name: "research",
        path: `${workspaceRoot}/docs/.agents/skills/research/SKILL.md`,
        relativePath: "docs/.agents/skills/research/SKILL.md"
      }
    ]);
    expect(customization.activeSkills).toEqual([
      expect.objectContaining({
        content: expect.stringContaining("Remove repetition before changing structure."),
        name: "concise",
        relativePath: ".agents/skills/concise/SKILL.md"
      })
    ]);
  });

  it("uses complete YAML parsing for folded frontmatter values", async () => {
    const skill = workspaceFile(".agents/skills/folded/SKILL.md");
    const customization = await loadWorkspaceCustomization({
      documentPath: `${workspaceRoot}/draft.md`,
      prompt: "$folded",
      readWorkspaceFile: async () => [
        "---",
        "name: folded",
        "description: >-",
        "  Tighten synthetic prose:",
        "  preserve every qualifier.",
        "metadata:",
        "  version: 1",
        "---",
        "Apply the folded instructions."
      ].join("\n"),
      workspaceFiles: [skill]
    });

    expect(customization.skills).toEqual([
      expect.objectContaining({
        description: "Tighten synthetic prose: preserve every qualifier.",
        name: "folded"
      })
    ]);
    expect(customization.activeSkills).toHaveLength(1);
  });

  it("deduplicates skill names to the closest active scope", async () => {
    const rootSkill = workspaceFile(".agents/skills/concise/SKILL.md");
    const nestedSkill = workspaceFile("docs/.agents/skills/concise/SKILL.md");
    const contents = new Map([
      [
        rootSkill.path,
        "---\nname: concise\ndescription: Root concise instructions.\n---\nUse the root version."
      ],
      [
        nestedSkill.path,
        "---\nname: concise\ndescription: Docs concise instructions.\n---\nUse the docs version."
      ]
    ]);
    const customization = await loadWorkspaceCustomization({
      documentPath: `${workspaceRoot}/docs/draft.md`,
      prompt: "$concise",
      readWorkspaceFile: async (path) => contents.get(path) ?? "",
      workspaceFiles: [rootSkill, nestedSkill]
    });

    expect(customization.skills).toEqual([
      expect.objectContaining({
        description: "Docs concise instructions.",
        name: "concise",
        relativePath: "docs/.agents/skills/concise/SKILL.md"
      })
    ]);
    expect(customization.activeSkills[0]?.content).toContain("Use the docs version.");
  });

  it("caps active skills by mention order, count, and aggregate content size", async () => {
    const names = ["alpha", "beta", "gamma", "delta"];
    const files = names.map((name) => workspaceFile(`.agents/skills/${name}/SKILL.md`));
    const contents = new Map(files.map((file, index) => [
      file.path,
      [
        "---",
        `name: ${names[index]}`,
        `description: Synthetic ${names[index]} workflow.`,
        "---",
        String(index).repeat(12_000)
      ].join("\n")
    ]));
    const customization = await loadWorkspaceCustomization({
      documentPath: `${workspaceRoot}/draft.md`,
      prompt: "$delta $beta $alpha $gamma",
      readWorkspaceFile: async (path) => contents.get(path) ?? "",
      workspaceFiles: files
    });

    expect(customization.activeSkills.map((skill) => skill.name)).toEqual(["delta", "beta", "alpha"]);
    expect(customization.activeSkills.reduce((total, skill) => total + skill.content.length, 0)).toBeLessThanOrEqual(32_000);
  });

  it("reuses cached skill metadata until the file fingerprint changes", async () => {
    const skillPath = ".agents/skills/cached/SKILL.md";
    const contents = {
      current: "---\nname: cached\ndescription: First cached description.\n---\nCached body."
    };
    const readWorkspaceFile = vi.fn(async () => contents.current);
    const load = (modifiedAt: number) => loadWorkspaceCustomization({
      documentPath: `${workspaceRoot}/draft.md`,
      prompt: "",
      readWorkspaceFile,
      workspaceFiles: [
        workspaceFile(skillPath, {
          modifiedAt,
          sizeBytes: contents.current.length
        })
      ]
    });

    await load(100);
    const cached = await load(100);
    expect(cached.skills[0]?.description).toBe("First cached description.");
    expect(readWorkspaceFile).toHaveBeenCalledTimes(1);

    contents.current = "---\nname: cached\ndescription: Updated cached description.\n---\nUpdated body.";
    const updated = await load(200);
    expect(updated.skills[0]?.description).toBe("Updated cached description.");
    expect(readWorkspaceFile).toHaveBeenCalledTimes(2);
  });

  it("formats project instructions, skill metadata, and active skill content for the system prompt", async () => {
    const files = [
      workspaceFile("AGENTS.md"),
      workspaceFile(".agents/skills/concise/SKILL.md")
    ];
    const contents = new Map([
      [`${workspaceRoot}/AGENTS.md`, "Preserve the author's terminology."],
      [
        `${workspaceRoot}/.agents/skills/concise/SKILL.md`,
        "---\nname: concise\ndescription: Make prose concise.\n---\nKeep every factual qualifier."
      ]
    ]);
    const customization = await loadWorkspaceCustomization({
      documentPath: `${workspaceRoot}/draft.md`,
      prompt: "Apply $concise",
      readWorkspaceFile: async (path) => contents.get(path) ?? "",
      workspaceFiles: files
    });

    const prompt = buildWorkspaceCustomizationPrompt(customization, {
      canLoadSkills: true
    });

    expect(prompt).toContain("Workspace instructions (AGENTS.md)");
    expect(prompt).toContain("Preserve the author's terminology.");
    expect(prompt).toContain("Available workspace skills");
    expect(prompt).toContain("$concise");
    expect(prompt).toContain(".agents/skills/concise/SKILL.md");
    expect(prompt).toContain("use load_skill to load its full SKILL.md");
    expect(prompt).toContain("Activated workspace skills");
    expect(prompt).toContain("Keep every factual qualifier.");
  });
});
