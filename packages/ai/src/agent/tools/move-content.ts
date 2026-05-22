import { Type } from "@mariozechner/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import { typedMoveContentArgs } from "./params";
import { beginPreparedWrite, buildMovePreview } from "./regions";

export class MoveContentToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedMoveContentArgs>> {
  protected readonly description = [
    "Move existing Markdown content before or after another anchor or exact text snippet.",
    "Use this for reorder requests instead of replacing the full document.",
    "Pass sourceAnchorId or sourceText, destinationAnchorId or destinationText, and placement=before or after."
  ].join(" ");
  protected readonly label = "Move content";
  protected readonly name = "move_content";
  protected readonly parameters = Type.Object({
    destinationAnchorId: Type.Optional(Type.String({ minLength: 1 })),
    destinationText: Type.Optional(Type.String({ minLength: 1 })),
    placement: Type.Optional(Type.Union([
      Type.Literal("after"),
      Type.Literal("before")
    ])),
    sourceAnchorId: Type.Optional(Type.String({ minLength: 1 })),
    sourceText: Type.Optional(Type.String({ minLength: 1 }))
  });

  protected parseParams(params: unknown) {
    return typedMoveContentArgs(params);
  }

  protected executeTool(toolCallId: string, params: ReturnType<typeof typedMoveContentArgs>) {
    const writeCheck = beginPreparedWrite(this.context, "replace", {
      requireEditableContext: false
    });
    if ("error" in writeCheck) return writeCheck.error;

    const movePreview = buildMovePreview(this.context, params);
    if ("error" in movePreview) return movePreview.error;

    return this.preparePreview(toolCallId, movePreview.result, "Prepared a move preview for the resolved content.");
  }
}
