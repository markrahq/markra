import { Eye, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { IconButton } from "@markra/ui";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EditorPreferences } from "../../lib/settings/app-settings";
import {
  createDefaultCustomMarkdownTemplate,
  defaultMarkdownTemplates,
  markdownTemplateToSource,
  mergeMarkdownTemplates,
  updateMarkdownTemplateFromSource,
  type MarkdownTemplate
} from "../../lib/templates";
import {
  SettingsButton,
  SettingsRow,
  SettingsSection,
  SettingsTextarea
} from "./SettingsControls";
import { mergeClassNames } from "./class-names";
import type { SettingsTranslate } from "./translate";

function SettingsMarkdownTemplateSourceEditor({
  onUpdate,
  template,
  translate
}: {
  onUpdate: (template: MarkdownTemplate) => unknown;
  template: MarkdownTemplate;
  translate: SettingsTranslate;
}) {
  const [source, setSource] = useState(() => markdownTemplateToSource(template));

  useEffect(() => {
    setSource(markdownTemplateToSource(template));
  }, [template.id]);

  const handleChange = (value: string) => {
    setSource(value);
    onUpdate(updateMarkdownTemplateFromSource(template, value));
  };

  return (
    <SettingsTextarea
      className="min-h-60 font-mono"
      label={`${translate("settings.templates.source")}: ${template.name}`}
      value={source}
      widthClassName="w-full"
      spellCheck={false}
      onChange={handleChange}
    />
  );
}

function SettingsMarkdownTemplatePreview({
  template,
  translate
}: {
  template: MarkdownTemplate;
  translate: SettingsTranslate;
}) {
  return (
    <div
      className="markdown-paper settings-template-preview"
      role="region"
      aria-label={`${translate("settings.templates.preview")}: ${template.name}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {template.content}
      </ReactMarkdown>
    </div>
  );
}

export function TemplatesSettings({
  onCreateTemplate,
  onDeleteTemplate,
  onUpdateTemplate,
  preferences,
  templates,
  translate
}: {
  onCreateTemplate: (template: MarkdownTemplate) => unknown;
  onDeleteTemplate: (template: MarkdownTemplate) => unknown;
  onUpdateTemplate: (template: MarkdownTemplate) => unknown;
  preferences: EditorPreferences;
  templates: readonly MarkdownTemplate[];
  translate: SettingsTranslate;
}) {
  const visibleMarkdownTemplates = useMemo(
    () => mergeMarkdownTemplates(templates),
    [templates]
  );
  const builtInTemplateIds = useMemo(() => new Set(defaultMarkdownTemplates.map((template) => template.id)), []);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    templates[0]?.id ?? visibleMarkdownTemplates[0]?.id ?? null
  );
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const selectedTemplate =
    visibleMarkdownTemplates.find((template) => template.id === selectedTemplateId) ??
    visibleMarkdownTemplates[0] ??
    null;
  const selectedTemplateEditing = selectedTemplate ? editingTemplateId === selectedTemplate.id : false;
  const selectedTemplateBuiltIn = selectedTemplate ? builtInTemplateIds.has(selectedTemplate.id) : false;

  useEffect(() => {
    const selectedTemplateExists = visibleMarkdownTemplates.some((template) => template.id === selectedTemplateId);

    if (selectedTemplateId && selectedTemplateExists) return;

    setSelectedTemplateId(visibleMarkdownTemplates[0]?.id ?? null);
  }, [visibleMarkdownTemplates, selectedTemplateId]);

  const updateSelectedTemplate = (updatedTemplate: MarkdownTemplate) => {
    setSelectedTemplateId(updatedTemplate.id);
    onUpdateTemplate(updatedTemplate);
  };
  const deleteSelectedTemplate = () => {
    if (!selectedTemplate || selectedTemplateBuiltIn) return;

    const selectedIndex = visibleMarkdownTemplates.findIndex((template) => template.id === selectedTemplate.id);
    const nextVisibleMarkdownTemplates = visibleMarkdownTemplates.filter((template) => template.id !== selectedTemplate.id);
    const nextSelectedTemplateId =
      nextVisibleMarkdownTemplates[Math.min(selectedIndex, nextVisibleMarkdownTemplates.length - 1)]?.id ?? null;

    setSelectedTemplateId(nextSelectedTemplateId);
    onDeleteTemplate(selectedTemplate);
  };
  const selectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setEditingTemplateId(null);
  };
  const toggleSelectedTemplateEditing = () => {
    if (!selectedTemplate) return;

    setEditingTemplateId(selectedTemplateEditing ? null : selectedTemplate.id);
  };
  const addTemplate = () => {
    const template = createDefaultCustomMarkdownTemplate([
      ...preferences.markdownTemplates,
      ...templates
    ]);

    setSelectedTemplateId(template.id);
    onCreateTemplate(template);
    setEditingTemplateId(template.id);
  };

  return (
    <SettingsSection label={translate("settings.sections.templates")}>
      <SettingsRow
        title={translate("settings.templates.custom")}
        description={translate("settings.templates.description")}
        action={
          <SettingsButton
            label={translate("settings.templates.add")}
            onClick={addTemplate}
          >
            <Plus aria-hidden="true" size={13} />
            {translate("settings.templates.add")}
          </SettingsButton>
        }
      />
      {visibleMarkdownTemplates.length === 0 ? (
        <div className="settings-row py-14">
          <div className="mx-auto flex max-w-64 flex-col items-center gap-2.5 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-(--border-default) bg-(--bg-secondary) text-(--text-secondary)">
              <FileText aria-hidden="true" size={16} />
            </span>
            <p className="m-0 text-[12px] leading-5 font-[620] text-(--text-heading)">
              {translate("settings.templates.empty")}
            </p>
          </div>
        </div>
      ) : (
        <div className="settings-row py-4">
          <div className="settings-templates-layout grid grid-cols-[200px_minmax(0,1fr)] gap-5 max-[760px]:grid-cols-1">
            <ul
              className="m-0 flex max-h-105 min-h-18 list-none flex-col gap-0.5 overflow-y-auto border-r border-(--border-default) p-0 pr-3 max-[760px]:max-h-48 max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:pb-3"
              role="list"
              aria-label={translate("settings.templates.list")}
            >
              {visibleMarkdownTemplates.map((template) => {
                const selected = selectedTemplate?.id === template.id;

                return (
                  <li key={template.id} className="min-w-0">
                    <button
                      className={mergeClassNames(
                        "flex w-full min-w-0 flex-col rounded-md px-2.5 py-2 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)",
                        selected
                          ? "bg-(--bg-active) text-(--text-heading)"
                          : "text-(--text-heading) hover:bg-(--bg-hover)"
                      )}
                      type="button"
                      aria-current={selected ? "true" : "false"}
                      aria-label={template.name}
                      onClick={() => selectTemplate(template.id)}
                    >
                      <span className="block w-full truncate text-[12px] leading-5 font-[650]">{template.name}</span>
                      <span
                        className="block w-full truncate text-[11px] leading-4 font-[450] text-(--text-secondary)"
                        aria-hidden="true"
                      >
                        {template.suggestedName}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <section className="min-w-0 pl-0.5 max-[760px]:pl-0" role="region" aria-label={translate("settings.templates.editor")}>
              <div className="grid gap-3.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[13px] leading-5 font-[680] text-(--text-heading)">
                      {selectedTemplate.name}
                    </p>
                    <p className="m-0 mt-0.5 truncate text-[12px] leading-4.5 text-(--text-secondary)">
                      {selectedTemplate.suggestedName}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      className="rounded-md"
                      label={`${translate(selectedTemplateEditing ? "settings.templates.showPreview" : "settings.templates.edit")}: ${selectedTemplate.name}`}
                      onClick={toggleSelectedTemplateEditing}
                    >
                      {selectedTemplateEditing ? (
                        <Eye aria-hidden="true" size={14} />
                      ) : (
                        <Pencil aria-hidden="true" size={14} />
                      )}
                    </IconButton>
                    {selectedTemplateBuiltIn ? null : (
                      <IconButton
                        className="rounded-md"
                        label={`${translate("settings.templates.delete")}: ${selectedTemplate.name}`}
                        onClick={deleteSelectedTemplate}
                      >
                        <Trash2 aria-hidden="true" size={14} />
                      </IconButton>
                    )}
                  </div>
                </div>
                {selectedTemplateEditing ? (
                  <SettingsMarkdownTemplateSourceEditor
                    template={selectedTemplate}
                    translate={translate}
                    onUpdate={updateSelectedTemplate}
                  />
                ) : (
                  <SettingsMarkdownTemplatePreview
                    template={selectedTemplate}
                    translate={translate}
                  />
                )}
                <p className="m-0 text-[12px] leading-5 text-(--text-secondary)">
                  {translate("settings.templates.variables")}
                </p>
              </div>
            </section>
          </div>
        </div>
      )}
    </SettingsSection>
  );
}
