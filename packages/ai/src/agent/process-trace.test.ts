import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { applyAgentEventToProcesses, createInitialAgentProcesses } from "./process-trace";
import type { I18nKey } from "@markra/shared";

const translate = (key: I18nKey) => key;

describe("agentProcessTrace", () => {
  it("labels workspace file reads with the file path and length", () => {
    const initialProcesses = createInitialAgentProcesses(translate);
    const nextProcesses = applyAgentEventToProcesses(
      initialProcesses,
      {
        isError: false,
        result: {
          details: {
            length: 128,
            relativePath: "notes/context.md"
          }
        },
        toolCallId: "call_read_workspace_file",
        toolName: "read_workspace_file",
        type: "tool_execution_end"
      } as AgentEvent,
      translate
    );

    expect(nextProcesses).toContainEqual(expect.objectContaining({
      detail: "notes/context.md · 128 chars",
      id: "tool:call_read_workspace_file",
      label: "app.aiAgentProcessReadWorkspaceFile",
      rawLabel: "read_workspace_file",
      status: "completed"
    }));
  });

  it("labels document image tools with image counts and sources", () => {
    const initialProcesses = createInitialAgentProcesses(translate);
    const listedProcesses = applyAgentEventToProcesses(
      initialProcesses,
      {
        isError: false,
        result: {
          details: {
            count: 2
          }
        },
        toolCallId: "call_list_assets",
        toolName: "list_assets",
        type: "tool_execution_end"
      } as AgentEvent,
      translate
    );
    const viewedProcesses = applyAgentEventToProcesses(
      listedProcesses,
      {
        isError: false,
        result: {
          details: {
            mimeType: "image/png",
            src: "assets/arch.png"
          }
        },
        toolCallId: "call_view_asset",
        toolName: "view_asset",
        type: "tool_execution_end"
      } as AgentEvent,
      translate
    );

    expect(viewedProcesses).toContainEqual(expect.objectContaining({
      detail: "2 images",
      id: "tool:call_list_assets",
      label: "app.aiAgentProcessListDocumentImages",
      rawLabel: "list_assets",
      status: "completed"
    }));
    expect(viewedProcesses).toContainEqual(expect.objectContaining({
      detail: "assets/arch.png · image/png",
      id: "tool:call_view_asset",
      label: "app.aiAgentProcessReadDocumentImage",
      rawLabel: "view_asset",
      status: "completed"
    }));
  });

  it("labels web search tool calls with result counts", () => {
    const initialProcesses = createInitialAgentProcesses(translate);
    const nextProcesses = applyAgentEventToProcesses(
      initialProcesses,
      {
        isError: false,
        result: {
          details: {
            count: 3,
            providerId: "local-bing",
            query: "Markra web search"
          }
        },
        toolCallId: "call_web_search",
        toolName: "web_search",
        type: "tool_execution_end"
      } as AgentEvent,
      translate
    );

    expect(nextProcesses).toContainEqual(expect.objectContaining({
      detail: "3 sources",
      id: "tool:call_web_search",
      label: "app.aiAgentProcessWebSearch",
      rawLabel: "web_search",
      status: "completed"
    }));
  });

  it("shows the located section title and reason in the process detail", () => {
    const initialProcesses = createInitialAgentProcesses(translate);
    const nextProcesses = applyAgentEventToProcesses(
      initialProcesses,
      {
        isError: false,
        result: {
          details: {
            anchorId: "section:2",
            candidates: [
              {
                anchorId: "section:2",
                description: "Section 11. Follow-ups",
                reason: 'Exact heading match for "11. Follow-ups".',
                score: 20
              }
            ],
            reason: 'Exact heading match for "11. Follow-ups".',
            targetKind: "section"
          }
        },
        toolCallId: "call_locate_content",
        toolName: "locate_content",
        type: "tool_execution_end"
      } as AgentEvent,
      translate
    );

    expect(nextProcesses).toContainEqual(expect.objectContaining({
      detail: expect.stringContaining("Section 11. Follow-ups"),
      id: "tool:call_locate_content",
      label: "app.aiAgentProcessLocateSection",
      status: "completed"
    }));
    expect(nextProcesses).toContainEqual(expect.objectContaining({
      detail: expect.stringContaining("Exact heading match")
    }));
  });

  it("shows the prepared write target in replacement process details", () => {
    const initialProcesses = createInitialAgentProcesses(translate);
    const nextProcesses = applyAgentEventToProcesses(
      initialProcesses,
      {
        isError: false,
        result: {
          details: {
            original: "old-token",
            target: {
              from: 10,
              id: "table:0",
              kind: "table",
              title: "Cost impact",
              to: 19
            }
          }
        },
        toolCallId: "call_replace_content",
        toolName: "replace_content",
        type: "tool_execution_end"
      } as AgentEvent,
      translate
    );

    expect(nextProcesses).toContainEqual(expect.objectContaining({
      detail: "table: Cost impact · 9 chars",
      id: "tool:call_replace_content",
      label: "app.aiAgentProcessReplaceRegion",
      rawLabel: "replace_content",
      status: "completed"
    }));
  });

  it("marks failed tool executions as errors with the tool message", () => {
    const initialProcesses = createInitialAgentProcesses(translate);
    const nextProcesses = applyAgentEventToProcesses(
      initialProcesses,
      {
        isError: true,
        result: {
          content: [
            {
              text: 'Cannot insert because the anchor "heading:99" was not found.',
              type: "text"
            }
          ],
          details: {}
        },
        toolCallId: "call_insert_content",
        toolName: "insert_content",
        type: "tool_execution_end"
      } as AgentEvent,
      translate
    );

    expect(nextProcesses).toContainEqual(expect.objectContaining({
      detail: expect.stringContaining('Cannot insert because the anchor "heading:99"'),
      id: "tool:call_insert_content",
      label: "app.aiAgentProcessInsertMarkdown",
      status: "error"
    }));
  });
});
