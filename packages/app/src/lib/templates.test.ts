import {
  createMarkdownTemplateFromEntry,
  createCustomMarkdownTemplateFromFile,
  defaultMarkdownTemplates,
  loadMarkdownTemplatesFromEntries,
  markdownTemplateEntryFromTemplate,
  markdownTemplateToSource,
  mergeMarkdownTemplates,
  normalizeMarkdownTemplateEntries,
  renderMarkdownTemplate,
  suggestedMarkdownTemplateFileName,
  updateMarkdownTemplateFromSource
} from "./templates";

describe("markdown templates", () => {
  const now = new Date("2026-05-21T09:30:00");

  it("renders lightweight template variables into ordinary markdown", () => {
    const dailyNote = defaultMarkdownTemplates.find((template) => template.id === "daily-note");

    expect(dailyNote).toBeDefined();
    expect(suggestedMarkdownTemplateFileName(dailyNote!, { now, title: "" })).toBe("2026-05-21");
    expect(renderMarkdownTemplate(dailyNote!, { now, title: "2026-05-21" })).toContain("# 2026-05-21");
    expect(renderMarkdownTemplate(dailyNote!, { now, title: "2026-05-21" })).toContain("Date: 2026-05-21");
  });

  it("normalizes the persisted template list without markdown contents", () => {
    expect(normalizeMarkdownTemplateEntries([
      {
        content: "# Legacy content should live in the template file",
        fileName: " weekly-review.md ",
        id: " custom-template ",
        name: " Weekly review ",
        suggestedName: " {{date}} weekly "
      },
      {
        fileName: "../unsafe.md",
        id: "",
        name: "",
        suggestedName: ""
      },
      "invalid"
    ])).toEqual([
      {
        fileName: "weekly-review.md",
        id: "custom-template",
        name: "Weekly review",
        suggestedName: "{{date}} weekly"
      }
    ]);
  });

  it("keeps templates with an empty suggested file name", () => {
    expect(normalizeMarkdownTemplateEntries([
      {
        fileName: "blank-name.md",
        id: "blank-name",
        name: "Blank name",
        suggestedName: " "
      }
    ])).toEqual([
      {
        fileName: "blank-name.md",
        id: "blank-name",
        name: "Blank name",
        suggestedName: ""
      }
    ]);
  });

  it("loads runtime templates from the persisted list and template files", async () => {
    const readTemplateFile = vi.fn(async (fileName: string) => {
      if (fileName === "standup.md") return "# Standup\n\n## Yesterday";
      if (fileName === "empty.md") return "   ";
      throw new Error("missing template file");
    });

    await expect(loadMarkdownTemplatesFromEntries([
      {
        fileName: "standup.md",
        id: "standup",
        name: "Standup",
        suggestedName: "{{date}} standup"
      },
      {
        fileName: "empty.md",
        id: "empty",
        name: "Empty",
        suggestedName: "empty"
      },
      {
        fileName: "missing.md",
        id: "missing",
        name: "Missing",
        suggestedName: "missing"
      }
    ], readTemplateFile)).resolves.toEqual([
      {
        content: "# Standup\n\n## Yesterday",
        fileName: "standup.md",
        id: "standup",
        name: "Standup",
        suggestedName: "{{date}} standup"
      }
    ]);
    expect(readTemplateFile).toHaveBeenCalledWith("standup.md");
    expect(readTemplateFile).toHaveBeenCalledWith("empty.md");
    expect(readTemplateFile).toHaveBeenCalledWith("missing.md");
  });

  it("creates a runtime template from a settings entry and markdown file content", () => {
    expect(createMarkdownTemplateFromEntry({
      fileName: "standup.md",
      id: "standup",
      name: "Standup",
      suggestedName: "{{date}} standup"
    }, "# {{title}}\n\n## Yesterday")).toEqual({
      content: "# {{title}}\n\n## Yesterday",
      fileName: "standup.md",
      id: "standup",
      name: "Standup",
      suggestedName: "{{date}} standup"
    });
  });

  it("serializes custom templates as markdown source with lightweight metadata", () => {
    expect(markdownTemplateToSource({
      id: "weekly-review",
      name: "Weekly review",
      suggestedName: "{{date}} weekly",
      content: "# {{title}}\n\n## Wins"
    })).toBe(`---
name: Weekly review
suggestedName: {{date}} weekly
---

# {{title}}

## Wins`);
  });

  it("updates custom templates from markdown source frontmatter", () => {
    expect(updateMarkdownTemplateFromSource({
      id: "standup",
      name: "Standup",
      suggestedName: "{{date}} standup",
      content: "# {{title}}\n\n## Yesterday"
    }, `---
name: Daily review
suggestedName: {{date}} daily
---

# {{title}}

- [ ] Ship it`)).toEqual({
      id: "standup",
      name: "Daily review",
      suggestedName: "{{date}} daily",
      content: "# {{title}}\n\n- [ ] Ship it"
    });
  });

  it("allows custom template source frontmatter to clear the suggested file name", () => {
    expect(updateMarkdownTemplateFromSource({
      id: "standup",
      name: "Standup",
      suggestedName: "{{date}} standup",
      content: "# {{title}}\n\n## Yesterday"
    }, `---
name: Daily review
suggestedName:
---

# {{title}}

- [ ] Ship it`)).toEqual({
      id: "standup",
      name: "Daily review",
      suggestedName: "",
      content: "# {{title}}\n\n- [ ] Ship it"
    });
  });

  it("keeps existing metadata when markdown source has no frontmatter", () => {
    expect(updateMarkdownTemplateFromSource({
      id: "standup",
      name: "Standup",
      suggestedName: "{{date}} standup",
      content: "# {{title}}\n\n## Yesterday"
    }, "# Sprint notes\n\n- [ ] Ship it")).toEqual({
      id: "standup",
      name: "Sprint notes",
      suggestedName: "{{date}} standup",
      content: "# Sprint notes\n\n- [ ] Ship it"
    });
  });

  it("creates a custom template from a markdown file", () => {
    expect(createCustomMarkdownTemplateFromFile({
      content: "# Standup\n\n## Yesterday",
      name: "standup.md"
    }, [
      {
        id: "custom-template",
        name: "Existing",
        suggestedName: "Existing",
        content: "# Existing"
      }
    ])).toEqual({
      fileName: "custom-template-2.md",
      id: "custom-template-2",
      name: "standup",
      suggestedName: "standup",
      content: "# Standup\n\n## Yesterday"
    });
  });

  it("creates a settings list entry from a runtime template without content", () => {
    expect(markdownTemplateEntryFromTemplate({
      content: "# Standup",
      fileName: "standup.md",
      id: "standup",
      name: "Standup",
      suggestedName: "{{date}} standup"
    })).toEqual({
      fileName: "standup.md",
      id: "standup",
      name: "Standup",
      suggestedName: "{{date}} standup"
    });
  });

  it("merges custom templates over built-in templates without duplicating overridden ids", () => {
    expect(mergeMarkdownTemplates([
      {
        id: "daily-note",
        name: "Daily note edited",
        suggestedName: "{{date}} daily",
        content: "# Edited daily"
      },
      {
        id: "custom-template",
        name: "Standup",
        suggestedName: "standup",
        content: "# Standup"
      }
    ]).map((template) => template.id)).toEqual([
      "daily-note",
      "meeting-note",
      "reading-note",
      "project-note",
      "custom-template"
    ]);
    expect(mergeMarkdownTemplates([
      {
        id: "daily-note",
        name: "Daily note edited",
        suggestedName: "{{date}} daily",
        content: "# Edited daily"
      }
    ])[0]).toEqual({
      id: "daily-note",
      name: "Daily note edited",
      suggestedName: "{{date}} daily",
      content: "# Edited daily"
    });
  });
});
