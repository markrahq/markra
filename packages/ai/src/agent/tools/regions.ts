import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AiDiffResult, AiDiffTarget, AiDocumentAnchor, AiSelectionContext } from "../inline";
import {
  buildDocumentAnchors,
  buildSectionAnchors,
  currentContextAnchor,
  diffTargetFromAnchor,
  documentTableAnchors
} from "./anchors";
import type { DocumentAgentToolContext, DocumentAnchorPlacement, RegionOperation } from "./context";
import type { InsertContentArgs, MoveContentArgs } from "./params";
import { toolErrorResult } from "./results";
import {
  isCompleteMarkdownTableBlock,
  isCompleteMarkdownTableReplacement,
  looksLikeBlockMarkdown,
  normalizeText,
  overlapScore,
  sliceDocumentText,
  summarizeAnchorTitle
} from "./text";

export function beginPreparedWrite(
  context: DocumentAgentToolContext,
  mode: RegionOperation,
  options: {
    requireEditableContext?: boolean;
  } = {}
): { error: AgentToolResult<{ message: string }> } | { ok: true } {
  const requireEditableContext = options.requireEditableContext !== false;
  const hasStructuralAnchor =
    (context.headingAnchors ?? []).length > 0 ||
    buildSectionAnchors(context).length > 0 ||
    documentTableAnchors(context).length > 0;

  if (requireEditableContext && mode !== "insert" && !context.selection?.text.trim() && !hasStructuralAnchor) {
    return {
      error: toolErrorResult(
        `Cannot ${mode} because there is no active selection, current block, or structural anchor available. Inspect the document first and then resolve a region anchor.`
      )
    };
  }

  return { ok: true };
}

export function resolveWriteRegion(
  context: DocumentAgentToolContext,
  anchorId: string | undefined,
  mode: RegionOperation
): { error: AgentToolResult<{ message: string }> } | { region: { from: number; original: string; target?: AiDiffTarget; to: number } } {
  if (!anchorId) {
    if (!context.selection?.text.trim()) {
      return {
        error: toolErrorResult(
          `Cannot ${mode} because there is no active selection or current block. Resolve a document anchor first.`
        )
      };
    }

    return {
      region: {
        from: context.selection.from,
        original: context.selection.text,
        to: context.selection.to
      }
    };
  }

  const anchor = buildDocumentAnchors(context).find((candidate) => candidate.id === anchorId);
  if (!anchor) {
    return {
      error: toolErrorResult(`Cannot ${mode} because the anchor "${anchorId}" was not found.`)
    };
  }

  if (anchor.kind === "document_end") {
    return {
      error: toolErrorResult(`Cannot ${mode} the document-end anchor. Resolve a concrete block or heading instead.`)
    };
  }

  return {
    region: {
      from: anchor.from,
      original: anchor.text ?? sliceDocumentText(context.documentContent, anchor.from, anchor.to),
      ...(anchor.kind === "table" ? { target: diffTargetFromAnchor(anchor) } : {}),
      to: anchor.to
    }
  };
}

export function resolveBlockRegion(
  context: DocumentAgentToolContext,
  anchorId: string | undefined
): {
  anchorId: string;
  error: AgentToolResult<{ message: string }>;
} | {
  anchorId: string;
  region: { from: number; original: string; target: AiDiffTarget; to: number };
} {
  if (!anchorId) {
    if (!context.selection?.text.trim()) {
      return {
        anchorId: "current-context",
        error: toolErrorResult(
          "Cannot replace a block because there is no current editor block. Resolve a concrete block or heading anchor first."
        )
      };
    }

    const selectedBlock = resolveSelectedBlockRegion(context);
    if (selectedBlock) return selectedBlock;

    if (context.selection.source !== "block") {
      return {
        anchorId: "current-context",
        error: toolErrorResult(
          "Cannot replace a block because the current editor context is an inline selection. Use replace_content with targetKind=region for inline selection edits."
        )
      };
    }

    const target: AiDiffTarget = {
      from: context.selection.from,
      id: "current-context",
      kind: "current_block",
      title: summarizeAnchorTitle(context.selection.text),
      to: context.selection.to
    };

    return {
      anchorId: "current-context",
      region: {
        from: context.selection.from,
        original: context.selection.text,
        target,
        to: context.selection.to
      }
    };
  }

  const anchor = buildDocumentAnchors(context).find((candidate) => candidate.id === anchorId);
  if (!anchor) {
    return {
      anchorId,
      error: toolErrorResult(`Cannot replace a block because the anchor "${anchorId}" was not found.`)
    };
  }

  if (anchor.kind === "table") {
    return {
      anchorId,
      error: toolErrorResult("Cannot replace a table anchor with targetKind=block. Use replace_content with targetKind=table.")
    };
  }

  if (anchor.kind === "section") {
    return {
      anchorId,
      error: toolErrorResult("Cannot replace a section anchor with targetKind=block. Use replace_content with targetKind=section.")
    };
  }

  if (anchor.kind === "document") {
    return {
      anchorId,
      error: toolErrorResult("Cannot replace the whole-document anchor with targetKind=block. Use replace_content with targetKind=document.")
    };
  }

  if (anchor.kind === "document_end") {
    return {
      anchorId,
      error: toolErrorResult("Cannot replace the document-end anchor with targetKind=block. Resolve a concrete block or heading instead.")
    };
  }

  return {
    anchorId,
    region: {
      from: anchor.from,
      original: anchor.text ?? sliceDocumentText(context.documentContent, anchor.from, anchor.to),
      target: diffTargetFromAnchor(anchor),
      to: anchor.to
    }
  };
}

export function resolveSelectedBlockRegion(context: DocumentAgentToolContext): {
  anchorId: string;
  region: { from: number; original: string; target: AiDiffTarget; to: number };
} | null {
  const selection = context.selection;
  if (!selection?.text.trim()) return null;

  const selectedBlock = currentContextAnchor(context);
  if (!selectedBlock || (selectedBlock.from === selection.from && selectedBlock.to === selection.to)) return null;

  return {
    anchorId: selectedBlock.id,
    region: {
      from: selectedBlock.from,
      original: selectedBlock.text ?? sliceDocumentText(context.documentContent, selectedBlock.from, selectedBlock.to),
      target: diffTargetFromAnchor(selectedBlock),
      to: selectedBlock.to
    }
  };
}

export function ensureReplacementFitsRegion(
  context: DocumentAgentToolContext,
  anchorId: string | undefined,
  replacement: string,
  region: { original: string }
): { error: AgentToolResult<{ message: string }> } | { ok: true } {
  const isInlineSelection = !anchorId && context.selection?.source !== "block";
  if (isInlineSelection && looksLikeBlockMarkdown(replacement) && !looksLikeBlockMarkdown(region.original)) {
    return {
      error: toolErrorResult(
        "Cannot replace an inline selection with block-level Markdown. Use plain text for the selected text, or resolve a block, section, or document anchor before replacing a table, list, heading, or multi-paragraph region."
      )
    };
  }

  if (isCompleteMarkdownTableReplacement(replacement)) {
    const anchor = anchorId
      ? buildDocumentAnchors(context).find((candidate) => candidate.id === anchorId)
      : null;
    if (anchor?.kind !== "table" || !isCompleteMarkdownTableBlock(region.original)) {
      return {
        error: toolErrorResult(
          "Cannot replace this region with a Markdown table because the target is not a complete table anchor. Use replace_content with targetKind=table and a table anchor."
        )
      };
    }
  }

  return { ok: true };
}

export function resolveTableAnchor(
  context: DocumentAgentToolContext,
  anchorId: string
): { error: AgentToolResult<{ message: string }> } | { anchor: AiDocumentAnchor } {
  const tableAnchor = documentTableAnchors(context).find((candidate) => candidate.id === anchorId);
  if (!tableAnchor) {
    return {
      error: toolErrorResult(`Cannot resolve table anchor "${anchorId}". Read available anchors or locate a table first and use a valid table anchor.`)
    };
  }

  return { anchor: tableAnchor };
}

export function resolveTableByHeading(
  context: DocumentAgentToolContext,
  headingTitle: string
): { error: AgentToolResult<{ message: string }> } | { anchor: AiDocumentAnchor } {
  const normalizedHeadingTitle = normalizeText(headingTitle);
  if (!normalizedHeadingTitle) {
    return {
      error: toolErrorResult("Cannot resolve a table because the heading title is empty.")
    };
  }

  const tables = documentTableAnchors(context);
  if (!tables.length) {
    return {
      error: toolErrorResult("Cannot resolve a table because the current document has no Markdown table anchors.")
    };
  }

  const headings = [...(context.headingAnchors ?? [])].sort((left, right) => left.from - right.from);
  const headingIndex = headings.findIndex((heading) => {
    const normalizedTitle = normalizeText(heading.title);

    return normalizedTitle.length > 0 && (
      normalizedTitle === normalizedHeadingTitle ||
      normalizedTitle.includes(normalizedHeadingTitle) ||
      normalizedHeadingTitle.includes(normalizedTitle)
    );
  });

  if (headingIndex >= 0) {
    const heading = headings[headingIndex]!;
    const nextHeading = headings.slice(headingIndex + 1).find((candidate) => candidate.from > heading.from);
    const sectionEnd = nextHeading?.from ?? context.documentEndPosition;
    const table = tables.find((candidate) => candidate.from >= heading.to && candidate.from < sectionEnd);

    if (table) return { anchor: table };
  }

  const scoredTables = tables
    .map((anchor) => ({
      anchor,
      score: overlapScore(normalizedHeadingTitle, normalizeText(anchor.title ?? ""))
    }))
    .sort((left, right) => right.score - left.score);
  const best = scoredTables[0];
  if (best && best.score > 0) return { anchor: best.anchor };

  return {
    error: toolErrorResult(`Cannot resolve a table under heading "${headingTitle}". Read available anchors first or pass an exact table anchor.`)
  };
}

export function resolveBlockByText(
  context: DocumentAgentToolContext,
  originalText: string
): {
  error: AgentToolResult<{ message: string }>;
} | {
  region: { from: number; original: string; target: AiDiffTarget; to: number };
} {
  if (!originalText) {
    return {
      error: toolErrorResult("Cannot replace a block by text because originalText is empty.")
    };
  }

  const from = context.documentContent.indexOf(originalText);
  if (from < 0) {
    return {
      error: toolErrorResult("Cannot replace a block by text because the original text was not found in the current document.")
    };
  }

  const duplicateFrom = context.documentContent.indexOf(originalText, from + originalText.length);
  if (duplicateFrom >= 0) {
    return {
      error: toolErrorResult("Cannot replace a block by text because the original text appears multiple times. Use a more specific text snippet or resolve an anchor.")
    };
  }

  const to = from + originalText.length;
  const target: AiDiffTarget = {
    from,
    id: "text-match",
    kind: "current_block",
    title: summarizeAnchorTitle(originalText),
    to
  };

  return {
    region: {
      from,
      original: originalText,
      target,
      to
    }
  };
}

export function ensureCompleteTableReplacement(
  replacement: string
): { error: AgentToolResult<{ message: string }> } | { ok: true } {
  if (!isCompleteMarkdownTableBlock(replacement)) {
    return {
      error: toolErrorResult("Cannot replace a table with content that is not a complete Markdown table.")
    };
  }

  return { ok: true };
}

export function resolveSectionAnchor(
  context: DocumentAgentToolContext,
  anchorId: string
): { error: AgentToolResult<{ message: string }> } | { anchor: AiDocumentAnchor } {
  const sectionAnchor = buildSectionAnchors(context).find((candidate) => candidate.id === anchorId);
  if (!sectionAnchor) {
    return {
      error: toolErrorResult(`Cannot resolve section anchor "${anchorId}". Read document sections first and use a valid section anchor.`)
    };
  }

  return { anchor: sectionAnchor };
}

export function resolveAnyAnchor(
  context: DocumentAgentToolContext,
  anchorId: string
): { error: AgentToolResult<{ message: string }> } | { anchor: AiDocumentAnchor } {
  const anchor = [
    ...buildDocumentAnchors(context),
    ...buildSectionAnchors(context)
  ].find((candidate) => candidate.id === anchorId);

  if (!anchor) {
    return {
      error: toolErrorResult(`Cannot resolve anchor "${anchorId}". Inspect available anchors first and use a valid anchor id.`)
    };
  }

  return { anchor };
}

export function resolveExactTextRegion(
  context: DocumentAgentToolContext,
  text: string,
  label: string
): { error: AgentToolResult<{ message: string }> } | { region: { from: number; original: string; to: number } } {
  if (!text) {
    return {
      error: toolErrorResult(`Cannot resolve ${label} because the text is empty.`)
    };
  }

  const from = context.documentContent.indexOf(text);
  if (from < 0) {
    return {
      error: toolErrorResult(`Cannot resolve ${label} because the text was not found in the current document.`)
    };
  }

  const duplicateFrom = context.documentContent.indexOf(text, from + text.length);
  if (duplicateFrom >= 0) {
    return {
      error: toolErrorResult(`Cannot resolve ${label} because the text appears multiple times. Use a more specific snippet or an anchor id.`)
    };
  }

  return {
    region: {
      from,
      original: text,
      to: from + text.length
    }
  };
}

export function buildMovePreview(
  context: DocumentAgentToolContext,
  args: MoveContentArgs
): { error: AgentToolResult<{ message: string }> } | { result: AiDiffResult } {
  const source = resolveMoveSource(context, args);
  if ("error" in source) return source;
  const destination = resolveMoveDestination(context, args);
  if ("error" in destination) return destination;

  if (destination.position === source.region.from || destination.position === source.region.to) {
    return {
      error: toolErrorResult("Cannot move content because the requested move would not change the document.")
    };
  }

  if (destination.position > source.region.from && destination.position < source.region.to) {
    return {
      error: toolErrorResult("Cannot move content because the destination is inside the source range.")
    };
  }

  const sourceLength = source.region.to - source.region.from;
  const contentWithoutSource = [
    context.documentContent.slice(0, source.region.from),
    context.documentContent.slice(source.region.to)
  ].join("");
  const insertPosition = destination.position > source.region.to
    ? destination.position - sourceLength
    : destination.position;
  const movedContent = [
    contentWithoutSource.slice(0, insertPosition),
    source.region.original,
    contentWithoutSource.slice(insertPosition)
  ].join("");
  const result = moveReplaceResult(
    context.documentContent,
    movedContent,
    source.region,
    destination.position
  );
  if (!result) {
    return {
      error: toolErrorResult("Cannot move content because the requested move would not change the document.")
    };
  }

  return { result };
}

function resolveMoveSource(
  context: DocumentAgentToolContext,
  args: MoveContentArgs
): { error: AgentToolResult<{ message: string }> } | { region: { from: number; original: string; to: number } } {
  if (args.sourceAnchorId) {
    const source = resolveAnyAnchor(context, args.sourceAnchorId);
    if ("error" in source) return source;
    if (source.anchor.kind === "document" || source.anchor.kind === "document_end") {
      return {
        error: toolErrorResult("Cannot move the whole-document or document-end anchor. Use a concrete block, table, heading, section, or text snippet.")
      };
    }

    return {
      region: {
        from: source.anchor.from,
        original: source.anchor.text ?? sliceDocumentText(context.documentContent, source.anchor.from, source.anchor.to),
        to: source.anchor.to
      }
    };
  }

  if (args.sourceText) {
    return resolveExactTextRegion(context, args.sourceText, "move source");
  }

  return {
    error: toolErrorResult("Cannot move content because neither sourceAnchorId nor sourceText was provided.")
  };
}

function resolveMoveDestination(
  context: DocumentAgentToolContext,
  args: MoveContentArgs
): { error: AgentToolResult<{ message: string }> } | { position: number } {
  if (args.destinationAnchorId) {
    const destination = resolveAnyAnchor(context, args.destinationAnchorId);
    if ("error" in destination) return destination;

    return {
      position: args.placement === "after" ? destination.anchor.to : destination.anchor.from
    };
  }

  if (args.destinationText) {
    const destination = resolveExactTextRegion(context, args.destinationText, "move destination");
    if ("error" in destination) return destination;

    return {
      position: args.placement === "after" ? destination.region.to : destination.region.from
    };
  }

  return {
    error: toolErrorResult("Cannot move content because neither destinationAnchorId nor destinationText was provided.")
  };
}

function moveReplaceResult(
  originalContent: string,
  nextContent: string,
  source: { from: number; to: number },
  destinationPosition: number
): AiDiffResult | null {
  const from = Math.min(source.from, destinationPosition);
  const to = Math.max(source.to, destinationPosition);
  if (originalContent.slice(from, to) === nextContent.slice(from, to)) return null;

  return {
    from,
    original: originalContent.slice(from, to),
    replacement: nextContent.slice(from, to),
    to,
    type: "replace"
  };
}

export function resolveInsertionPosition(
  context: DocumentAgentToolContext,
  args: InsertContentArgs
): { error: AgentToolResult<{ message: string }> } | { position: number } {
  if (args.anchorId) {
    const anchor = buildDocumentAnchors(context).find((candidate) => candidate.id === args.anchorId);
    if (!anchor) {
      return {
        error: toolErrorResult(`Cannot insert because the anchor "${args.anchorId}" was not found.`)
      };
    }

    return {
      position: insertionPositionForAnchor(anchor, args.placement)
    };
  }

  if (context.selection) {
    return {
      position: insertionPositionForSelection(context.selection, args.placement)
    };
  }

  if (args.placement === "cursor") {
    return {
      position: context.documentEndPosition
    };
  }

  return {
    error: toolErrorResult(
      "Cannot insert because there is no active editor selection for that placement. Call locate_content or inspect_document_structure first and then insert via anchorId."
    )
  };
}

function insertionPositionForSelection(
  selection: AiSelectionContext,
  placement: DocumentAnchorPlacement
) {
  if (placement === "before_selection" || placement === "before_anchor" || placement === "before_heading") {
    return selection.from;
  }

  if (placement === "after_selection" || placement === "after_anchor" || placement === "after_heading") {
    return selection.to;
  }

  return selection.cursor ?? selection.to;
}

function insertionPositionForAnchor(anchor: AiDocumentAnchor, placement: DocumentAnchorPlacement) {
  if (anchor.kind === "document") {
    if (placement === "before_anchor" || placement === "before_heading" || placement === "before_selection") return anchor.from;

    return anchor.to;
  }
  if (anchor.kind === "document_end") return anchor.to;
  if (placement === "before_anchor" || placement === "before_heading" || placement === "before_selection") return anchor.from;
  if (placement === "cursor") return anchor.to;

  return anchor.to;
}
