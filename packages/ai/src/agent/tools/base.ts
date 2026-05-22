import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@mariozechner/pi-ai";
import type { AiDiffResult } from "../inline";
import type { DocumentAgentToolContext, DocumentAgentToolState } from "./context";
import { previewPreparedResult } from "./results";

export abstract class DocumentAgentToolFactory<TParams = unknown> {
  constructor(
    protected readonly context: DocumentAgentToolContext,
    protected readonly state: DocumentAgentToolState
  ) {}

  protected abstract readonly description: string;
  protected abstract readonly label: string;
  protected abstract readonly name: string;
  protected abstract readonly parameters: TSchema;

  create(): AgentTool {
    return {
      description: this.description,
      execute: async (toolCallId, params) => this.executeTool(toolCallId, this.parseParams(params)),
      label: this.label,
      name: this.name,
      parameters: this.parameters
    };
  }

  protected preparePreview(toolCallId: string, result: AiDiffResult, message: string) {
    this.context.onPreviewResult?.(result, toolCallId);

    return previewPreparedResult(result, message);
  }

  protected parseParams(params: unknown): TParams {
    return params as TParams;
  }

  protected abstract executeTool(
    toolCallId: string,
    params: TParams
  ): Promise<AgentToolResult<unknown>> | AgentToolResult<unknown>;
}
