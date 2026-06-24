import { Type } from "@earendil-works/pi-ai";
import { prepareWorkspaceChangePlanChanges } from "../workspace-change-plan";
import { DocumentAgentToolFactory } from "./base";
import { typedWorkspaceChangePlanArgs } from "./params";
import { toolErrorResult } from "./results";

export class PrepareWorkspaceChangePlanToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedWorkspaceChangePlanArgs>> {
  protected readonly description = [
    "Prepare a reviewable workspace change plan for organizing Markdown notes.",
    "Use this for note creation, note updates, renames, moves, links, or tags.",
    "This tool validates and summarizes the plan only; it never writes files. The user must review and apply changes separately."
  ].join(" ");
  protected readonly label = "Prepare workspace change plan";
  protected readonly name = "prepare_workspace_change_plan";
  protected readonly parameters = Type.Object({
    changes: Type.Array(Type.Object({
      content: Type.Optional(Type.String()),
      from: Type.Optional(Type.String({ minLength: 1 })),
      links: Type.Optional(Type.Array(Type.String())),
      path: Type.Optional(Type.String({ minLength: 1 })),
      reason: Type.Optional(Type.String()),
      summary: Type.Optional(Type.String()),
      tags: Type.Optional(Type.Array(Type.String())),
      to: Type.Optional(Type.String({ minLength: 1 })),
      type: Type.Union([
        Type.Literal("add_links"),
        Type.Literal("add_tags"),
        Type.Literal("create_note"),
        Type.Literal("move_note"),
        Type.Literal("rename_note"),
        Type.Literal("update_note")
      ])
    })),
    summary: Type.Optional(Type.String())
  });

  protected parseParams(params: unknown) {
    return typedWorkspaceChangePlanArgs(params);
  }

  protected executeTool(_toolCallId: string, params: ReturnType<typeof typedWorkspaceChangePlanArgs>) {
    if (!params.changes.length) {
      return toolErrorResult("Cannot prepare a workspace change plan because no changes were provided.");
    }

    const preparedChanges = prepareWorkspaceChangePlanChanges(params.changes, this.context.workspaceFiles);
    const summary = params.summary ?? "Review suggested workspace note changes.";

    return {
      content: [
        {
          text: [
            `Prepared workspace change plan: ${summary}`,
            ...preparedChanges.map((change, index) => `${index + 1}. ${change.label}${change.reason ? ` - ${change.reason}` : ""}`),
            "No files were changed. The user still needs to review and apply this plan."
          ].join("\n"),
          type: "text" as const
        }
      ],
      details: {
        changes: preparedChanges,
        count: preparedChanges.length,
        summary
      },
      terminate: false
    };
  }
}
