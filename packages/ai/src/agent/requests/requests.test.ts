import type { Tool } from "@mariozechner/pi-ai";
import { buildChatCompletionsRequestBody } from "./chat-completions";
import { buildResponsesRequestBody } from "./responses";
import type { ChatMessage } from "../chat/types";

const messages: ChatMessage[] = [
  { content: "You edit Markdown.", role: "system" },
  { content: "Rewrite this.", role: "user" }
];

const readDocumentTool = {
  description: "Read the document.",
  name: "read_document",
  parameters: {
    additionalProperties: false,
    properties: {},
    type: "object"
  }
} as Tool;

describe("request builders", () => {
  it("builds Chat Completions bodies with tools and merged provider options", () => {
    expect(buildChatCompletionsRequestBody({
      extraBody: { enable_search: true },
      messages,
      model: "qwen3-max",
      stream: true,
      tools: [readDocumentTool]
    })).toEqual({
      enable_search: true,
      messages,
      model: "qwen3-max",
      parallel_tool_calls: false,
      stream: true,
      temperature: 0.7,
      tool_choice: "auto",
      tools: [
        {
          function: {
            description: "Read the document.",
            name: "read_document",
            parameters: readDocumentTool.parameters
          },
          type: "function"
        }
      ]
    });
  });

  it("builds Responses bodies with instructions, input messages, and merged provider options", () => {
    expect(buildResponsesRequestBody({
      extraBody: { enable_thinking: true },
      messages,
      model: "qwen3.6-plus",
      nativeWebSearchToolType: "web_search",
      stream: true,
      tools: [readDocumentTool]
    })).toEqual({
      enable_thinking: true,
      input: [{ content: [{ text: "Rewrite this.", type: "input_text" }], role: "user", type: "message" }],
      instructions: "You edit Markdown.",
      model: "qwen3.6-plus",
      parallel_tool_calls: false,
      stream: true,
      tools: [
        { type: "web_search" },
        {
          description: "Read the document.",
          name: "read_document",
          parameters: readDocumentTool.parameters,
          type: "function"
        }
      ]
    });
  });

  it("keeps Responses function tools when native web search is disabled", () => {
    expect(buildResponsesRequestBody({
      messages,
      model: "gpt-5.5",
      stream: true,
      tools: [readDocumentTool]
    })).toMatchObject({
      parallel_tool_calls: false,
      tools: [
        {
          description: "Read the document.",
          name: "read_document",
          parameters: readDocumentTool.parameters,
          type: "function"
        }
      ]
    });
  });

  it("builds Responses bodies with replayed function calls and function_call_output items", () => {
    expect(buildResponsesRequestBody({
      messages: [
        { content: "Read the current document.", role: "user" },
        {
          content: "",
          role: "assistant",
          toolCalls: [
            {
              arguments: { path: "README.md" },
              id: "call_read_document|tool-call-1",
              name: "read_document"
            }
          ]
        },
        {
          content: "Tool result from read_document:\n# README",
          role: "user",
          toolResult: {
            outputText: "# README",
            toolCallId: "call_read_document|tool-call-1",
            toolName: "read_document"
          }
        }
      ],
      model: "qwen3.6-plus",
      nativeWebSearchToolType: "web_search"
    })).toEqual({
      input: [
        { content: [{ text: "Read the current document.", type: "input_text" }], role: "user", type: "message" },
        {
          arguments: "{\"path\":\"README.md\"}",
          call_id: "call_read_document",
          id: "tool-call-1",
          name: "read_document",
          type: "function_call"
        },
        {
          call_id: "call_read_document",
          output: "# README",
          type: "function_call_output"
        }
      ],
      model: "qwen3.6-plus",
      parallel_tool_calls: false,
      tools: [{ type: "web_search" }]
    });
  });
});
