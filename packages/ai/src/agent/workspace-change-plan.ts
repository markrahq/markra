import type { AgentWorkspaceFile } from "./read-only-tools";
import type {
  WorkspaceChangeKind,
  WorkspaceChangePlanArgs,
  WorkspaceChangePlanChange
} from "./tools/params";
import { workspaceMarkdownFiles } from "./tools/workspace";

export type PreparedWorkspaceChange = WorkspaceChangePlanChange & {
  label: string;
};

export type WorkspaceChangePlanOperations = {
  createFile: (relativePath: string, content: string) => Promise<unknown> | unknown;
  moveFile: (file: AgentWorkspaceFile, toRelativePath: string) => Promise<unknown> | unknown;
  readFile: (file: AgentWorkspaceFile) => Promise<string> | string;
  writeFile: (file: AgentWorkspaceFile, content: string) => Promise<unknown> | unknown;
};

export type ApplyWorkspaceChangePlanOptions = {
  onVisualEvent?: (event: WorkspacePlanVisualEvent) => unknown;
  operations: WorkspaceChangePlanOperations;
  selectedChangeIndexes?: readonly number[];
  workspaceFiles: readonly AgentWorkspaceFile[];
};

export type WorkspaceChangeJournalEntry = {
  afterContent?: string;
  beforeContent?: string;
  from?: string;
  path?: string;
  to?: string;
  type: WorkspaceChangeKind;
};

export type ApplyWorkspaceChangePlanResult = {
  count: number;
  journal: {
    changes: WorkspaceChangeJournalEntry[];
  };
  summary: string;
};

export type WorkspacePlanVisualTarget = "editor" | "file_tree";

export type WorkspacePlanVisualEvent =
  | {
      totalSteps: number;
      type: "plan_validating";
    }
  | WorkspacePlanVisualStepEvent
  | {
      count: number;
      journal: WorkspaceChangeJournalEntry[];
      type: "plan_completed";
    };

export type WorkspacePlanVisualStepEvent = {
  action: WorkspaceChangeKind;
  afterContent?: string;
  beforeContent?: string;
  error?: string;
  from?: string;
  index: number;
  label: string;
  path?: string;
  target: WorkspacePlanVisualTarget;
  to?: string;
  type: "step_applied" | "step_failed" | "step_previewed" | "step_started";
};

const markdownDocumentExtensionPattern = /\.(md|markdown)$/iu;

export async function applyWorkspaceChangePlan(
  plan: WorkspaceChangePlanArgs,
  options: ApplyWorkspaceChangePlanOptions
): Promise<ApplyWorkspaceChangePlanResult> {
  const selectedEntries = selectedWorkspaceChangeEntries(plan.changes, options.selectedChangeIndexes);
  const selectedChanges = selectedEntries.map((entry) => entry.change);
  if (!selectedChanges.length) {
    throw new Error("Cannot apply a workspace change plan because no changes were selected.");
  }

  emitWorkspacePlanVisualEvent(options, {
    totalSteps: selectedChanges.length,
    type: "plan_validating"
  });

  const preparedChanges = prepareWorkspaceChangePlanChanges(selectedChanges, options.workspaceFiles);
  const contentCache = new Map<string, string>();
  const journalChanges: WorkspaceChangeJournalEntry[] = [];

  const readCurrentContent = async (file: AgentWorkspaceFile) => {
    const key = normalizeWorkspaceRelativePath(file.relativePath);
    if (contentCache.has(key)) return contentCache.get(key) ?? "";

    const content = await options.operations.readFile(file);
    contentCache.set(key, content);
    return content;
  };

  const writeCurrentContent = async (file: AgentWorkspaceFile, content: string) => {
    contentCache.set(normalizeWorkspaceRelativePath(file.relativePath), content);
    await options.operations.writeFile(file, content);
  };

  for (const [stepIndex, change] of preparedChanges.entries()) {
    const index = selectedEntries[stepIndex]?.index ?? stepIndex;
    emitWorkspacePlanVisualEvent(options, visualStepEvent(change, index, "step_started"));

    try {
      if (change.type === "create_note") {
        const path = requiredPath(change.path);
        const content = requiredContent(change.content, "create_note");
        emitWorkspacePlanVisualEvent(options, visualStepEvent(change, index, "step_previewed", {
          afterContent: content,
          path
        }));
        await options.operations.createFile(path, content);

        const journalEntry = {
          afterContent: content,
          path,
          type: change.type
        } satisfies WorkspaceChangeJournalEntry;
        journalChanges.push(journalEntry);
        emitWorkspacePlanVisualEvent(options, visualStepEvent(change, index, "step_applied", {
          afterContent: content,
          path
        }));
        continue;
      }

      if (change.type === "rename_note" || change.type === "move_note") {
        const from = requiredPath(change.from);
        const to = requiredPath(change.to);
        const file = existingPreparedChangeFile(options.workspaceFiles, from);
        emitWorkspacePlanVisualEvent(options, visualStepEvent(change, index, "step_previewed", {
          from,
          to
        }));
        await options.operations.moveFile(file, to);

        const journalEntry = {
          from,
          to,
          type: change.type
        } satisfies WorkspaceChangeJournalEntry;
        journalChanges.push(journalEntry);
        emitWorkspacePlanVisualEvent(options, visualStepEvent(change, index, "step_applied", {
          from,
          to
        }));
        continue;
      }

      const path = requiredPath(change.path);
      const file = existingPreparedChangeFile(options.workspaceFiles, path);
      const beforeContent = await readCurrentContent(file);
      const afterContent = appliedMarkdownContent(change, beforeContent);
      emitWorkspacePlanVisualEvent(options, visualStepEvent(change, index, "step_previewed", {
        afterContent,
        beforeContent,
        path
      }));
      await writeCurrentContent(file, afterContent);

      const journalEntry = {
        afterContent,
        beforeContent,
        path,
        type: change.type
      } satisfies WorkspaceChangeJournalEntry;
      journalChanges.push(journalEntry);
      emitWorkspacePlanVisualEvent(options, visualStepEvent(change, index, "step_applied", {
        afterContent,
        beforeContent,
        path
      }));
    } catch (error) {
      emitWorkspacePlanVisualEvent(options, visualStepEvent(change, index, "step_failed", {
        error: error instanceof Error ? error.message : "Failed to apply workspace change."
      }));
      throw error;
    }
  }

  const result = {
    count: journalChanges.length,
    journal: {
      changes: journalChanges
    },
    summary: plan.summary ?? "Apply workspace note changes."
  };

  emitWorkspacePlanVisualEvent(options, {
    count: result.count,
    journal: result.journal.changes,
    type: "plan_completed"
  });

  return result;
}

export function prepareWorkspaceChangePlanChanges(
  changes: readonly WorkspaceChangePlanChange[],
  workspaceFiles: readonly AgentWorkspaceFile[]
): PreparedWorkspaceChange[] {
  const existingMarkdownFiles = workspaceMarkdownFiles(workspaceFiles);
  const existingRelativePaths = new Set(existingMarkdownFiles.map((file) => normalizeWorkspaceRelativePath(file.relativePath)));
  const plannedTargetPaths = new Set<string>();

  return changes.map((change) => prepareWorkspaceChange(change, existingMarkdownFiles, existingRelativePaths, plannedTargetPaths));
}

export function normalizeWorkspaceRelativePath(path: string) {
  return path.trim().replace(/\\/gu, "/").replace(/^\.\/+/u, "").replace(/\/{2,}/gu, "/");
}

function prepareWorkspaceChange(
  change: WorkspaceChangePlanChange,
  existingMarkdownFiles: AgentWorkspaceFile[],
  existingRelativePaths: Set<string>,
  plannedTargetPaths: Set<string>
): PreparedWorkspaceChange {
  if (change.type === "create_note") {
    const path = validateNewMarkdownPath(change.path, existingRelativePaths, plannedTargetPaths);
    return {
      ...change,
      path,
      label: `Create note: ${path}`
    };
  }

  if (change.type === "rename_note" || change.type === "move_note") {
    const from = validateExistingMarkdownPath(change.from, existingMarkdownFiles);
    const to = validateNewMarkdownPath(change.to, existingRelativePaths, plannedTargetPaths);
    return {
      ...change,
      from,
      to,
      label: `${change.type === "rename_note" ? "Rename note" : "Move note"}: ${from} -> ${to}`
    };
  }

  const path = validateExistingMarkdownPath(change.path, existingMarkdownFiles);
  const label = change.type === "add_links"
    ? `Add links: ${path}`
    : change.type === "add_tags"
      ? `Add tags: ${path}`
      : `Update note: ${path}`;

  return {
    ...change,
    path,
    label
  };
}

function validateExistingMarkdownPath(path: string | undefined, existingMarkdownFiles: AgentWorkspaceFile[]) {
  const normalizedPath = validateWorkspaceMarkdownPath(path);
  const file = existingMarkdownFiles.find((candidate) =>
    normalizeWorkspaceRelativePath(candidate.relativePath) === normalizedPath ||
    normalizeWorkspaceRelativePath(candidate.path) === normalizedPath
  );
  if (!file) {
    throw new Error(`Workspace change path "${path ?? ""}" does not match an existing Markdown note.`);
  }

  return normalizeWorkspaceRelativePath(file.relativePath);
}

function validateNewMarkdownPath(
  path: string | undefined,
  existingRelativePaths: Set<string>,
  plannedTargetPaths: Set<string>
) {
  const normalizedPath = validateWorkspaceMarkdownPath(path);
  if (plannedTargetPaths.has(normalizedPath)) {
    throw new Error(`Workspace change path "${normalizedPath}" is targeted by more than one change.`);
  }
  if (existingRelativePaths.has(normalizedPath)) {
    throw new Error(`Workspace change path "${normalizedPath}" already exists.`);
  }

  plannedTargetPaths.add(normalizedPath);
  return normalizedPath;
}

function validateWorkspaceMarkdownPath(path: string | undefined) {
  const normalizedPath = normalizeWorkspaceRelativePath(path ?? "");
  if (!normalizedPath || normalizedPath.startsWith("/") || /^[a-z]:\//iu.test(normalizedPath)) {
    throw new Error("Workspace change path must be a relative Markdown path.");
  }
  if (normalizedPath.split("/").includes("..")) {
    throw new Error("Workspace change path must stay inside the workspace.");
  }
  if (!markdownDocumentExtensionPattern.test(normalizedPath)) {
    throw new Error("Workspace change path must target a Markdown note.");
  }

  return normalizedPath;
}

function selectedWorkspaceChangeEntries(
  changes: readonly WorkspaceChangePlanChange[],
  selectedChangeIndexes: readonly number[] | undefined
) {
  if (!selectedChangeIndexes) {
    return changes.map((change, index) => ({ change, index }));
  }

  const selectedIndexes = new Set<number>();
  selectedChangeIndexes.forEach((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= changes.length) {
      throw new Error(`Workspace change selection index "${index}" is outside the plan.`);
    }
    selectedIndexes.add(index);
  });

  return changes
    .map((change, index) => ({ change, index }))
    .filter((entry) => selectedIndexes.has(entry.index));
}

function requiredPath(path: string | undefined) {
  if (!path) throw new Error("Workspace change is missing a path.");

  return path;
}

function requiredContent(content: string | undefined, type: WorkspaceChangeKind) {
  if (typeof content !== "string") {
    throw new Error(`Workspace change "${type}" requires content.`);
  }

  return content;
}

function existingPreparedChangeFile(workspaceFiles: readonly AgentWorkspaceFile[], relativePath: string) {
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath);
  const file = workspaceMarkdownFiles(workspaceFiles).find((candidate) =>
    normalizeWorkspaceRelativePath(candidate.relativePath) === normalizedPath
  );
  if (!file) {
    throw new Error(`Workspace change path "${relativePath}" does not match an existing Markdown note.`);
  }

  return file;
}

function appliedMarkdownContent(change: PreparedWorkspaceChange, beforeContent: string) {
  if (change.type === "update_note") {
    return requiredContent(change.content, change.type);
  }

  if (change.type === "add_tags") {
    if (!change.tags?.length) throw new Error("Workspace change \"add_tags\" requires at least one tag.");

    return addMarkdownTags(beforeContent, change.tags);
  }

  if (change.type === "add_links") {
    if (!change.links?.length) throw new Error("Workspace change \"add_links\" requires at least one link.");

    return addMarkdownLinks(beforeContent, change.links);
  }

  return beforeContent;
}

function addMarkdownTags(markdown: string, tags: readonly string[]) {
  const uniqueTags = uniqueTrimmedValues(tags);
  if (!uniqueTags.length) return markdown;

  const frontmatter = leadingYamlFrontmatter(markdown);
  if (!frontmatter) {
    return [
      "---",
      ...formatYamlTags([], uniqueTags),
      "---",
      "",
      markdown
    ].join("\n");
  }

  const nextBody = addTagsToYamlFrontmatterBody(frontmatter.body, uniqueTags);
  return `${markdown.slice(0, frontmatter.bodyFrom)}${nextBody}${markdown.slice(frontmatter.bodyTo)}`;
}

function addMarkdownLinks(markdown: string, links: readonly string[]) {
  const missingLinks = uniqueTrimmedValues(links).filter((link) => !markdown.includes(link));
  if (!missingLinks.length) return markdown;

  const relatedSection = [
    "## Related",
    "",
    ...missingLinks.map((link) => `- ${link}`)
  ].join("\n");

  return markdown.trimEnd()
    ? [markdown.trimEnd(), "", relatedSection].join("\n")
    : relatedSection;
}

function addTagsToYamlFrontmatterBody(body: string, tags: readonly string[]) {
  const lines = body.split(/\r?\n/u);
  const tagLineIndex = lines.findIndex((line) => /^tags\s*:/iu.test(line));
  if (tagLineIndex < 0) {
    return [...lines.filter((line, index) => index < lines.length - 1 || line), ...formatYamlTags([], tags)].join("\n");
  }

  const tagLine = lines[tagLineIndex] ?? "";
  const inlineTagValue = tagLine.replace(/^tags\s*:/iu, "").trim();
  const listEndIndex = inlineTagValue ? tagLineIndex + 1 : yamlListEndIndex(lines, tagLineIndex + 1);
  const existingTags = inlineTagValue
    ? parseInlineYamlTags(inlineTagValue)
    : lines.slice(tagLineIndex + 1, listEndIndex).map(parseYamlListTag).filter((tag): tag is string => Boolean(tag));
  const replacement = formatYamlTags(existingTags, tags);

  return [
    ...lines.slice(0, tagLineIndex),
    ...replacement,
    ...lines.slice(listEndIndex)
  ].join("\n");
}

function leadingYamlFrontmatter(markdown: string) {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---)(\r?\n|$)/u.exec(markdown);
  if (!match) return null;

  const opening = match[1] ?? "";
  const body = match[2] ?? "";

  return {
    body,
    bodyFrom: opening.length,
    bodyTo: opening.length + body.length
  };
}

function yamlListEndIndex(lines: readonly string[], startIndex: number) {
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (!/^\s*-\s+/u.test(line)) break;

    index += 1;
  }

  return index;
}

function parseYamlListTag(line: string) {
  const match = /^\s*-\s+(.+?)\s*$/u.exec(line);
  return match ? cleanYamlTagValue(match[1] ?? "") : null;
}

function parseInlineYamlTags(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map(cleanYamlTagValue)
      .filter(Boolean);
  }

  return [cleanYamlTagValue(trimmed)].filter(Boolean);
}

function cleanYamlTagValue(value: string) {
  return value.trim().replace(/^["']|["']$/gu, "");
}

function formatYamlTags(existingTags: readonly string[], nextTags: readonly string[]) {
  const tags = uniqueTrimmedValues([...existingTags, ...nextTags]);
  return [
    "tags:",
    ...tags.map((tag) => `  - ${tag}`)
  ];
}

function uniqueTrimmedValues(values: readonly string[]) {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  values.forEach((value) => {
    const trimmed = value.trim();
    const key = trimmed.toLocaleLowerCase();
    if (!trimmed || seen.has(key)) return;

    seen.add(key);
    uniqueValues.push(trimmed);
  });

  return uniqueValues;
}

function emitWorkspacePlanVisualEvent(
  options: ApplyWorkspaceChangePlanOptions,
  event: WorkspacePlanVisualEvent
) {
  try {
    const result = options.onVisualEvent?.(event);
    if (isPromiseLike(result)) {
      result.catch(() => {});
    }
  } catch {
    // Visual observers must not block confirmed workspace file operations.
  }
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    "catch" in value &&
    typeof (value as { catch?: unknown }).catch === "function"
  );
}

function visualStepEvent(
  change: PreparedWorkspaceChange,
  index: number,
  type: WorkspacePlanVisualStepEvent["type"],
  overrides: Partial<WorkspacePlanVisualStepEvent> = {}
): WorkspacePlanVisualStepEvent {
  const path = change.path ?? overrides.path;
  const from = change.from ?? overrides.from;
  const to = change.to ?? overrides.to;

  return {
    action: change.type,
    index,
    label: change.label,
    target: visualTargetForWorkspaceChange(change.type),
    type,
    ...(path ? { path } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...overrides
  };
}

function visualTargetForWorkspaceChange(type: WorkspaceChangeKind): WorkspacePlanVisualTarget {
  if (type === "create_note" || type === "move_note" || type === "rename_note") return "file_tree";

  return "editor";
}
