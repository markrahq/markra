import type { AiDocumentAnchor } from "../inline";
import type { RegionOperation } from "./context";
import { containsAny, normalizeText, overlapScore } from "./text";

export type LocatedMarkdownRegion = ReturnType<typeof locateMarkdownRegion>;
export type LocatedSection = ReturnType<typeof locateSection>;

export function locateMarkdownRegion(anchors: AiDocumentAnchor[], goal: string, operation: RegionOperation) {
  const normalizedGoal = normalizeText(goal);
  const scoredAnchors = anchors
    .map((anchor) => ({
      anchor,
      reason: anchorReason(anchor, normalizedGoal, operation),
      score: scoreAnchor(anchor, normalizedGoal, operation)
    }))
    .sort((left, right) => right.score - left.score);

  const best = scoredAnchors[0] ?? {
    anchor: {
      description: "End of the current document",
      from: 0,
      id: "document-end",
      kind: "document_end" as const,
      to: 0
    },
    reason: "Fallback to the end of the current document.",
    score: 0
  };

  return {
    anchorId: best.anchor.id,
    candidates: scoredAnchors.slice(0, 3).map((item) => ({
      anchorId: item.anchor.id,
      description: item.anchor.description,
      reason: item.reason,
      score: item.score
    })),
    operation,
    reason: best.reason
  };
}

export function locateSection(sectionAnchors: AiDocumentAnchor[], args: { goal?: string; headingTitle?: string }) {
  const normalizedHeadingTitle = normalizeText(args.headingTitle ?? "");
  const normalizedGoal = normalizeText(args.goal ?? args.headingTitle ?? "");
  const scoredSections = sectionAnchors
    .map((anchor) => {
      const normalizedTitle = normalizeText(anchor.title ?? "");
      let score = overlapScore(normalizedGoal, normalizedTitle);

      if (normalizedHeadingTitle && normalizedTitle === normalizedHeadingTitle) score += 20;
      if (normalizedHeadingTitle && normalizedTitle.includes(normalizedHeadingTitle)) score += 8;
      if (containsAny(normalizedGoal, ["section", "heading", "chapter", "小节", "章节", "标题"])) score += 2;

      return {
        anchor,
        reason:
          normalizedHeadingTitle && normalizedTitle === normalizedHeadingTitle
            ? `Exact heading match for "${anchor.title ?? ""}".`
            : `Best semantic section match for "${args.goal ?? args.headingTitle ?? ""}".`,
        score
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = scoredSections[0];
  if (!best) {
    return {
      anchorId: null,
      candidates: [],
      reason: "No section anchor is available in the current document."
    };
  }

  return {
    anchorId: best.anchor.id,
    candidates: scoredSections.slice(0, 3).map((candidate) => ({
      anchorId: candidate.anchor.id,
      description: candidate.anchor.description,
      reason: candidate.reason,
      score: candidate.score
    })),
    reason: best.reason
  };
}

function scoreAnchor(anchor: AiDocumentAnchor, normalizedGoal: string, operation: RegionOperation) {
  let score = 0;

  if (anchor.kind === "document") {
    if (
      operation !== "insert" &&
      containsAny(normalizedGoal, [
        "all content",
        "clean up",
        "compress",
        "entire document",
        "full document",
        "keep only",
        "only keep",
        "rewrite document",
        "whole document",
        "全文",
        "只保留",
        "整个文档",
        "整篇",
        "清理",
        "压缩"
      ])
    ) {
      score += 18;
    }
  }

  if (anchor.kind === "current_block") {
    if (containsAny(normalizedGoal, ["current", "current block", "current section", "here", "selected", "this block", "this section", "这里", "当前", "此处", "本段", "选中"])) score += 10;
    if (operation !== "insert") score += 2;
  }

  if (anchor.kind === "table") {
    const normalizedTitle = normalizeText(anchor.title ?? "");
    const normalizedTable = normalizeText(anchor.text ?? "");
    if (operation !== "insert" && containsAny(normalizedGoal, ["table", "matrix", "grid", "表格", "表"])) score += 22;
    if (normalizedGoal.includes(normalizedTitle) && normalizedTitle) score += 10;
    score += overlapScore(normalizedGoal, normalizedTitle) * 2;
    score += Math.min(12, overlapScore(normalizedGoal, normalizedTable));
    if (operation !== "insert") score += 4;
  }

  if (anchor.kind === "document_end") {
    if (containsAny(normalizedGoal, ["append", "at the end", "document end", "end of document", "final section", "末尾", "文末", "最后", "结尾", "追加"])) score += 12;
    else score += 1;
  }

  if (anchor.kind === "heading") {
    const normalizedTitle = normalizeText(anchor.title ?? "");
    if (normalizedGoal.includes(normalizedTitle) && normalizedTitle) score += 14;
    if (normalizedTitle.includes(normalizedGoal) && normalizedGoal) score += 8;
    score += overlapScore(normalizedGoal, normalizedTitle);
    if (containsAny(normalizedGoal, ["section", "heading", "chapter", "标题", "章节", "小节"])) score += 2;
  }

  return score;
}

function anchorReason(anchor: AiDocumentAnchor, normalizedGoal: string, operation: RegionOperation) {
  if (anchor.kind === "document" && scoreAnchor(anchor, normalizedGoal, operation) >= 10) {
    return "The request points to a whole-document edit.";
  }
  if (anchor.kind === "current_block" && scoreAnchor(anchor, normalizedGoal, operation) >= 10) {
    return "The request points to the current editing context.";
  }
  if (anchor.kind === "heading" && scoreAnchor(anchor, normalizedGoal, operation) >= 10) {
    return `The request best matches the heading "${anchor.title ?? ""}".`;
  }
  if (anchor.kind === "table" && scoreAnchor(anchor, normalizedGoal, operation) >= 10) {
    return `The request best matches the Markdown table "${anchor.title ?? ""}".`;
  }
  if (anchor.kind === "document_end") {
    return "The request looks like an append-at-the-end operation.";
  }

  return `This anchor is available as a fallback ${anchor.kind.replace("_", " ")} location.`;
}
