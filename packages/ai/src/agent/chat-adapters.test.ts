import {
  getChatAdapter,
  type ChatMessage
} from "./chat-adapters";
import { buildInlineAiMessages } from "./inline-prompt";
import type { AiProviderConfig } from "@markra/providers";
import type { Tool } from "@earendil-works/pi-ai";
import { encodeOpenRouterReasoningDetails } from "./reasoning-metadata";

function provider(overrides: Partial<AiProviderConfig>): AiProviderConfig {
  return {
    apiKey: "secret",
    baseUrl: "",
    defaultModelId: "model",
    enabled: true,
    id: "provider",
    models: [],
    name: "Provider",
    type: "openai",
    ...overrides
  };
}

const messages: ChatMessage[] = [
  { content: "You edit Markdown.", role: "system" },
  { content: "Rewrite this.", role: "user" }
];

const multimodalMessages: ChatMessage[] = [
  { content: "You inspect Markdown images.", role: "system" },
  {
    content: "User request:\nWhat is in this screenshot?",
    images: [
      {
        dataUrl: "data:image/png;base64,aGVsbG8=",
        mimeType: "image/png",
      }
    ],
    role: "user"
  }
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

describe("AI chat adapters", () => {
  it("builds OpenAI-compatible chat completion requests with JSON headers", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({ baseUrl: "https://proxy.example.test/v1", type: "openai-compatible" }),
      "writer-model",
      messages
    );

    expect(request).toEqual({
      body: {
        messages,
        model: "writer-model",
        temperature: 0.7
      },
      headers: {
        Authorization: "Bearer secret",
        "content-type": "application/json"
      },
      url: "https://proxy.example.test/v1/chat/completions"
    });
  });

  it("builds OpenAI Responses requests with Codex-shaped input messages", () => {
    const request = getChatAdapter("openai-responses").buildRequest(
      provider({ apiStyle: "openai-responses", baseUrl: "https://proxy.example.test/v1", type: "openai" }),
      "writer-model",
      messages,
      { stream: true }
    );

    expect(request).toEqual({
      body: {
        input: [
          {
            content: [{ text: "Rewrite this.", type: "input_text" }],
            role: "user",
            type: "message"
          }
        ],
        instructions: "You edit Markdown.",
        model: "writer-model",
        stream: true,
        tools: []
      },
      headers: {
        Authorization: "Bearer secret",
        "content-type": "application/json"
      },
      url: "https://proxy.example.test/v1/responses"
    });
  });

  it("adds custom provider headers to chat requests", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({
        baseUrl: "https://proxy.example.test/v1",
        customHeaders: '{"HTTP-Referer":"https://markra.app","X-Title":"Markra"}',
        type: "openai-compatible"
      } as Partial<AiProviderConfig>),
      "writer-model",
      messages
    );

    expect(request.headers).toMatchObject({
      "HTTP-Referer": "https://markra.app",
      "X-Title": "Markra"
    });
  });

  it("disables DeepSeek thinking by default so inline edits stream final content quickly", () => {
    const request = getChatAdapter("deepseek").buildRequest(
      provider({ baseUrl: "https://api.deepseek.com", type: "deepseek" }),
      "deepseek-v4-flash",
      messages,
      { stream: true }
    );

    expect(request.body).toEqual({
      messages,
      model: "deepseek-v4-flash",
      stream: true,
      temperature: 0.7,
      thinking: { type: "disabled" }
    });
  });

  it("can enable DeepSeek thinking when the command requests it", () => {
    const request = getChatAdapter("deepseek").buildRequest(
      provider({ baseUrl: "https://api.deepseek.com", type: "deepseek" }),
      "deepseek-v4-flash",
      messages,
      { stream: true, thinkingEnabled: true }
    );

    expect(request.body).toMatchObject({
      thinking: { type: "enabled" }
    });
  });

  it("replays DeepSeek reasoning content for assistant tool calls in thinking mode", () => {
    const request = getChatAdapter("deepseek").buildRequest(
      provider({ baseUrl: "https://api.deepseek.com", type: "deepseek" }),
      "deepseek-v4-flash",
      [
        { content: "Reply in the user's language.", role: "system" },
        { content: "Read the current document.", role: "user" },
        {
          content: "",
          role: "assistant",
          thinking: "I need to inspect the document before answering.",
          toolCalls: [
            {
              arguments: {},
              id: "call_read_document",
              name: "read_document"
            }
          ]
        },
        {
          content: "Tool result from read_document:\n# Draft",
          role: "user",
          toolResult: {
            outputText: "# Draft",
            toolCallId: "call_read_document",
            toolName: "read_document"
          }
        }
      ],
      {
        stream: true,
        thinkingEnabled: true,
        tools: [readDocumentTool]
      }
    );

    expect(request.body).toMatchObject({
      messages: [
        { content: "Reply in the user's language.", role: "system" },
        { content: "Read the current document.", role: "user" },
        {
          content: "",
          reasoning_content: "I need to inspect the document before answering.",
          role: "assistant",
          tool_calls: [
            {
              function: {
                arguments: "{}",
                name: "read_document"
              },
              id: "call_read_document",
              type: "function"
            }
          ]
        },
        {
          content: "# Draft",
          name: "read_document",
          role: "tool",
          tool_call_id: "call_read_document"
        }
      ],
      thinking: { type: "enabled" }
    });
  });

  it("passes Qwen thinking mode through DashScope OpenAI-compatible requests", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        id: "aliyun-bailian",
        type: "openai-compatible"
      }),
      "qwen3.6-plus",
      messages,
      { stream: true, thinkingEnabled: true }
    );

    expect(request.body).toMatchObject({
      enable_thinking: true,
      model: "qwen3.6-plus",
      stream: true
    });
  });

  it("enables native web search for providers with compatible chat request parameters", () => {
    expect(
      getChatAdapter("openai-compatible").buildRequest(
        provider({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          id: "aliyun-bailian",
          models: [{ capabilities: ["text", "web"], enabled: true, id: "qwen3-max", name: "Qwen3 Max" }],
          type: "openai-compatible"
        }),
        "qwen3-max",
        messages,
        { stream: true, webSearchEnabled: true }
      ).body
    ).toMatchObject({
      enable_search: true,
      model: "qwen3-max",
      search_options: {
        forced_search: true,
        search_strategy: "max"
      },
      stream: true
    });
    expect(
      getChatAdapter("anthropic").buildRequest(
        provider({
          models: [{ capabilities: ["text", "web"], enabled: true, id: "claude-opus-4-7", name: "Claude Opus 4.7" }],
          type: "anthropic"
        }),
        "claude-opus-4-7",
        messages,
        { tools: [readDocumentTool], webSearchEnabled: true }
      ).body
    ).toMatchObject({
      tools: expect.arrayContaining([
        { max_uses: 5, name: "web_search", type: "web_search_20250305" },
        expect.objectContaining({ name: "read_document" })
      ])
    });
    expect(
      getChatAdapter("google").buildRequest(
        provider({
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          models: [{ capabilities: ["text", "web"], enabled: true, id: "gemini-3.1-flash-lite-preview", name: "Gemini Flash-Lite" }],
          type: "google"
        }),
        "gemini-3.1-flash-lite-preview",
        messages,
        { webSearchEnabled: true }
      ).body
    ).toMatchObject({
      tools: [{ google_search: {} }]
    });
  });

  it("uses the Responses API shape for DashScope models that only support native web search there", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        id: "aliyun-bailian",
        models: [{ capabilities: ["text", "web"], enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
        type: "openai-compatible"
      }),
      "qwen3.6-plus",
      messages,
      { stream: true, thinkingEnabled: true, webSearchEnabled: true }
    );

    expect(request).toMatchObject({
      body: {
        enable_thinking: true,
        input: [{ content: [{ text: "Rewrite this.", type: "input_text" }], role: "user" }],
        instructions: "You edit Markdown.",
        model: "qwen3.6-plus",
        parallel_tool_calls: false,
        stream: true,
        tools: [{ type: "web_search" }]
      },
      headers: {
        Authorization: "Bearer secret",
        "content-type": "application/json"
      },
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1/responses"
    });
  });

  it("does not send MiMo native web search parameters to Token Plan endpoints", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({
        baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
        id: "xiaomi-mimo",
        models: [{ capabilities: ["text", "web"], enabled: true, id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro" }],
        type: "openai-compatible"
      }),
      "mimo-v2.5-pro",
      messages,
      { stream: true, tools: [readDocumentTool], webSearchEnabled: true }
    );

    expect(request).toMatchObject({
      body: {
        messages,
        model: "mimo-v2.5-pro",
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
      },
      url: "https://token-plan-cn.xiaomimimo.com/v1/chat/completions"
    });
    expect(JSON.stringify(request.body)).not.toContain("web_search");
  });

  it("uses Xiaomi MiMo's native web search tool shape for the ordinary API endpoint", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({
        baseUrl: "https://api.xiaomimimo.com/v1",
        id: "xiaomi-mimo",
        models: [{ capabilities: ["text", "web"], enabled: true, id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro" }],
        type: "openai-compatible"
      }),
      "mimo-v2.5-pro",
      messages,
      { stream: true, tools: [readDocumentTool], webSearchEnabled: true }
    );

    expect(request).toMatchObject({
      body: {
        messages,
        model: "mimo-v2.5-pro",
        parallel_tool_calls: false,
        stream: true,
        temperature: 0.7,
        tool_choice: "auto",
        tools: [
          { force_search: true, type: "web_search" },
          expect.objectContaining({ type: "function" })
        ]
      },
      url: "https://api.xiaomimimo.com/v1/chat/completions"
    });
  });

  it("uses the Responses API shape for OpenAI and xAI native web search", () => {
    const openAiRequest = getChatAdapter("openai").buildRequest(
      provider({
        baseUrl: "https://api.openai.com/v1",
        models: [{ capabilities: ["text", "web"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
        type: "openai"
      }),
      "gpt-5.5",
      messages,
      { stream: true, tools: [readDocumentTool], webSearchEnabled: true }
    );
    const xaiRequest = getChatAdapter("xai").buildRequest(
      provider({
        baseUrl: "https://api.x.ai/v1",
        models: [{ capabilities: ["text", "web"], enabled: true, id: "grok-4.3", name: "Grok 4.3" }],
        type: "xai"
      }),
      "grok-4.3",
      messages,
      { stream: true, webSearchEnabled: true }
    );

    expect(openAiRequest).toMatchObject({
      body: {
        input: [{ content: [{ text: "Rewrite this.", type: "input_text" }], role: "user" }],
        instructions: "You edit Markdown.",
        model: "gpt-5.5",
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
      },
      url: "https://api.openai.com/v1/responses"
    });
    expect(xaiRequest).toMatchObject({
      body: {
        input: [{ content: [{ text: "Rewrite this.", type: "input_text" }], role: "user" }],
        instructions: "You edit Markdown.",
        model: "grok-4.3",
        stream: true,
        tools: [{ type: "web_search" }]
      },
      url: "https://api.x.ai/v1/responses"
    });
  });

  it("uses provider-specific native web search request shapes for OpenRouter and Azure OpenAI", () => {
    const openRouterRequest = getChatAdapter("openrouter").buildRequest(
      provider({
        baseUrl: "https://openrouter.ai/api/v1",
        models: [{ capabilities: ["text", "web"], enabled: true, id: "openrouter/auto", name: "OpenRouter Auto" }],
        type: "openrouter"
      }),
      "openrouter/auto",
      messages,
      { stream: true, tools: [readDocumentTool], webSearchEnabled: true }
    );
    const azureRequest = getChatAdapter("azure-openai").buildRequest(
      provider({
        baseUrl: "https://markra.openai.azure.com",
        models: [{ capabilities: ["text", "web"], enabled: true, id: "gpt-5.4", name: "GPT-5.4 deployment" }],
        type: "azure-openai"
      }),
      "gpt-5.4",
      messages,
      { stream: true, webSearchEnabled: true }
    );

    expect(openRouterRequest).toMatchObject({
      body: {
        input: [{ content: [{ text: "Rewrite this.", type: "input_text" }], role: "user" }],
        instructions: "You edit Markdown.",
        model: "openrouter/auto",
        stream: true,
        tools: [
          { type: "openrouter:web_search" },
          {
            description: "Read the document.",
            name: "read_document",
            parameters: readDocumentTool.parameters,
            type: "function"
          }
        ]
      },
      headers: {
        Authorization: "Bearer secret",
        "content-type": "application/json"
      },
      url: "https://openrouter.ai/api/v1/responses"
    });
    expect(azureRequest).toMatchObject({
      body: {
        input: [{ content: [{ text: "Rewrite this.", type: "input_text" }], role: "user" }],
        instructions: "You edit Markdown.",
        model: "gpt-5.4",
        stream: true,
        tools: [{ type: "web_search" }]
      },
      headers: {
        "api-key": "secret",
        "content-type": "application/json"
      },
      url: "https://markra.openai.azure.com/openai/v1/responses"
    });
  });

  it("uses the Responses API shape for Volcengine Ark native web search", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        id: "volcengine",
        models: [
          {
            capabilities: ["text", "vision", "reasoning", "tools", "web"],
            enabled: true,
            id: "doubao-seed-1-6-flash-250715",
            name: "Doubao Seed 1.6 Flash"
          }
        ],
        type: "openai-compatible"
      }),
      "doubao-seed-1-6-flash-250715",
      messages,
      { stream: true, thinkingEnabled: true, webSearchEnabled: true }
    );

    expect(request).toMatchObject({
      body: {
        input: [{ content: [{ text: "Rewrite this.", type: "input_text" }], role: "user" }],
        instructions: "You edit Markdown.",
        model: "doubao-seed-1-6-flash-250715",
        stream: true,
        thinking: { type: "enabled" },
        tools: [{ type: "web_search" }]
      },
      url: "https://ark.cn-beijing.volces.com/api/v3/responses"
    });
  });

  it("parses OpenAI Responses API text and function-call stream events", () => {
    const adapter = getChatAdapter("openai");

    expect(adapter.parseStreamEvent({ delta: "Native search answer", type: "response.output_text.delta" }))
      .toEqual({ contentDelta: "Native search answer" });
    expect(adapter.parseStreamEvent({ delta: "Text-mode answer", type: "response.text.delta" }))
      .toEqual({ contentDelta: "Text-mode answer" });
    expect(adapter.parseStreamEvent({ delta: "Need to inspect the page first.", type: "response.reasoning_summary_text.delta" }))
      .toEqual({ thinkingDelta: "Need to inspect the page first." });
    expect(adapter.parseStreamEvent({
      item: { call_id: "call_read", name: "read_document", type: "function_call" },
      output_index: 1,
      type: "response.output_item.added"
    })).toEqual({
      toolCallDeltas: [{ id: "call_read", index: 1, nameDelta: "read_document" }]
    });
    expect(adapter.parseStreamEvent({
      delta: "{\"path\":\"README.md\"}",
      output_index: 1,
      type: "response.function_call_arguments.delta"
    })).toEqual({
      toolCallDeltas: [{ argumentsDelta: "{\"path\":\"README.md\"}", index: 1 }]
    });
  });

  it("parses Responses API final bodies that use text content parts or output_text shortcuts", () => {
    const adapter = getChatAdapter("openai");

    expect(adapter.parseResponse({
      object: "response",
      output: [
        {
          content: [{ text: "Structured response body", type: "text" }],
          role: "assistant",
          type: "message"
        }
      ],
      status: "completed"
    })).toEqual({
      content: "Structured response body",
      finishReason: "completed"
    });

    expect(adapter.parseResponse({
      object: "response",
      output: [
        {
          content: [{ text: "Duplicated in content array", type: "output_text" }],
          role: "assistant",
          type: "message"
        }
      ],
      output_text: "Top-level shortcut response",
      status: "completed"
    })).toEqual({
      content: "Top-level shortcut response",
      finishReason: "completed"
    });
  });

  it("ignores provider-native web search protocol events as local tool calls", () => {
    const openAiAdapter = getChatAdapter("openai");
    const anthropicAdapter = getChatAdapter("anthropic");
    const googleAdapter = getChatAdapter("google");

    expect(openAiAdapter.parseResponse({
      object: "response",
      output: [
        { id: "ws_synthetic", status: "completed", type: "web_search_call" },
        {
          content: [{ text: "Grounded response", type: "output_text" }],
          role: "assistant",
          type: "message"
        }
      ],
      status: "completed"
    })).toEqual({ content: "Grounded response", finishReason: "completed" });
    expect(openAiAdapter.parseStreamEvent({
      item_id: "ws_synthetic",
      output_index: 0,
      sequence_number: 1,
      type: "response.web_search_call.searching"
    })).toEqual({});

    expect(anthropicAdapter.parseResponse({
      content: [
        { id: "srvtoolu_synthetic", name: "web_search", type: "server_tool_use" },
        {
          content: [{ title: "Synthetic result", type: "web_search_result", url: "https://search.example.test/result" }],
          tool_use_id: "srvtoolu_synthetic",
          type: "web_search_tool_result"
        },
        { text: "Grounded response", type: "text" }
      ],
      stop_reason: "end_turn"
    })).toEqual({ content: "Grounded response", finishReason: "end_turn" });
    expect(anthropicAdapter.parseStreamEvent({
      content_block: { id: "srvtoolu_synthetic", name: "web_search", type: "server_tool_use" },
      index: 0,
      type: "content_block_start"
    })).toEqual({});

    expect(googleAdapter.parseStreamEvent({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  args: { query: "synthetic query" },
                  name: "google_search"
                }
              }
            ]
          }
        }
      ]
    })).toEqual({});
  });

  it("uses Cherry-style reasoning effort for OpenRouter requests", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({
        baseUrl: "https://openrouter.ai/api/v1",
        id: "openrouter",
        type: "openai-compatible"
      } as Partial<AiProviderConfig>),
      "anthropic/claude-sonnet-4.6",
      messages,
      { stream: true, thinkingEnabled: true }
    );

    expect(request.body).toMatchObject({
      reasoning: { effort: "high" }
    });
  });

  it("uses Together.ai reasoning controls without leaking compatible helper fields", () => {
    const kimiEnabledRequest = getChatAdapter("together").buildRequest(
      provider({ baseUrl: "https://api.together.xyz/v1", type: "together" }),
      "moonshotai/Kimi-K2.5",
      messages,
      { stream: true, thinkingEnabled: true }
    );
    const kimiDisabledRequest = getChatAdapter("together").buildRequest(
      provider({ baseUrl: "https://api.together.xyz/v1", type: "together" }),
      "moonshotai/Kimi-K2.5",
      messages,
      { stream: true, thinkingEnabled: false }
    );
    const gptOssRequest = getChatAdapter("together").buildRequest(
      provider({ baseUrl: "https://api.together.xyz/v1", type: "together" }),
      "openai/gpt-oss-120b",
      messages,
      { stream: true, thinkingEnabled: true }
    );
    const deepseekReasoningOnlyRequest = getChatAdapter("together").buildRequest(
      provider({ baseUrl: "https://api.together.xyz/v1", type: "together" }),
      "deepseek-ai/DeepSeek-R1",
      messages,
      { stream: true, thinkingEnabled: true }
    );

    expect(kimiEnabledRequest.body).toMatchObject({
      reasoning: { enabled: true }
    });
    expect(kimiEnabledRequest.body).not.toHaveProperty("thinking");
    expect(kimiEnabledRequest.body).not.toHaveProperty("reasoning_effort");
    expect(kimiDisabledRequest.body).toMatchObject({
      reasoning: { enabled: false }
    });
    expect(kimiDisabledRequest.body).not.toHaveProperty("thinking");
    expect(gptOssRequest.body).toMatchObject({
      reasoning_effort: "high"
    });
    expect(gptOssRequest.body).not.toHaveProperty("reasoning");
    expect(deepseekReasoningOnlyRequest.body).not.toHaveProperty("thinking");
    expect(deepseekReasoningOnlyRequest.body).not.toHaveProperty("reasoning");
    expect(deepseekReasoningOnlyRequest.body).not.toHaveProperty("reasoning_effort");
  });

  it("infers Cherry-style thinking parameters for custom compatible reasoning models", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({
        baseUrl: "https://proxy.example.test/v1",
        type: "openai-compatible"
      } as Partial<AiProviderConfig>),
      "qwen3.6-plus",
      messages,
      { stream: true, thinkingEnabled: true }
    );

    expect(request.body).toMatchObject({
      chat_template_kwargs: {
        enable_thinking: true
      }
    });
  });

  it("infers Cherry-style disable parameters for custom compatible Qwen models", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({
        baseUrl: "https://proxy.example.test/v1",
        type: "openai-compatible"
      } as Partial<AiProviderConfig>),
      "qwen3.6-plus",
      messages,
      { stream: true, thinkingEnabled: false }
    );

    expect(request.body).toMatchObject({
      chat_template_kwargs: {
        enable_thinking: false
      }
    });
  });

  it("infers OpenAI-compatible Gemini thinking parameters without custom JSON", () => {
    const request = getChatAdapter("openai-compatible").buildRequest(
      provider({
        baseUrl: "https://proxy.example.test/v1",
        type: "openai-compatible"
      } as Partial<AiProviderConfig>),
      "google/gemini-3.1-pro-preview",
      messages,
      { stream: true, thinkingEnabled: true }
    );

    expect(request.body).toMatchObject({
      extra_body: {
        google: {
          thinking_config: {
            include_thoughts: true,
            thinking_budget: -1
          }
        }
      }
    });
  });

  it("enables visible thinking for providers with provider-specific request parameters", () => {
    expect(
      getChatAdapter("anthropic").buildRequest(
        provider({ type: "anthropic" }),
        "claude-opus-4-7",
        messages,
        { stream: true, thinkingEnabled: true }
      ).body
    ).toMatchObject({
      thinking: { display: "summarized", type: "adaptive" }
    });
    expect(
      getChatAdapter("google").buildRequest(
        provider({ baseUrl: "https://generativelanguage.googleapis.com/v1beta", type: "google" }),
        "gemini-3.1-pro-preview",
        messages,
        { stream: true, thinkingEnabled: true }
      ).body
    ).toMatchObject({
      generationConfig: {
        temperature: 0.7,
        thinkingConfig: { includeThoughts: true }
      }
    });
    expect(
      getChatAdapter("openrouter").buildRequest(
        provider({ baseUrl: "https://openrouter.ai/api/v1", type: "openrouter" }),
        "anthropic/claude-sonnet-4.6",
        messages,
        { stream: true, thinkingEnabled: true }
      ).body
    ).toMatchObject({
      reasoning: { effort: "high" }
    });
    expect(
      getChatAdapter("groq").buildRequest(
        provider({ baseUrl: "https://api.groq.com/openai/v1", type: "groq" }),
        "openai/gpt-oss-120b",
        messages,
        { stream: true, thinkingEnabled: true }
      ).body
    ).toMatchObject({
      reasoning_effort: "high",
      reasoning_format: "parsed"
    });
    expect(
      getChatAdapter("groq").buildRequest(
        provider({ baseUrl: "https://api.groq.com/openai/v1", type: "groq" }),
        "openai/gpt-oss-120b",
        messages,
        { stream: true, thinkingEnabled: false }
      ).body
    ).toMatchObject({
      reasoning_format: "hidden"
    });
    expect(
      getChatAdapter("mistral").buildRequest(
        provider({ baseUrl: "https://api.mistral.ai/v1", type: "mistral" }),
        "mistral-small-latest",
        messages,
        { stream: true, thinkingEnabled: true }
      ).body
    ).toMatchObject({
      reasoning_effort: "high"
    });
  });

  it("explicitly disables provider reasoning when an API has a documented off switch", () => {
    expect(
      getChatAdapter("ollama").buildRequest(
        provider({ baseUrl: "http://localhost:11434/v1", type: "ollama" }),
        "qwen3:8b",
        messages,
        { stream: true, thinkingEnabled: true }
      ).body
    ).toMatchObject({
      think: true
    });
    expect(
      getChatAdapter("ollama").buildRequest(
        provider({ baseUrl: "http://localhost:11434/v1", type: "ollama" }),
        "qwen3:8b",
        messages,
        { stream: true, thinkingEnabled: false }
      ).body
    ).toMatchObject({
      think: false
    });
    expect(
      getChatAdapter("mistral").buildRequest(
        provider({ baseUrl: "https://api.mistral.ai/v1", type: "mistral" }),
        "mistral-small-latest",
        messages,
        { stream: true, thinkingEnabled: false }
      ).body
    ).toMatchObject({
      reasoning_effort: "none"
    });
    expect(
      getChatAdapter("xai").buildRequest(
        provider({ baseUrl: "https://api.x.ai/v1", type: "xai" }),
        "grok-4.3",
        messages,
        { stream: true, thinkingEnabled: false }
      ).body
    ).toMatchObject({
      reasoning_effort: "none"
    });
    expect(
      getChatAdapter("xai").buildRequest(
        provider({
          baseUrl: "https://api.x.ai/v1",
          models: [{ capabilities: ["text", "web"], enabled: true, id: "grok-4.3", name: "Grok 4.3" }],
          type: "xai"
        }),
        "grok-4.3",
        messages,
        { stream: true, thinkingEnabled: false, webSearchEnabled: true }
      ).body
    ).toMatchObject({
      reasoning: { effort: "none" },
      tools: [{ type: "web_search" }]
    });
  });

  it("does not send API key auth for Ollama chat requests", () => {
    const request = getChatAdapter("ollama").buildRequest(
      provider({
        apiKey: "stale-local-key",
        baseUrl: "http://localhost:11434/v1",
        type: "ollama"
      }),
      "llama3.3",
      messages,
      { stream: true }
    );

    expect(request.headers).not.toHaveProperty("Authorization");
    expect(request.headers).not.toHaveProperty("authorization");
  });

  it("parses DeepSeek reasoning stream fields separately from final text", () => {
    const adapter = getChatAdapter("deepseek");

    expect(
      adapter.parseStreamEvent({
        choices: [{ delta: { reasoning_content: "checking context" } }]
      })
    ).toEqual({ thinkingDelta: "checking context" });
    expect(
      adapter.parseStreamEvent({
        choices: [{ delta: { reasoning: "double checking" } }]
      })
    ).toEqual({ thinkingDelta: "double checking" });
    expect(
      adapter.parseStreamEvent({
        choices: [{ delta: { reasoning_text: "one more pass" } }]
      })
    ).toEqual({ thinkingDelta: "one more pass" });
    expect(
      adapter.parseStreamEvent({
        choices: [{ delta: { content: "Final answer" }, finish_reason: "stop" }]
      })
    ).toEqual({ contentDelta: "Final answer", finishReason: "stop" });
  });

  it("parses and replays OpenRouter reasoning_details around tool calls", () => {
    const adapter = getChatAdapter("openrouter");
    const reasoningDetails = [
      { format: "anthropic-claude-v1", index: 0, text: "Inspect first", type: "reasoning.text" },
      { data: "encrypted", id: "call_read", index: 1, type: "reasoning.encrypted" }
    ];

    expect(
      adapter.parseStreamEvent({
        choices: [{ delta: { reasoning_details: reasoningDetails } }]
      })
    ).toEqual({ reasoningDetails });

    const request = adapter.buildRequest(
      provider({ baseUrl: "https://openrouter.ai/api/v1", id: "openrouter", type: "openrouter" }),
      "anthropic/claude-sonnet-4.5",
      [
        { content: "Inspect.", role: "user" },
        {
          content: "",
          role: "assistant",
          toolCalls: [{
            arguments: {},
            id: "call_read",
            name: "read_document",
            thoughtSignature: encodeOpenRouterReasoningDetails(reasoningDetails)
          }]
        },
        {
          content: "Tool result from read_document:\nDraft",
          role: "user",
          toolResult: { outputText: "Draft", toolCallId: "call_read", toolName: "read_document" }
        }
      ],
      { stream: true }
    );

    expect(request.body).toMatchObject({
      messages: [
        { content: "Inspect.", role: "user" },
        { reasoning_details: reasoningDetails, role: "assistant" },
        { content: "Draft", role: "tool", tool_call_id: "call_read" }
      ]
    });
  });

  it("parses OpenAI-compatible stream events that carry final message content", () => {
    const adapter = getChatAdapter("openai-compatible");

    expect(
      adapter.parseStreamEvent({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "MiMo grounded answer",
              role: "assistant"
            }
          }
        ]
      })
    ).toEqual({ contentDelta: "MiMo grounded answer", finishReason: "stop" });
  });

  it("parses provider-specific visible thinking stream events separately from final text", () => {
    expect(
      getChatAdapter("anthropic").parseStreamEvent({
        delta: { thinking: "checking documents", type: "thinking_delta" },
        type: "content_block_delta"
      })
    ).toEqual({ thinkingDelta: "checking documents" });
    expect(
      getChatAdapter("google").parseStreamEvent({
        candidates: [
          {
            content: {
              parts: [
                { text: "checking context", thought: true },
                { text: "Final answer." }
              ]
            },
            finishReason: "STOP"
          }
        ]
      })
    ).toEqual({
      contentDelta: "Final answer.",
      finishReason: "STOP",
      thinkingDelta: "checking context"
    });
    expect(
      getChatAdapter("mistral").parseStreamEvent({
        choices: [
          {
            delta: {
              content: [
                { thinking: [{ text: "checking Mistral chunks", type: "text" }], type: "thinking" },
                { text: "Final answer.", type: "text" }
              ]
            }
          }
        ]
      })
    ).toEqual({
      contentDelta: "Final answer.",
      thinkingDelta: "checking Mistral chunks"
    });
  });

  it("builds provider-specific chat requests for Anthropic, Google, and Azure", () => {
    expect(getChatAdapter("anthropic").buildRequest(provider({ type: "anthropic" }), "claude-opus-4-7", messages)).toMatchObject({
      body: {
        max_tokens: 4096,
        messages: [{ content: "Rewrite this.", role: "user" }],
        model: "claude-opus-4-7",
        system: "You edit Markdown."
      },
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": "secret"
      },
      url: "https://api.anthropic.com/v1/messages"
    });
    expect(
      getChatAdapter("google").buildRequest(
        provider({ baseUrl: "https://generativelanguage.googleapis.com/v1beta", type: "google" }),
        "gemini-3.1-pro-preview",
        messages
      )
    ).toMatchObject({
      body: {
        contents: [{ parts: [{ text: "Rewrite this." }], role: "user" }],
        generationConfig: { temperature: 0.7 },
        systemInstruction: { parts: [{ text: "You edit Markdown." }] }
      },
      headers: { "content-type": "application/json" },
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=secret"
    });
    expect(
      getChatAdapter("azure-openai").buildRequest(
        provider({ baseUrl: "https://markra.openai.azure.com", type: "azure-openai" }),
        "writer-deployment",
        messages
      )
    ).toMatchObject({
      body: {
        messages,
        temperature: 0.7
      },
      headers: {
        "api-key": "secret",
        "content-type": "application/json"
      },
      url: "https://markra.openai.azure.com/openai/deployments/writer-deployment/chat/completions?api-version=2024-10-21"
    });
  });

  it("builds multimodal image parts for supported chat APIs", () => {
    expect(
      getChatAdapter("openai").buildRequest(provider({ baseUrl: "https://api.openai.com/v1", type: "openai" }), "gpt-5.5", multimodalMessages)
        .body
    ).toMatchObject({
      messages: [
        { content: "You inspect Markdown images.", role: "system" },
        {
          content: [
            { text: "User request:\nWhat is in this screenshot?", type: "text" },
            { image_url: { url: "data:image/png;base64,aGVsbG8=" }, type: "image_url" }
          ],
          role: "user"
        }
      ]
    });

    expect(getChatAdapter("anthropic").buildRequest(provider({ type: "anthropic" }), "claude-opus-4-7", multimodalMessages).body)
      .toMatchObject({
        messages: [
          {
            content: [
              { text: "User request:\nWhat is in this screenshot?", type: "text" },
              {
                source: { data: "aGVsbG8=", media_type: "image/png", type: "base64" },
                type: "image"
              }
            ],
            role: "user"
          }
        ]
      });

    expect(
      getChatAdapter("google").buildRequest(provider({ baseUrl: "https://generativelanguage.googleapis.com/v1beta", type: "google" }), "gemini", multimodalMessages)
        .body
    ).toMatchObject({
      contents: [
        {
          parts: [
            { text: "User request:\nWhat is in this screenshot?" },
            { inlineData: { data: "aGVsbG8=", mimeType: "image/png" } }
          ],
          role: "user"
        }
      ]
    });
  });

  it("parses common chat response shapes", () => {
    expect(
      getChatAdapter("openai").parseResponse({
        choices: [{ finish_reason: "stop", message: { content: "OpenAI response" } }]
      })
    ).toEqual({ content: "OpenAI response", finishReason: "stop" });
    expect(
      getChatAdapter("anthropic").parseResponse({
        content: [{ text: "Claude response", type: "text" }],
        stop_reason: "end_turn"
      })
    ).toEqual({ content: "Claude response", finishReason: "end_turn" });
    expect(
      getChatAdapter("google").parseResponse({
        candidates: [{ content: { parts: [{ text: "Gemini " }, { text: "response" }] } }]
      })
    ).toEqual({ content: "Gemini response" });
    expect(
      getChatAdapter("google").parseResponse({
        candidates: [{ content: { parts: [{ text: "Gemini thought", thought: true }, { text: "Gemini response" }] } }]
      })
    ).toEqual({ content: "Gemini response" });
    expect(
      getChatAdapter("mistral").parseResponse({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: [
                { thinking: [{ text: "Mistral thought", type: "text" }], type: "thinking" },
                { text: "Mistral response", type: "text" }
              ]
            }
          }
        ]
      })
    ).toEqual({ content: "Mistral response", finishReason: "stop" });
  });

  it("builds inline AI messages from selection and document context", () => {
    expect(
      buildInlineAiMessages({
        documentContent: "# Title\n\nSelected text",
        prompt: "make it concise",
        targetText: "Selected text"
      })
    ).toEqual([
      expect.objectContaining({ role: "system" }),
      {
        content: expect.stringContaining("User instruction:\nmake it concise"),
        role: "user"
      }
    ]);
    expect(
      buildInlineAiMessages({
        documentContent: "# Title",
        prompt: "continue",
        targetScope: "block",
        targetText: "# Title"
      })[1]?.content
    ).toContain("Current Markdown block");
  });
});
