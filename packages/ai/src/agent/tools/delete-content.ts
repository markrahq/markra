import { Type } from "@mariozechner/pi-ai";
import type { AiDiffResult } from "../inline";
import { DocumentAgentToolFactory } from "./base";
import { typedDeleteContentArgs } from "./params";
import { toolErrorResult } from "./results";
import {
  beginPreparedWrite,
  resolveSectionAnchor,
  resolveWriteRegion
} from "./regions";

export class DeleteContentToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedDeleteContentArgs>> {
  protected readonly description = "Delete Markdown content from the current editor context, a resolved region anchor, or a section anchor.";
  protected readonly label = "Delete content";
  protected readonly name = "delete_content";
  protected readonly parameters = Type.Object({
    anchorId: Type.Optional(Type.String()),
    targetKind: Type.Optional(Type.Union([
      Type.Literal("region"),
      Type.Literal("section")
    ]))
  });

  protected parseParams(params: unknown) {
    return typedDeleteContentArgs(params);
  }

  protected executeTool(toolCallId: string, params: ReturnType<typeof typedDeleteContentArgs>) {
    const targetKind = params.targetKind ?? (params.anchorId?.startsWith("section:") ? "section" : "region");

    if (targetKind === "section") {
      return this.deleteSection(toolCallId, params.anchorId);
    }

    return this.deleteRegion(toolCallId, params.anchorId);
  }

  private deleteRegion(toolCallId: string, anchorId: string | undefined) {
    const writeCheck = beginPreparedWrite(this.context, "delete");
    if ("error" in writeCheck) return writeCheck.error;

    const region = resolveWriteRegion(this.context, anchorId, "delete");
    if ("error" in region) return region.error;

    const result: AiDiffResult = {
      from: region.region.from,
      original: region.region.original,
      replacement: "",
      to: region.region.to,
      type: "replace"
    };

    return this.preparePreview(toolCallId, result, "Prepared a deletion preview for the resolved region.");
  }

  private deleteSection(toolCallId: string, anchorId: string | undefined) {
    const writeCheck = beginPreparedWrite(this.context, "delete");
    if ("error" in writeCheck) return writeCheck.error;
    if (!anchorId) {
      return toolErrorResult("Cannot delete a section because anchorId was not provided.");
    }

    const section = resolveSectionAnchor(this.context, anchorId);
    if ("error" in section) return section.error;

    const result: AiDiffResult = {
      from: section.anchor.from,
      original: section.anchor.text ?? "",
      replacement: "",
      to: section.anchor.to,
      type: "replace"
    };

    return this.preparePreview(
      toolCallId,
      result,
      `Prepared a section deletion preview for ${section.anchor.title ?? section.anchor.id}.`
    );
  }
}
