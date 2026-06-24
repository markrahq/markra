import type { AiDocumentAnchor, AiHeadingAnchor, AiSelectionContext } from "../inline";
import type { AgentWorkspaceFile } from "../read-only-tools";
import {
  formatMarkdownSourceContext,
  formatSelectionSourceContext,
  resolveMarkdownSourceContext
} from "../selection";
import type { MarkdownImageReference, WorkspaceImageFile } from "./images";
import type { LocatedMarkdownRegion, LocatedSection } from "./locate";

export function formatHeadingOutlineText(headingAnchors: AiHeadingAnchor[]) {
  if (!headingAnchors.length) return "No Markdown headings are available in the current document.";

  return headingAnchors
    .map((heading) => `${"#".repeat(Math.max(1, heading.level))} ${heading.title} (${heading.from}-${heading.to})`)
    .join("\n");
}

export function formatSectionAnchorsText(sectionAnchors: AiDocumentAnchor[], documentContent?: string) {
  if (!sectionAnchors.length) return "No Markdown sections are available in the current document.";

  return sectionAnchors
    .map((section) => [
      `- ${section.id}: ${section.title ?? "(untitled)"} (${section.from}-${section.to})`,
      ...formatAnchorSourceLines(section, documentContent, "Markdown source context:")
    ].join("\n"))
    .join("\n");
}

export function formatDocumentAnchorsText(anchors: AiDocumentAnchor[]) {
  return anchors
    .map((anchor) => `- ${anchor.id}: ${anchor.description} (${anchor.from}-${anchor.to})`)
    .join("\n");
}

export function formatSelectionText(
  selection: AiSelectionContext | null,
  {
    documentContent,
    headingAnchors,
    sectionAnchors
  }: {
    documentContent?: string;
    headingAnchors?: AiHeadingAnchor[];
    sectionAnchors?: AiDocumentAnchor[];
  } = {}
) {
  if (!selection?.text.trim()) {
    return "No active selection or current block is available right now.";
  }

  return [
    `Range: ${selection.from}-${selection.to}`,
    `Cursor: ${selection.cursor ?? selection.to}`,
    `Source: ${selection.source ?? "selection"}`,
    ...(documentContent
      ? formatSelectionSourceContext({ documentContent, headingAnchors, sectionAnchors, selection })
      : []),
    "",
    selection.text
  ].join("\n");
}

export function formatWorkspaceFilesText(workspaceFiles: AgentWorkspaceFile[], limit: number | undefined) {
  if (!workspaceFiles.length) return "No nearby Markdown files are available.";

  return workspaceFiles
    .slice(0, limit ?? 40)
    .map((file) => `- ${file.relativePath}`)
    .join("\n");
}

export function formatWorkspaceFileContentText(file: AgentWorkspaceFile, content: string) {
  return [
    `Workspace file: ${file.relativePath}`,
    "",
    content.trim().length > 0 ? content : "(empty file)"
  ].join("\n");
}

export function formatDocumentImageReferencesText(references: MarkdownImageReference[]) {
  if (!references.length) return "No local Markdown image references are available in the current document.";

  return [
    "Markdown image references:",
    ...references.map((reference, index) => [
      `${index + 1}. src: ${reference.src}`,
      `   file: ${reference.fileName || "(unknown)"}`,
      `   alt: ${reference.alt || "(empty)"}`
    ].join("\n"))
  ].join("\n");
}

export function formatAssetInventoryText(
  references: MarkdownImageReference[],
  workspaceImages: WorkspaceImageFile[]
) {
  if (!references.length && !workspaceImages.length) return "No document image references or workspace image files are available.";

  return [
    ...(references.length
      ? [
          "Current document image references:",
          ...references.map((reference, index) => [
            `${index + 1}. src: ${reference.src}`,
            `   file: ${reference.fileName || "(unknown)"}`,
            `   alt: ${reference.alt || "(empty)"}`
          ].join("\n"))
        ]
      : ["Current document image references: none"]),
    "",
    ...(workspaceImages.length
      ? [
          "Workspace image files:",
          ...workspaceImages.map((file, index) => `${index + 1}. ${file.relativePath || file.name}`)
        ]
      : ["Workspace image files: none"])
  ].join("\n");
}

export function formatLocatedSectionText(
  located: LocatedSection,
  sectionAnchors: AiDocumentAnchor[] = [],
  documentContent?: string
) {
  const recommended = sectionAnchors.find((section) => section.id === located.anchorId);

  return [
    `Recommended section: ${located.anchorId ?? "none"}`,
    `Reason: ${located.reason}`,
    ...formatAnchorSourceLines(recommended, documentContent, "Recommended section source:"),
    "",
    "Top candidates:",
    ...located.candidates.map((candidate) => `- ${candidate.anchorId}: ${candidate.description} (${candidate.reason})`)
  ].join("\n");
}

export function formatLocatedRegionText(
  located: LocatedMarkdownRegion,
  anchors: AiDocumentAnchor[] = [],
  documentContent?: string
) {
  const recommended = anchors.find((anchor) => anchor.id === located.anchorId);

  return [
    `Recommended anchor: ${located.anchorId}`,
    `Reason: ${located.reason}`,
    ...formatAnchorSourceLines(recommended, documentContent, "Recommended anchor source:"),
    "",
    "Top candidates:",
    ...located.candidates.map((candidate) => `- ${candidate.anchorId}: ${candidate.description} (${candidate.reason})`)
  ].join("\n");
}

function formatAnchorSourceLines(anchor: AiDocumentAnchor | undefined, documentContent: string | undefined, label: string) {
  if (!anchor || anchor.kind === "document_end") return [];

  const source = resolveMarkdownSourceContext({
    documentContent: documentContent ?? "",
    fallbackText: anchor.text,
    from: anchor.from,
    to: anchor.to
  });

  return source ? formatMarkdownSourceContext(source, label) : [];
}
