import { parse } from "yaml";
import type { AgentWorkspaceFile } from "./read-only-tools";

export type WorkspaceSkill = {
  description: string;
  name: string;
  path: string;
  relativePath: string;
};

export type ActiveWorkspaceSkill = WorkspaceSkill & {
  content: string;
};

type SkillSource = WorkspaceSkill & {
  content: string;
  scopeIndex: number;
};

type SkillMetadata = Pick<WorkspaceSkill, "description" | "name">;

type CachedSkillFile = {
  content: string;
  fingerprint: string;
  metadata: SkillMetadata | null;
};

const skillCatalogMaxChars = 8_000;
const activeSkillMaxChars = 24_000;
const activeSkillsMaxChars = 32_000;
const activeSkillsMaxCount = 3;
const skillCacheMaxEntries = 256;
const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const skillFileCache = new Map<string, CachedSkillFile>();

export async function loadWorkspaceSkills({
  prompt,
  readWorkspaceFile,
  scopeDirectories,
  workspaceFiles
}: {
  prompt: string;
  readWorkspaceFile: (path: string) => Promise<string>;
  scopeDirectories: string[];
  workspaceFiles: AgentWorkspaceFile[];
}) {
  const candidates = scopeDirectories.flatMap((directory, scopeIndex) => {
    const skillsDirectory = joinRelativePath(directory, ".agents/skills");

    return workspaceFiles
      .filter((file) => isDirectSkillFile(file, skillsDirectory))
      .map((file) => ({ file, scopeIndex }));
  });
  const loaded = await Promise.all(candidates.map(async ({ file, scopeIndex }) => {
    const source = await loadSkillSource(file, scopeIndex, readWorkspaceFile);

    return source?.name === skillDirectoryName(file.relativePath) ? source : null;
  }));
  const orderedSources = loaded
    .filter((skill): skill is SkillSource => skill !== null)
    .sort((left, right) => (
      left.scopeIndex - right.scopeIndex ||
      left.name.localeCompare(right.name) ||
      left.relativePath.localeCompare(right.relativePath)
    ));
  const closestSourceByName = new Map<string, SkillSource>();

  // Active scopes are root-to-leaf, so replacement makes one name resolve to its closest definition.
  orderedSources.forEach((skill) => closestSourceByName.set(skill.name, skill));

  const effectiveSources = [...closestSourceByName.values()].sort((left, right) => (
    left.scopeIndex - right.scopeIndex ||
    left.name.localeCompare(right.name) ||
    left.relativePath.localeCompare(right.relativePath)
  ));

  return {
    activeSkills: activateExplicitSkills(effectiveSources, explicitSkillNames(prompt)),
    skills: effectiveSources.map(({ content: _content, scopeIndex: _scopeIndex, ...skill }) => skill)
  };
}

export function formatSkillCatalog(skills: WorkspaceSkill[], canLoadSkills: boolean) {
  if (skills.length === 0) return "";

  const introduction = [
    "Available workspace skills:",
    "Use a skill when the user explicitly mentions it as $skill-name or when the request clearly matches its description."
  ];
  if (canLoadSkills) {
    introduction.push(
      "For an implicitly matched skill that is not already activated below, use load_skill to load its full SKILL.md before following it."
    );
  }

  const lines = skills.map((skill) => (
    `- $${skill.name}: ${skill.description} (path: ${skill.relativePath})`
  ));

  return truncateTextWithinBudget(
    [...introduction, ...lines].join("\n"),
    skillCatalogMaxChars,
    `[Truncated to ${skillCatalogMaxChars} characters.]`
  );
}

export function formatActiveSkills(skills: ActiveWorkspaceSkill[]) {
  if (skills.length === 0) return "";

  return [
    "Activated workspace skills:",
    ...skills.map((skill) => [
      `<workspace-skill name="${skill.name}" source="${skill.relativePath}">`,
      skill.content,
      "</workspace-skill>"
    ].join("\n"))
  ].join("\n\n");
}

async function loadSkillSource(
  file: AgentWorkspaceFile,
  scopeIndex: number,
  readWorkspaceFile: (path: string) => Promise<string>
): Promise<SkillSource | null> {
  const fingerprint = skillFileFingerprint(file);
  const cached = fingerprint ? skillFileCache.get(file.path) : undefined;
  if (cached?.fingerprint === fingerprint) {
    touchCachedSkill(file.path, cached);

    return cached.metadata ? skillSource(file, scopeIndex, cached.metadata, cached.content) : null;
  }

  const content = await safelyReadWorkspaceFile(readWorkspaceFile, file.path);
  if (!content) return null;

  const metadata = parseSkillMetadata(content);
  const boundedContent = truncateTextWithinBudget(
    content,
    activeSkillMaxChars,
    `[Truncated to ${activeSkillMaxChars} characters.]`
  );
  if (fingerprint) {
    cacheSkillFile(file.path, {
      content: boundedContent,
      fingerprint,
      metadata
    });
  }

  return metadata ? skillSource(file, scopeIndex, metadata, boundedContent) : null;
}

function skillSource(
  file: AgentWorkspaceFile,
  scopeIndex: number,
  metadata: SkillMetadata,
  content: string
): SkillSource {
  return {
    content,
    description: metadata.description,
    name: metadata.name,
    path: file.path,
    relativePath: file.relativePath,
    scopeIndex
  };
}

function activateExplicitSkills(skillSources: SkillSource[], requestedNames: string[]) {
  const sourceByName = new Map(skillSources.map((skill) => [skill.name, skill]));
  const activeSkills: ActiveWorkspaceSkill[] = [];
  let remainingChars = activeSkillsMaxChars;

  for (const name of requestedNames) {
    if (activeSkills.length >= activeSkillsMaxCount || remainingChars <= 0) break;

    const source = sourceByName.get(name);
    if (!source) continue;

    const content = truncateTextWithinBudget(
      source.content,
      Math.min(activeSkillMaxChars, remainingChars),
      "[Truncated to fit the active Skills context budget.]"
    );
    if (!content) break;

    const { scopeIndex: _scopeIndex, ...skill } = source;
    activeSkills.push({
      ...skill,
      content
    });
    remainingChars -= content.length;
  }

  return activeSkills;
}

function explicitSkillNames(prompt: string) {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const match of prompt.matchAll(/\$([a-z0-9]+(?:-[a-z0-9]+)*)\b/giu)) {
    const name = match[1]?.toLowerCase();
    if (!name || seen.has(name)) continue;

    names.push(name);
    seen.add(name);
  }

  return names;
}

function parseSkillMetadata(content: string): SkillMetadata | null {
  const normalized = content.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const frontmatterMatch = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(normalized);
  if (!frontmatterMatch) return null;

  try {
    const value = parse(frontmatterMatch[1] ?? "") as unknown;
    if (!isStringKeyedObject(value)) return null;

    const name = typeof value.name === "string" ? value.name.trim() : "";
    const description = typeof value.description === "string" ? value.description.trim() : "";
    if (
      !name ||
      name.length > 64 ||
      !description ||
      description.length > 1_024 ||
      !skillNamePattern.test(name)
    ) return null;

    return {
      description,
      name
    };
  } catch {
    return null;
  }
}

function skillFileFingerprint(file: AgentWorkspaceFile) {
  if (!Number.isFinite(file.modifiedAt) || !Number.isFinite(file.sizeBytes)) return null;

  return `${file.modifiedAt}:${file.sizeBytes}`;
}

function touchCachedSkill(path: string, cached: CachedSkillFile) {
  skillFileCache.delete(path);
  skillFileCache.set(path, cached);
}

function cacheSkillFile(path: string, cached: CachedSkillFile) {
  skillFileCache.delete(path);
  skillFileCache.set(path, cached);

  while (skillFileCache.size > skillCacheMaxEntries) {
    const oldestPath = skillFileCache.keys().next().value as string | undefined;
    if (!oldestPath) break;

    skillFileCache.delete(oldestPath);
  }
}

function isStringKeyedObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function safelyReadWorkspaceFile(
  readWorkspaceFile: (path: string) => Promise<string>,
  path: string
) {
  try {
    return await readWorkspaceFile(path);
  } catch {
    return null;
  }
}

function isDirectSkillFile(file: AgentWorkspaceFile, skillsDirectory: string) {
  if (file.kind === "folder") return false;

  const relativePath = normalizeRelativePath(file.relativePath);
  const prefix = `${skillsDirectory}/`;
  if (!relativePath.startsWith(prefix)) return false;

  const remainder = relativePath.slice(prefix.length).split("/");
  return remainder.length === 2 && Boolean(remainder[0]?.length) && remainder[1] === "SKILL.md";
}

function skillDirectoryName(relativePath: string) {
  return normalizeRelativePath(relativePath).split("/").at(-2) ?? "";
}

function joinRelativePath(directory: string, name: string) {
  return directory ? `${directory}/${name}` : name;
}

function normalizeRelativePath(path: string) {
  return path.replace(/\\/gu, "/").replace(/^\.\/+/u, "").replace(/\/+/gu, "/");
}

function truncateTextWithinBudget(text: string, maxChars: number, marker: string) {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  if (marker.length >= maxChars) return text.slice(0, maxChars);

  const separator = "\n\n";
  const contentMaxChars = maxChars - separator.length - marker.length;

  return `${text.slice(0, contentMaxChars)}${separator}${marker}`;
}
