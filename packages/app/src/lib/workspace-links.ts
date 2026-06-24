import {
  findMarkdownUnlinkedMentions,
  getMarkdownOutline,
  parseMarkdownLinkReferences,
  parseMarkdownMentionRanges,
  type MarkdownMentionRange
} from "@markra/markdown";
import { resolveMarkdownDocumentLinkFile } from "./document-links";

export type WorkspaceLinkFile = {
  createdAt?: number;
  kind?: "asset" | "attachment" | "folder";
  modifiedAt?: number;
  name: string;
  path: string;
  relativePath: string;
};

export type WorkspaceLinkReadResult = {
  content: string;
  path: string;
};

export type WorkspaceLinkOccurrence = {
  columnNumber: number;
  from: number;
  href: string;
  lineNumber: number;
  lineText: string;
  sourceFile: WorkspaceLinkFile;
  targetFile: WorkspaceLinkFile;
  text: string;
  to: number;
};

export type WorkspaceUnlinkedMention = {
  columnNumber: number;
  from: number;
  lineNumber: number;
  lineText: string;
  sourceFile: WorkspaceLinkFile;
  targetFile: WorkspaceLinkFile;
  text: string;
  to: number;
};

export type WorkspaceLinkIndex = {
  backlinks: WorkspaceLinkOccurrence[];
  fileCount: number;
  files: WorkspaceLinkIndexFile[];
  unlinkedMentions: WorkspaceUnlinkedMention[];
  unreadableFileCount: number;
};

export type WorkspaceLinkIndexFile = {
  file: WorkspaceLinkFile;
  mentionRanges: MarkdownMentionRange[];
  titleCandidates: string[];
};

export type BuildWorkspaceLinkIndexOptions = {
  currentDocument?: WorkspaceLinkReadResult | null;
  readFile: (path: string) => Promise<WorkspaceLinkReadResult>;
};

const markdownDocumentExtensionPattern = /\.(md|markdown)$/iu;

function normalizePathSeparators(path: string) {
  return path.replace(/\\/gu, "/");
}

function trimPathSlashes(path: string) {
  return path.replace(/^\/+/u, "").replace(/\/+$/u, "");
}

function normalizeTitle(value: string) {
  return value.trim().toLocaleLowerCase();
}

function markdownFileTitle(file: WorkspaceLinkFile) {
  return file.name.replace(markdownDocumentExtensionPattern, "");
}

function isWorkspaceMarkdownLinkFile(file: WorkspaceLinkFile) {
  return file.kind !== "asset" && file.kind !== "attachment" && file.kind !== "folder" && markdownDocumentExtensionPattern.test(file.name);
}

function uniqueValues(values: readonly string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  values.forEach((value) => {
    const title = value.trim();
    const key = normalizeTitle(title);
    if (!title || seen.has(key)) return;

    seen.add(key);
    unique.push(title);
  });

  return unique;
}

function titleCandidatesForFile(file: WorkspaceLinkFile, content: string) {
  const outline = getMarkdownOutline(content);
  const firstHeading = outline.find((item) => item.level === 1)?.title;

  return uniqueValues([markdownFileTitle(file), firstHeading ?? ""]);
}

function relativePathWithoutMarkdownExtension(file: WorkspaceLinkFile) {
  return normalizePathSeparators(file.relativePath).replace(markdownDocumentExtensionPattern, "");
}

function resolveWikiDocumentLink(href: string, files: readonly WorkspaceLinkFile[]) {
  const cleanHref = trimPathSlashes(normalizePathSeparators(href.split("#")[0] ?? ""));
  if (!cleanHref) return null;

  const exactPath = files.find((file) => (
    isWorkspaceMarkdownLinkFile(file) &&
    relativePathWithoutMarkdownExtension(file).toLocaleLowerCase() === cleanHref.toLocaleLowerCase()
  ));
  if (exactPath) return exactPath;

  const titleMatches = files.filter((file) => (
    isWorkspaceMarkdownLinkFile(file) &&
    normalizeTitle(markdownFileTitle(file)) === normalizeTitle(cleanHref)
  ));

  return titleMatches.length === 1 ? titleMatches[0] ?? null : null;
}

function resolveWorkspaceDocumentLink(
  href: string,
  sourceFile: WorkspaceLinkFile,
  files: readonly WorkspaceLinkFile[]
) {
  const markdownLink = resolveMarkdownDocumentLinkFile(href, sourceFile.path, files);
  if (markdownLink) return markdownLink;

  return resolveWikiDocumentLink(href, files);
}

function titleOwnership(files: readonly WorkspaceLinkIndexFile[]) {
  const owners = new Map<string, Set<string>>();

  files.forEach((file) => {
    file.titleCandidates.forEach((title) => {
      const key = normalizeTitle(title);
      const current = owners.get(key) ?? new Set<string>();
      current.add(file.file.path);
      owners.set(key, current);
    });
  });

  return owners;
}

function unambiguousMentionCandidates(files: readonly WorkspaceLinkIndexFile[]) {
  const owners = titleOwnership(files);

  return files.flatMap((file) =>
    file.titleCandidates
      .filter((title) => owners.get(normalizeTitle(title))?.size === 1)
      .map((title) => ({
        id: file.file.path,
        title
      }))
  );
}

export async function buildWorkspaceLinkIndex(
  files: readonly WorkspaceLinkFile[],
  options: BuildWorkspaceLinkIndexOptions
): Promise<WorkspaceLinkIndex> {
  const markdownFiles = files.filter(isWorkspaceMarkdownLinkFile);
  let unreadableFileCount = 0;
  const indexedFiles = await Promise.all(markdownFiles.map(async (file) => {
    try {
      const read = options.currentDocument?.path === file.path
        ? options.currentDocument
        : await options.readFile(file.path);

      return {
        content: read.content,
        file,
        mentionRanges: parseMarkdownMentionRanges(read.content),
        titleCandidates: titleCandidatesForFile(file, read.content)
      };
    } catch {
      unreadableFileCount += 1;
      return null;
    }
  }));
  const readableFiles = indexedFiles.filter((file): file is NonNullable<typeof file> => file !== null);
  const backlinks: WorkspaceLinkOccurrence[] = [];
  const candidates = unambiguousMentionCandidates(readableFiles);
  const fileByPath = new Map(readableFiles.map((file) => [file.file.path, file]));
  const unlinkedMentions: WorkspaceUnlinkedMention[] = [];

  readableFiles.forEach((source) => {
    parseMarkdownLinkReferences(source.content).forEach((link) => {
      const targetFile = resolveWorkspaceDocumentLink(link.href, source.file, markdownFiles);
      if (!targetFile) return;

      backlinks.push({
        columnNumber: link.columnNumber,
        from: link.from,
        href: link.href,
        lineNumber: link.lineNumber,
        lineText: link.lineText,
        sourceFile: source.file,
        targetFile,
        text: link.text,
        to: link.to
      });
    });
  });

  readableFiles.forEach((source) => {
    const sourceCandidates = candidates.filter((candidate) => candidate.id !== source.file.path);

    findMarkdownUnlinkedMentions(source.mentionRanges, sourceCandidates).forEach((mention) => {
      const target = fileByPath.get(mention.candidate.id);
      if (!target) return;

      unlinkedMentions.push({
        columnNumber: mention.columnNumber,
        from: mention.from,
        lineNumber: mention.lineNumber,
        lineText: mention.lineText,
        sourceFile: source.file,
        targetFile: target.file,
        text: mention.text,
        to: mention.to
      });
    });
  });

  return {
    backlinks,
    fileCount: markdownFiles.length,
    files: readableFiles.map(({ file, mentionRanges, titleCandidates }) => ({ file, mentionRanges, titleCandidates })),
    unlinkedMentions,
    unreadableFileCount
  };
}

export function workspaceBacklinksForPath(index: WorkspaceLinkIndex, path: string) {
  return index.backlinks.filter((link) => link.targetFile.path === path);
}

export function workspaceUnlinkedMentionsForPath(index: WorkspaceLinkIndex, path: string) {
  return index.unlinkedMentions.filter((mention) => mention.targetFile.path === path);
}
