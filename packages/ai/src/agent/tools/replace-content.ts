import { Type } from "@mariozechner/pi-ai";
import type { AiDiffResult } from "../inline";
import { diffTargetFromAnchor } from "./anchors";
import { DocumentAgentToolFactory } from "./base";
import type { DocumentAgentToolContext } from "./context";
import type { ContentTargetKind } from "./params";
import { typedReplaceContentArgs } from "./params";
import { toolErrorResult } from "./results";
import {
  beginPreparedWrite,
  ensureCompleteTableReplacement,
  ensureReplacementFitsRegion,
  resolveBlockByText,
  resolveBlockRegion,
  resolveSelectedBlockRegion,
  resolveSectionAnchor,
  resolveTableAnchor,
  resolveTableByHeading,
  resolveWriteRegion
} from "./regions";
import { looksLikeBlockMarkdown, sliceDocumentText } from "./text";

export class ReplaceContentToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedReplaceContentArgs>> {
  protected readonly description = [
    "Replace existing Markdown content.",
    "Use targetKind=document only when the user explicitly asks to rewrite the whole document.",
    "Use targetKind=section, table, block, or region for localized edits; pass originalText when the user quotes exact text."
  ].join(" ");
  protected readonly label = "Replace content";
  protected readonly name = "replace_content";
  protected readonly parameters = Type.Object({
    anchorId: Type.Optional(Type.String({ minLength: 1 })),
    headingTitle: Type.Optional(Type.String({ minLength: 1 })),
    originalText: Type.Optional(Type.String({ minLength: 1 })),
    replacement: Type.String(),
    targetKind: Type.Optional(Type.Union([
      Type.Literal("block"),
      Type.Literal("document"),
      Type.Literal("region"),
      Type.Literal("section"),
      Type.Literal("table")
    ]))
  });

  protected parseParams(params: unknown) {
    return typedReplaceContentArgs(params);
  }

  protected executeTool(toolCallId: string, params: ReturnType<typeof typedReplaceContentArgs>) {
    const targetKind = inferReplaceTargetKind(this.context, params);

    if (targetKind === "document") {
      return this.replaceDocument(toolCallId, params.replacement);
    }
    if (targetKind === "section") {
      return this.replaceSection(toolCallId, params);
    }
    if (targetKind === "table") {
      return this.replaceTable(toolCallId, params);
    }
    if (targetKind === "block") {
      return this.replaceBlock(toolCallId, params);
    }

    return this.replaceRegion(toolCallId, params);
  }

  private replaceDocument(toolCallId: string, replacement: string) {
    const writeCheck = beginPreparedWrite(this.context, "replace", {
      requireEditableContext: false
    });
    if ("error" in writeCheck) return writeCheck.error;

    const result: AiDiffResult = {
      from: 0,
      original: this.context.documentContent,
      replacement,
      to: this.context.documentEndPosition,
      type: "replace"
    };

    return this.preparePreview(toolCallId, result, "Prepared a full-document replacement preview.");
  }

  private replaceSection(toolCallId: string, params: ReturnType<typeof typedReplaceContentArgs>) {
    const writeCheck = beginPreparedWrite(this.context, "replace");
    if ("error" in writeCheck) return writeCheck.error;
    if (!params.anchorId) {
      return toolErrorResult("Cannot replace a section because anchorId was not provided.");
    }

    const section = resolveSectionAnchor(this.context, params.anchorId);
    if ("error" in section) return section.error;

    const result: AiDiffResult = {
      from: section.anchor.from,
      original: section.anchor.text ?? "",
      replacement: params.replacement,
      to: section.anchor.to,
      type: "replace"
    };

    return this.preparePreview(
      toolCallId,
      result,
      `Prepared a section replacement preview for ${section.anchor.title ?? section.anchor.id}.`
    );
  }

  private replaceTable(toolCallId: string, params: ReturnType<typeof typedReplaceContentArgs>) {
    const writeCheck = beginPreparedWrite(this.context, "replace");
    if ("error" in writeCheck) return writeCheck.error;

    const table = params.anchorId
      ? resolveTableAnchor(this.context, params.anchorId)
      : params.headingTitle
        ? resolveTableByHeading(this.context, params.headingTitle)
        : {
            error: toolErrorResult(
              "Cannot replace a table because neither anchorId nor headingTitle was provided. Locate a table anchor first or pass a matching headingTitle."
            )
          };
    if ("error" in table) return table.error;
    const tableCheck = ensureCompleteTableReplacement(params.replacement);
    if ("error" in tableCheck) return tableCheck.error;

    const result: AiDiffResult = {
      from: table.anchor.from,
      original: table.anchor.text ?? sliceDocumentText(this.context.documentContent, table.anchor.from, table.anchor.to),
      replacement: params.replacement,
      target: diffTargetFromAnchor(table.anchor),
      to: table.anchor.to,
      type: "replace"
    };

    return this.preparePreview(
      toolCallId,
      result,
      `Prepared a table replacement preview for ${table.anchor.title ?? table.anchor.id}.`
    );
  }

  private replaceBlock(toolCallId: string, params: ReturnType<typeof typedReplaceContentArgs>) {
    const usesOriginalText = !params.anchorId && Boolean(params.originalText);
    const writeCheck = beginPreparedWrite(
      this.context,
      "replace",
      usesOriginalText ? { requireEditableContext: false } : {}
    );
    if ("error" in writeCheck) return writeCheck.error;

    const block = params.anchorId
      ? resolveBlockRegion(this.context, params.anchorId)
      : params.originalText
        ? resolveBlockByText(this.context, params.originalText)
        : resolveBlockRegion(this.context, undefined);
    if ("error" in block) return block.error;
    const blockAnchorId = "anchorId" in block && typeof block.anchorId === "string"
      ? block.anchorId
      : undefined;
    if (!usesOriginalText) {
      const fitCheck = ensureReplacementFitsRegion(this.context, blockAnchorId, params.replacement, block.region);
      if ("error" in fitCheck) return fitCheck.error;
    }

    const result: AiDiffResult = {
      from: block.region.from,
      original: block.region.original,
      replacement: params.replacement,
      target: block.region.target,
      to: block.region.to,
      type: "replace"
    };

    return this.preparePreview(
      toolCallId,
      result,
      usesOriginalText
        ? "Prepared a block replacement preview for matched text."
        : "Prepared a block replacement preview for the resolved block."
    );
  }

  private replaceRegion(toolCallId: string, params: ReturnType<typeof typedReplaceContentArgs>) {
    const writeCheck = beginPreparedWrite(this.context, "replace");
    if ("error" in writeCheck) return writeCheck.error;

    const region = resolveWriteRegion(this.context, params.anchorId, "replace");
    if ("error" in region) return region.error;

    const selectedBlock =
      !params.anchorId && looksLikeBlockMarkdown(params.replacement)
        ? resolveSelectedBlockRegion(this.context)
        : null;
    const replacementAnchorId = selectedBlock?.anchorId ?? params.anchorId;
    const replacementRegion = selectedBlock?.region ?? region.region;
    const fitCheck = ensureReplacementFitsRegion(this.context, replacementAnchorId, params.replacement, replacementRegion);
    if ("error" in fitCheck) return fitCheck.error;

    const result: AiDiffResult = {
      from: replacementRegion.from,
      original: replacementRegion.original,
      replacement: params.replacement,
      ...(replacementRegion.target ? { target: replacementRegion.target } : {}),
      to: replacementRegion.to,
      type: "replace"
    };

    return this.preparePreview(toolCallId, result, "Prepared a replacement preview for the resolved region.");
  }
}

function inferReplaceTargetKind(
  context: DocumentAgentToolContext,
  params: ReturnType<typeof typedReplaceContentArgs>
): ContentTargetKind {
  if (params.targetKind) return params.targetKind;
  if (params.headingTitle) return "table";
  if (params.anchorId === "whole-document") return "document";
  if (params.anchorId?.startsWith("section:")) return "section";
  if (params.anchorId?.startsWith("table:")) return "table";
  if (params.originalText) return "block";
  if (context.selection?.source === "block") {
    return "block";
  }

  return "region";
}
