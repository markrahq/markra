export type MarkdownTemplateContext = {
  now?: Date;
  title: string;
};

export type MarkdownTemplate = {
  content: string;
  fileName?: string;
  id: string;
  name: string;
  suggestedName: string;
};

export type MarkdownTemplateEntry = {
  fileName: string;
  id: string;
  name: string;
  suggestedName: string;
};

export const customMarkdownTemplatesMaxLength = 20;

const templateVariablePattern = /\{\{\s*(date|datetime|title|weekday)\s*\}\}/g;
const markdownTemplateFrontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n){0,2}/;
const markdownTemplateHeadingPattern = /^\s*#\s+(.+)$/m;
const markdownTemplateUnsafeFileNamePattern = /[\\/]/u;

export const defaultMarkdownTemplates: MarkdownTemplate[] = [
  {
    id: "daily-note",
    name: "Daily note",
    suggestedName: "{{date}}",
    content: `# {{title}}

Date: {{date}}

## Notes

## Tasks

- [ ]
`
  },
  {
    id: "meeting-note",
    name: "Meeting note",
    suggestedName: "Meeting notes",
    content: `# {{title}}

Date: {{date}}

## Attendees

## Notes

## Decisions

## Follow up

- [ ]
`
  },
  {
    id: "reading-note",
    name: "Reading note",
    suggestedName: "Reading notes",
    content: `# {{title}}

Date: {{date}}

## Source

## Summary

## Highlights

## Questions
`
  },
  {
    id: "project-note",
    name: "Project note",
    suggestedName: "Project notes",
    content: `# {{title}}

Date: {{date}}

## Goal

## Context

## Plan

- [ ]

## Notes
`
  }
];

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatTemplateDate(date: Date) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate())
  ].join("-");
}

function formatTemplateDateTime(date: Date) {
  return `${formatTemplateDate(date)} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;
}

function formatTemplateWeekday(date: Date) {
  return new Intl.DateTimeFormat("en", { weekday: "long" }).format(date);
}

function templateValues(context: MarkdownTemplateContext) {
  const now = context.now ?? new Date();
  const title = context.title.trim() || "Untitled";

  return {
    date: formatTemplateDate(now),
    datetime: formatTemplateDateTime(now),
    title,
    weekday: formatTemplateWeekday(now)
  };
}

function markdownTemplateMetadataValue(value: string) {
  return value.replace(/\r?\n/g, " ").trim();
}

function parseMarkdownTemplateMetadata(source: string) {
  const frontmatter = markdownTemplateFrontmatterPattern.exec(source);
  const metadata: Partial<Pick<MarkdownTemplate, "name" | "suggestedName">> = {};

  if (!frontmatter) {
    return {
      content: source,
      metadata
    };
  }

  frontmatter[1].split(/\r?\n/u).forEach((line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) return;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "name") metadata.name = value;
    if (key === "suggestedName") metadata.suggestedName = value;
  });

  return {
    content: source.slice(frontmatter[0].length),
    metadata
  };
}

function markdownTemplateNameFromContent(content: string) {
  const heading = markdownTemplateHeadingPattern.exec(content);
  const headingText = heading?.[1]?.replace(/\s+#+\s*$/u, "").trim();

  return headingText || null;
}

export function renderMarkdownTemplate(template: MarkdownTemplate, context: MarkdownTemplateContext) {
  const values = templateValues(context);

  return template.content.replace(templateVariablePattern, (_match, key: keyof typeof values) => values[key]);
}

export function suggestedMarkdownTemplateFileName(template: MarkdownTemplate, context: MarkdownTemplateContext) {
  const values = templateValues(context);

  return template.suggestedName.replace(templateVariablePattern, (_match, key: keyof typeof values) => values[key]);
}

export function markdownTemplateToSource(template: MarkdownTemplate) {
  return [
    "---",
    `name: ${markdownTemplateMetadataValue(template.name)}`,
    `suggestedName: ${markdownTemplateMetadataValue(template.suggestedName)}`,
    "---",
    "",
    template.content
  ].join("\n");
}

export function updateMarkdownTemplateFromSource(template: MarkdownTemplate, source: string): MarkdownTemplate {
  const { content, metadata } = parseMarkdownTemplateMetadata(source);
  const name = metadata.name?.trim() || markdownTemplateNameFromContent(content) || template.name;
  const suggestedName = Object.hasOwn(metadata, "suggestedName")
    ? metadata.suggestedName?.trim() ?? ""
    : template.suggestedName;

  return {
    ...template,
    content,
    name,
    suggestedName
  };
}

export function markdownTemplateTitleFromFileName(fileName: string) {
  return fileName.trim().replace(/\.(?:markdown|md)$/iu, "") || "Untitled";
}

function createMarkdownTemplateId(existingTemplates: readonly Partial<Pick<MarkdownTemplate, "id">>[] = []) {
  const usedIds = new Set(
    existingTemplates
      .map((template) => template.id)
      .filter((id): id is string => typeof id === "string")
  );

  for (let index = 0; index < customMarkdownTemplatesMaxLength + 1; index += 1) {
    const candidate = index === 0 ? "custom-template" : `custom-template-${index + 1}`;
    if (!usedIds.has(candidate)) return candidate;
  }

  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `custom-template-${globalThis.crypto.randomUUID()}`;
  }

  return `custom-template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugMarkdownTemplateFileNamePart(value: string) {
  const slug = value
    .trim()
    .replace(/\.(?:markdown|md)$/iu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return slug || "template";
}

function normalizeMarkdownTemplateFileName(value: unknown) {
  if (typeof value !== "string") return null;

  const fileName = value.trim();
  if (!fileName || fileName === "." || fileName === "..") return null;
  if (markdownTemplateUnsafeFileNamePattern.test(fileName)) return null;
  if (!/\.md$/iu.test(fileName)) return null;

  return fileName;
}

function createMarkdownTemplateFileName(
  id: string,
  existingTemplates: readonly Partial<MarkdownTemplateEntry>[] = []
) {
  const usedFileNames = new Set(
    existingTemplates
      .map((template) => normalizeMarkdownTemplateFileName(template.fileName))
      .filter((fileName): fileName is string => Boolean(fileName))
      .map((fileName) => fileName.toLowerCase())
  );
  const baseName = slugMarkdownTemplateFileNamePart(id);

  for (let index = 0; index < customMarkdownTemplatesMaxLength + 1; index += 1) {
    const candidate = index === 0 ? `${baseName}.md` : `${baseName}-${index + 1}.md`;
    if (!usedFileNames.has(candidate.toLowerCase())) return candidate;
  }

  return `${baseName}-${Date.now().toString(36)}.md`;
}

export function createDefaultCustomMarkdownTemplate(
  existingTemplates: readonly Partial<MarkdownTemplate>[]
    | readonly Partial<MarkdownTemplateEntry>[] = []
): MarkdownTemplate {
  const id = createMarkdownTemplateId(existingTemplates);

  return {
    fileName: createMarkdownTemplateFileName(id, existingTemplates),
    id,
    name: "New template",
    suggestedName: "{{title}}",
    content: "# {{title}}\n"
  };
}

export function createCustomMarkdownTemplateFromFile(
  file: Pick<MarkdownTemplate, "content" | "name">,
  existingTemplates: readonly Partial<MarkdownTemplate>[]
    | readonly Partial<MarkdownTemplateEntry>[] = []
): MarkdownTemplate {
  const title = markdownTemplateTitleFromFileName(file.name);
  const id = createMarkdownTemplateId(existingTemplates);

  return {
    fileName: createMarkdownTemplateFileName(id, existingTemplates),
    id,
    name: title,
    suggestedName: title,
    content: file.content
  };
}

export function markdownTemplateEntryFromTemplate(template: MarkdownTemplate): MarkdownTemplateEntry {
  return {
    fileName: normalizeMarkdownTemplateFileName(template.fileName) ?? createMarkdownTemplateFileName(template.id),
    id: template.id,
    name: template.name,
    suggestedName: template.suggestedName
  };
}

export function createMarkdownTemplateFromEntry(entry: MarkdownTemplateEntry, content: string): MarkdownTemplate {
  return {
    content,
    fileName: entry.fileName,
    id: entry.id,
    name: entry.name,
    suggestedName: entry.suggestedName
  };
}

export async function loadMarkdownTemplatesFromEntries(
  entries: readonly MarkdownTemplateEntry[],
  readTemplateFile: (fileName: string) => Promise<string>
): Promise<MarkdownTemplate[]> {
  const templates: MarkdownTemplate[] = [];

  for (const entry of entries) {
    try {
      const content = await readTemplateFile(entry.fileName);
      if (!content.trim()) continue;

      templates.push(createMarkdownTemplateFromEntry(entry, content));
    } catch {
      // Skip missing or unreadable template files; the settings list stays authoritative.
    }
  }

  return templates;
}

export function mergeMarkdownTemplates(
  customTemplates: readonly MarkdownTemplate[] = [],
  builtInTemplates: readonly MarkdownTemplate[] = defaultMarkdownTemplates
): MarkdownTemplate[] {
  const customTemplateById = new Map(customTemplates.map((template) => [template.id, template]));
  const builtInTemplateIds = new Set(builtInTemplates.map((template) => template.id));
  const mergedBuiltInTemplates = builtInTemplates.map((template) => customTemplateById.get(template.id) ?? template);
  const customOnlyTemplates = customTemplates.filter((template) => !builtInTemplateIds.has(template.id));

  return [
    ...mergedBuiltInTemplates,
    ...customOnlyTemplates
  ];
}

export function normalizeMarkdownTemplateEntries(value: unknown): MarkdownTemplateEntry[] {
  if (!Array.isArray(value)) return [];

  const templates: MarkdownTemplateEntry[] = [];
  const usedIds = new Set<string>();
  const usedFileNames = new Set<string>();

  value.forEach((item) => {
    if (templates.length >= customMarkdownTemplatesMaxLength) return;
    if (typeof item !== "object" || item === null) return;

    const candidate = item as Partial<MarkdownTemplate>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const suggestedName = typeof candidate.suggestedName === "string" ? candidate.suggestedName.trim() : "";
    const fileName = normalizeMarkdownTemplateFileName(candidate.fileName) ?? createMarkdownTemplateFileName(id, templates);

    if (!id || usedIds.has(id) || !name || usedFileNames.has(fileName.toLowerCase())) return;

    usedIds.add(id);
    usedFileNames.add(fileName.toLowerCase());
    templates.push({
      fileName,
      id,
      name,
      suggestedName
    });
  });

  return templates;
}
