import { Type } from "@earendil-works/pi-ai";
import { DocumentAgentToolFactory } from "./base";
import { typedLoadSkillArgs } from "./params";
import { toolErrorResult } from "./results";
import { truncateWorkspaceFileContent } from "./workspace";

export class LoadSkillToolFactory extends DocumentAgentToolFactory<ReturnType<typeof typedLoadSkillArgs>> {
  protected readonly description = [
    "Load the full instructions for one available workspace skill.",
    "Pass the exact skill name from the available workspace skills catalog.",
    "This tool can only read a discovered SKILL.md in the current workspace scope."
  ].join(" ");
  protected readonly label = "Load workspace skill";
  protected readonly name = "load_skill";
  protected readonly parameters = Type.Object({
    name: Type.String({ minLength: 1 })
  });

  protected parseParams(params: unknown) {
    return typedLoadSkillArgs(params);
  }

  protected async executeTool(_toolCallId: string, params: ReturnType<typeof typedLoadSkillArgs>) {
    const skill = this.context.workspaceSkills?.find((candidate) => candidate.name === params.name);
    if (!skill) {
      return toolErrorResult(
        `Workspace skill "$${params.name}" is unavailable in the current document scope. Use an exact name from the available workspace skills catalog.`
      );
    }
    if (!this.context.readWorkspaceFile) {
      return toolErrorResult("Workspace skill loading is unavailable in this session.");
    }

    try {
      const content = await this.context.readWorkspaceFile(skill.path);
      const readableContent = truncateWorkspaceFileContent(content);

      return {
        content: [
          {
            text: [
              `Activated workspace skill: $${skill.name}`,
              `Source: ${skill.relativePath}`,
              "",
              readableContent.text
            ].join("\n"),
            type: "text" as const
          }
        ],
        details: {
          length: content.length,
          name: skill.name,
          path: skill.path,
          relativePath: skill.relativePath,
          truncated: readableContent.truncated
        },
        terminate: false
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown skill read error.";

      return toolErrorResult(`Failed to load workspace skill "$${skill.name}": ${message}`);
    }
  }
}
