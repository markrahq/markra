import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { translate } from "../../test/settings-components";
import { defaultEditorPreferences, type EditorPreferences } from "../../lib/settings/app-settings";
import { markdownTemplateEntryFromTemplate, type MarkdownTemplate } from "../../lib/templates";
import { TemplatesSettings } from "./TemplatesSettings";

describe("TemplatesSettings", () => {
  it("edits the selected lightweight markdown template from a two-pane settings layout", () => {
    const onDeleteTemplate = vi.fn();
    const onUpdateTemplate = vi.fn();
    const templates: MarkdownTemplate[] = [
      {
        content: "# {{title}}\n\n## Yesterday",
        fileName: "standup.md",
        id: "standup",
        name: "Standup",
        suggestedName: "{{date}} standup"
      },
      {
        content: "# {{title}}\n\n## Wins",
        fileName: "weekly-review.md",
        id: "weekly-review",
        name: "Weekly review",
        suggestedName: "{{date}} weekly"
      }
    ];
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      markdownTemplates: templates.map(markdownTemplateEntryFromTemplate)
    };

    render(
      <TemplatesSettings
        preferences={preferences}
        templates={templates}
        translate={translate}
        onCreateTemplate={vi.fn()}
        onDeleteTemplate={onDeleteTemplate}
        onUpdateTemplate={onUpdateTemplate}
      />
    );

    expect(screen.getByRole("heading", { name: "Templates" })).toBeInTheDocument();
    const templateList = screen.getByRole("list", { name: "Template list" });
    const templateEditor = screen.getByRole("region", { name: "Template editor" });

    expect(templateList.closest(".settings-templates-layout")).toHaveClass("grid-cols-[200px_minmax(0,1fr)]");
    expect(within(templateList).getByRole("button", { name: "Standup" })).toHaveAttribute("aria-current", "true");
    expect(within(templateList).getByRole("button", { name: "Weekly review" })).toHaveAttribute("aria-current", "false");
    expect(within(templateEditor).getByText("Variables: {{title}}, {{date}}, {{datetime}}, {{weekday}}")).toBeInTheDocument();

    expect(within(templateEditor).queryByRole("textbox", { name: "Template name: Standup" })).not.toBeInTheDocument();
    expect(within(templateEditor).queryByRole("textbox", { name: "Template file name: Standup" })).not.toBeInTheDocument();
    expect(within(templateEditor).queryByRole("textbox", { name: "Template Markdown: Standup" })).not.toBeInTheDocument();

    const standupPreview = within(templateEditor).getByRole("region", { name: "Template preview: Standup" });
    expect(within(standupPreview).getByRole("heading", { name: "{{title}}", level: 1 })).toBeInTheDocument();
    expect(within(standupPreview).getByRole("heading", { name: "Yesterday", level: 2 })).toBeInTheDocument();

    fireEvent.click(within(templateEditor).getByRole("button", { name: "Edit template: Standup" }));
    expect(within(templateEditor).queryByRole("region", { name: "Template preview: Standup" })).not.toBeInTheDocument();
    expect(within(templateEditor).getByRole("textbox", { name: "Template Markdown: Standup" })).toHaveValue(`---
name: Standup
suggestedName: {{date}} standup
---

# {{title}}

## Yesterday`);

    fireEvent.change(within(templateEditor).getByRole("textbox", { name: "Template Markdown: Standup" }), {
      target: { value: `---
name: Daily review
suggestedName: {{date}} daily
---

# {{title}}

- [ ] Ship it` }
    });
    expect(onUpdateTemplate).toHaveBeenCalledWith({
      ...templates[0],
      name: "Daily review",
      suggestedName: "{{date}} daily",
      content: "# {{title}}\n\n- [ ] Ship it"
    });

    fireEvent.click(within(templateList).getByRole("button", { name: "Weekly review" }));
    expect(within(templateList).getByRole("button", { name: "Standup" })).toHaveAttribute("aria-current", "false");
    expect(within(templateList).getByRole("button", { name: "Weekly review" })).toHaveAttribute("aria-current", "true");
    expect(within(templateEditor).queryByRole("textbox", { name: "Template Markdown: Weekly review" })).not.toBeInTheDocument();

    const weeklyPreview = within(templateEditor).getByRole("region", { name: "Template preview: Weekly review" });
    expect(within(weeklyPreview).getByRole("heading", { name: "{{title}}", level: 1 })).toBeInTheDocument();
    expect(within(weeklyPreview).getByRole("heading", { name: "Wins", level: 2 })).toBeInTheDocument();

    fireEvent.click(within(templateEditor).getByRole("button", { name: "Edit template: Weekly review" }));
    expect(within(templateEditor).getByRole("textbox", { name: "Template Markdown: Weekly review" })).toHaveValue(`---
name: Weekly review
suggestedName: {{date}} weekly
---

# {{title}}

## Wins`);

    fireEvent.change(within(templateEditor).getByRole("textbox", { name: "Template Markdown: Weekly review" }), {
      target: { value: `---
name: Weekly digest
suggestedName: {{date}} digest
---

# {{title}}

## Shipped` }
    });
    expect(onUpdateTemplate).toHaveBeenCalledWith({
      ...templates[1],
      name: "Weekly digest",
      suggestedName: "{{date}} digest",
      content: "# {{title}}\n\n## Shipped"
    });

    fireEvent.click(within(templateEditor).getByRole("button", { name: "Preview template: Weekly review" }));
    expect(within(templateEditor).queryByRole("textbox", { name: "Template Markdown: Weekly review" })).not.toBeInTheDocument();
    expect(within(templateEditor).getByRole("region", { name: "Template preview: Weekly review" })).toBeInTheDocument();

    fireEvent.click(within(templateEditor).getByRole("button", { name: "Delete template: Weekly review" }));
    expect(onDeleteTemplate).toHaveBeenCalledWith(templates[1]);
  });

  it("adds a new lightweight markdown template from template settings", () => {
    const onCreateTemplate = vi.fn();

    render(
      <TemplatesSettings
        preferences={defaultEditorPreferences}
        templates={[]}
        translate={translate}
        onCreateTemplate={onCreateTemplate}
        onDeleteTemplate={vi.fn()}
        onUpdateTemplate={vi.fn()}
      />
    );

    const templateList = screen.getByRole("list", { name: "Template list" });
    expect(within(templateList).getByRole("button", { name: "Daily note" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add template" }));

    expect(onCreateTemplate).toHaveBeenCalledWith(expect.objectContaining({
      content: "# {{title}}\n",
      fileName: expect.stringMatching(/\.md$/u),
      id: expect.any(String),
      name: "New template",
      suggestedName: "{{title}}"
    }));
  });

  it("shows built-in templates and saves edits as template overrides", () => {
    const onUpdateTemplate = vi.fn();

    render(
      <TemplatesSettings
        preferences={defaultEditorPreferences}
        templates={[]}
        translate={translate}
        onCreateTemplate={vi.fn()}
        onDeleteTemplate={vi.fn()}
        onUpdateTemplate={onUpdateTemplate}
      />
    );

    const templateList = screen.getByRole("list", { name: "Template list" });
    const templateEditor = screen.getByRole("region", { name: "Template editor" });

    expect(within(templateList).getByRole("button", { name: "Daily note" })).toHaveAttribute("aria-current", "true");
    expect(within(templateList).getByRole("button", { name: "Meeting note" })).toBeInTheDocument();
    expect(within(templateEditor).getByRole("region", { name: "Template preview: Daily note" })).toBeInTheDocument();

    fireEvent.click(within(templateEditor).getByRole("button", { name: "Edit template: Daily note" }));
    fireEvent.change(within(templateEditor).getByRole("textbox", { name: "Template Markdown: Daily note" }), {
      target: { value: `---
name: Daily note edited
suggestedName: {{date}} edited
---

# Edited daily` }
    });

    expect(onUpdateTemplate).toHaveBeenCalledWith({
      content: "# Edited daily",
      id: "daily-note",
      name: "Daily note edited",
      suggestedName: "{{date}} edited"
    });
  });

  it("opens a newly added template in edit mode and switches existing templates to preview mode", () => {
    const templates: MarkdownTemplate[] = [
      {
        content: "# {{title}}\n\n## Yesterday",
        fileName: "standup.md",
        id: "standup",
        name: "Standup",
        suggestedName: "{{date}} standup"
      }
    ];
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      markdownTemplates: templates.map(markdownTemplateEntryFromTemplate)
    };

    function TemplateSettingsHarness() {
      const [editorPreferences, setEditorPreferences] = useState(preferences);
      const [markdownTemplates, setMarkdownTemplates] = useState(templates);
      const saveTemplate = (template: MarkdownTemplate) => {
        const entry = markdownTemplateEntryFromTemplate(template);

        setEditorPreferences((currentPreferences) => ({
          ...currentPreferences,
          markdownTemplates: currentPreferences.markdownTemplates.some((storedTemplate) => storedTemplate.id === entry.id)
            ? currentPreferences.markdownTemplates.map((storedTemplate) => storedTemplate.id === entry.id ? entry : storedTemplate)
            : [...currentPreferences.markdownTemplates, entry]
        }));
        setMarkdownTemplates((currentTemplates) =>
          currentTemplates.some((storedTemplate) => storedTemplate.id === template.id)
            ? currentTemplates.map((storedTemplate) => storedTemplate.id === template.id ? template : storedTemplate)
            : [...currentTemplates, template]
        );
      };

      return (
        <TemplatesSettings
          preferences={editorPreferences}
          templates={markdownTemplates}
          translate={translate}
          onCreateTemplate={saveTemplate}
          onDeleteTemplate={vi.fn()}
          onUpdateTemplate={saveTemplate}
        />
      );
    }

    render(<TemplateSettingsHarness />);

    expect(screen.getByRole("region", { name: "Template preview: Standup" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add template" }));

    const templateList = screen.getByRole("list", { name: "Template list" });
    const templateEditor = screen.getByRole("region", { name: "Template editor" });

    expect(within(templateList).getByRole("button", { name: "New template" })).toHaveAttribute("aria-current", "true");
    expect(within(templateEditor).getByRole("textbox", { name: "Template Markdown: New template" })).toHaveValue(`---
name: New template
suggestedName: {{title}}
---

# {{title}}
`);
    expect(within(templateEditor).queryByRole("region", { name: "Template preview: New template" })).not.toBeInTheDocument();

    fireEvent.click(within(templateList).getByRole("button", { name: "Standup" }));

    expect(within(templateEditor).queryByRole("textbox", { name: "Template Markdown: Standup" })).not.toBeInTheDocument();
    expect(within(templateEditor).getByRole("region", { name: "Template preview: Standup" })).toBeInTheDocument();
  });

  it("keeps the template markdown source stable while editing incomplete metadata", () => {
    const templates: MarkdownTemplate[] = [
      {
        content: "# {{title}}\n\n## Yesterday",
        fileName: "standup.md",
        id: "standup",
        name: "Standup",
        suggestedName: "{{date}} standup"
      }
    ];
    const preferences: EditorPreferences = {
      ...defaultEditorPreferences,
      markdownTemplates: templates.map(markdownTemplateEntryFromTemplate)
    };

    function TemplateSettingsHarness() {
      const [editorPreferences, setEditorPreferences] = useState(preferences);
      const [markdownTemplates, setMarkdownTemplates] = useState(templates);
      const saveTemplate = (template: MarkdownTemplate) => {
        const entry = markdownTemplateEntryFromTemplate(template);

        setEditorPreferences((currentPreferences) => ({
          ...currentPreferences,
          markdownTemplates: currentPreferences.markdownTemplates.some((storedTemplate) => storedTemplate.id === entry.id)
            ? currentPreferences.markdownTemplates.map((storedTemplate) => storedTemplate.id === entry.id ? entry : storedTemplate)
            : [...currentPreferences.markdownTemplates, entry]
        }));
        setMarkdownTemplates((currentTemplates) =>
          currentTemplates.some((storedTemplate) => storedTemplate.id === template.id)
            ? currentTemplates.map((storedTemplate) => storedTemplate.id === template.id ? template : storedTemplate)
            : [...currentTemplates, template]
        );
      };

      return (
        <TemplatesSettings
          preferences={editorPreferences}
          templates={markdownTemplates}
          translate={translate}
          onCreateTemplate={saveTemplate}
          onDeleteTemplate={vi.fn()}
          onUpdateTemplate={saveTemplate}
        />
      );
    }

    render(<TemplateSettingsHarness />);

    const templateEditor = screen.getByRole("region", { name: "Template editor" });
    fireEvent.click(within(templateEditor).getByRole("button", { name: "Edit template: Standup" }));
    const sourceEditor = within(templateEditor).getByRole("textbox", { name: "Template Markdown: Standup" });

    fireEvent.change(sourceEditor, {
      target: { value: "# Loose markdown\n\nStill a template" }
    });

    expect(sourceEditor).toHaveValue("# Loose markdown\n\nStill a template");
    expect(within(templateEditor).getByText("Loose markdown")).toBeInTheDocument();
  });
});
