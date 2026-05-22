import { Type } from "@mariozechner/pi-ai";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AiDiffResult } from "../inline";
import { DocumentAgentToolFactory } from "./base";
import type { BatchEditOperation } from "./params";
import { typedBatchEditArgs } from "./params";
import { toolErrorResult } from "./results";
import {
  resolveAnyAnchor,
  resolveExactTextRegion
} from "./regions";
import { sliceDocumentText } from "./text";

export class BatchEditToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedBatchEditArgs>> {
  protected readonly description = [
    "Prepare multiple small structured edits as one preview.",
    "Operations must target exact text, ranges, or anchors. Do not use this for whole-document replacement."
  ].join(" ");
  protected readonly label = "Batch edit";
  protected readonly name = "batch_edit";
  protected readonly parameters = Type.Object({
    operations: Type.Array(Type.Object({
      anchorId: Type.Optional(Type.String({ minLength: 1 })),
      content: Type.Optional(Type.String()),
      exactText: Type.Optional(Type.String({ minLength: 1 })),
      from: Type.Optional(Type.Number({ minimum: 0 })),
      placement: Type.Optional(Type.Union([
        Type.Literal("after"),
        Type.Literal("before")
      ])),
      replacement: Type.Optional(Type.String()),
      to: Type.Optional(Type.Number({ minimum: 0 })),
      type: Type.Union([
        Type.Literal("delete"),
        Type.Literal("insert"),
        Type.Literal("replace")
      ])
    }), { minItems: 1 })
  });

  protected parseParams(params: unknown) {
    return typedBatchEditArgs(params);
  }

  protected executeTool(toolCallId: string, params: ReturnType<typeof typedBatchEditArgs>) {
    if (!params.operations.length) {
      return toolErrorResult("Cannot prepare a batch edit because no operations were provided.");
    }

    const edits = params.operations.map((operation, index) => this.resolveOperation(operation, index));
    const firstError = edits.find((edit): edit is { error: AgentToolResult<unknown> } => "error" in edit);
    if (firstError) return firstError.error;

    const resolvedEdits = edits.filter((edit): edit is ResolvedBatchEdit => "from" in edit);
    ensureNoOverlappingEdits(resolvedEdits);
    const result = diffResultFromEdits(this.context.documentContent, resolvedEdits);
    if (!result) {
      return toolErrorResult("Cannot prepare a batch edit because the operations would not change the document.");
    }

    return this.preparePreview(
      toolCallId,
      result,
      `Prepared a batch edit preview with ${resolvedEdits.length} operations.`
    );
  }

  private resolveOperation(operation: BatchEditOperation, index: number): ResolvedBatchEdit | { error: AgentToolResult<unknown> } {
    if (operation.anchorId === "whole-document") {
      return {
        error: toolErrorResult("Cannot use batch_edit for whole-document replacement. Use replace_content with targetKind=document only when explicitly needed.")
      };
    }

    if (operation.type === "insert") {
      const position = this.resolveInsertPosition(operation, index);
      if ("error" in position) return position;

      return {
        from: position.position,
        original: "",
        order: index,
        replacement: operation.content ?? "",
        to: position.position
      };
    }

    const region = this.resolveOperationRegion(operation, index);
    if ("error" in region) return region;

    return {
      from: region.from,
      original: region.original,
      order: index,
      replacement: operation.type === "delete" ? "" : operation.replacement ?? "",
      to: region.to
    };
  }

  private resolveOperationRegion(operation: BatchEditOperation, index: number) {
    if (operation.exactText) {
      const region = resolveExactTextRegion(this.context, operation.exactText, `batch edit operation ${index + 1}`);
      if ("error" in region) return region;

      return region.region;
    }

    if (operation.anchorId) {
      const anchor = resolveAnyAnchor(this.context, operation.anchorId);
      if ("error" in anchor) return anchor;
      if (anchor.anchor.kind === "document" || anchor.anchor.kind === "document_end") {
        return {
          error: toolErrorResult("Cannot use batch_edit with the whole-document or document-end anchor.")
        };
      }

      return {
        from: anchor.anchor.from,
        original: anchor.anchor.text ?? sliceDocumentText(this.context.documentContent, anchor.anchor.from, anchor.anchor.to),
        to: anchor.anchor.to
      };
    }

    if (typeof operation.from === "number" && typeof operation.to === "number") {
      if (operation.from > operation.to) {
        return {
          error: toolErrorResult(`Cannot resolve batch edit operation ${index + 1} because from is greater than to.`)
        };
      }
      if (
        operation.from < 0 ||
        operation.to < 0 ||
        operation.from > this.context.documentEndPosition ||
        operation.to > this.context.documentEndPosition
      ) {
        return {
          error: toolErrorResult(`Cannot resolve batch edit operation ${index + 1} because the range is outside the document.`)
        };
      }

      return {
        from: operation.from,
        original: sliceDocumentText(this.context.documentContent, operation.from, operation.to),
        to: operation.to
      };
    }

    return {
      error: toolErrorResult(`Cannot resolve batch edit operation ${index + 1}. Provide exactText, anchorId, or from/to.`)
    };
  }

  private resolveInsertPosition(operation: BatchEditOperation, index: number) {
    if (operation.anchorId) {
      const anchor = resolveAnyAnchor(this.context, operation.anchorId);
      if ("error" in anchor) return anchor;
      if (anchor.anchor.kind === "document") {
        return {
          error: toolErrorResult("Cannot use batch_edit to insert relative to the whole-document anchor.")
        };
      }

      return {
        position: operation.placement === "after" ? anchor.anchor.to : anchor.anchor.from
      };
    }

    if (typeof operation.from === "number") {
      if (operation.from < 0 || operation.from > this.context.documentEndPosition) {
        return {
          error: toolErrorResult(`Cannot resolve batch insert operation ${index + 1} because the position is outside the document.`)
        };
      }

      return {
        position: operation.from
      };
    }

    return {
      error: toolErrorResult(`Cannot resolve batch insert operation ${index + 1}. Provide anchorId or from.`)
    };
  }
}

type ResolvedBatchEdit = {
  from: number;
  original: string;
  order: number;
  replacement: string;
  to: number;
};

function ensureNoOverlappingEdits(edits: ResolvedBatchEdit[]) {
  const sorted = [...edits].sort((left, right) => left.from - right.from);

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.from < previous.to) {
      return toolErrorResult("Cannot prepare a batch edit because operations overlap.");
    }
  }
}

function applyEdits(content: string, edits: ResolvedBatchEdit[]) {
  return [...edits]
    .sort((left, right) => right.from - left.from || right.order - left.order)
    .reduce((nextContent, edit) => {
      return [
        nextContent.slice(0, edit.from),
        edit.replacement,
        nextContent.slice(edit.to)
      ].join("");
    }, content);
}

function diffResultFromEdits(originalContent: string, edits: ResolvedBatchEdit[]): AiDiffResult | null {
  const from = Math.min(...edits.map((edit) => edit.from));
  const to = Math.max(...edits.map((edit) => edit.to));
  const original = originalContent.slice(from, to);
  const replacement = applyEdits(
    original,
    edits.map((edit) => ({
      ...edit,
      from: edit.from - from,
      to: edit.to - from
    }))
  );
  if (original === replacement) return null;

  return {
    from,
    original,
    replacement,
    to,
    type: "replace"
  };
}
