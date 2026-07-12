import { chatCompletion, chatCompletionStream } from "./chat-completion";
import type { AiProviderConfig } from "@markra/providers";
import { decodeOpenRouterReasoningDetails, decodeProviderMetadata } from "./reasoning-metadata";

function provider(overrides: Partial<AiProviderConfig> = {}): AiProviderConfig {
  return {
    apiKey: "secret",
    baseUrl: "https://api.openai.com/v1",
    defaultModelId: "gpt-5.5",
    enabled: true,
    id: "openai",
    models: [],
    name: "OpenAI",
    type: "openai",
    ...overrides
  };
}

describe("chatCompletion", () => {
  it("sends a native POST request and parses the provider response", async () => {
    const transport = vi.fn().mockResolvedValue({
      body: {
        choices: [{ finish_reason: "stop", message: { content: "Improved text" } }]
      },
      status: 200
    });

    await expect(chatCompletion(provider(), "gpt-5.5", [{ content: "Hi", role: "user" }], transport)).resolves.toEqual({
      content: "Improved text",
      finishReason: "stop"
    });
    expect(transport).toHaveBeenCalledWith({
      body: JSON.stringify({
        messages: [{ content: "Hi", role: "user" }],
        model: "gpt-5.5",
        temperature: 0.7
      }),
      headers: {
        Authorization: "Bearer secret",
        "content-type": "application/json"
      },
      url: "https://api.openai.com/v1/chat/completions"
    });
  });

  it("throws readable errors for failed native responses", async () => {
    const transport = vi.fn().mockResolvedValue({
      body: { error: { message: "Invalid API key" } },
      status: 401
    });

    await expect(chatCompletion(provider(), "gpt-5.5", [{ content: "Hi", role: "user" }], transport)).rejects.toThrow(
      "Invalid API key"
    );
  });

  it("throws provider errors returned with a successful native status", async () => {
    const transport = vi.fn().mockResolvedValue({
      body: { error: { message: "Upstream service temporarily unavailable", type: "upstream_error" } },
      status: 200
    });

    await expect(chatCompletion(provider(), "gpt-5.5", [{ content: "Hi", role: "user" }], transport)).rejects.toThrow(
      "Upstream service temporarily unavailable"
    );
  });

  it("includes provider error details for failed native stream responses", async () => {
    const streamTransport = vi.fn(async () => ({
      body: {
        error: {
          message: "Param Incorrect",
          param: "web search tool found in the request body, but webSearchEnabled is false"
        }
      },
      status: 400
    }));

    await expect(
      chatCompletionStream(
        provider({
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          id: "xiaomi-mimo",
          type: "openai-compatible"
        }),
        "mimo-v2.5",
        [{ content: "Hi", role: "user" }],
        {
          streamTransport,
          webSearchEnabled: true
        }
      )
    ).rejects.toThrow("Param Incorrect: web search tool found in the request body, but webSearchEnabled is false");
  });

  it("throws provider errors from successful raw JSON stream chunks", async () => {
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('{"error":{"message":"Upstream service temporarily unavailable","type":"upstream_error"}}\n');

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(provider(), "gpt-5.5", [{ content: "Hi", role: "user" }], {
        streamTransport
      })
    ).rejects.toThrow("Upstream service temporarily unavailable");
  });

  it("falls back to non-stream Responses requests when the stream transport fails before content", async () => {
    const onDelta = vi.fn();
    const streamTransport = vi.fn(async () => ({
      body: { error: { message: "Upstream service temporarily unavailable", type: "upstream_error" } },
      status: 502
    }));
    const fallbackTransport = vi.fn(async () => ({
      body: {
        object: "response",
        output: [
          {
            content: [{ text: "Fallback answer", type: "output_text" }],
            role: "assistant",
            type: "message"
          }
        ],
        status: "completed"
      },
      status: 200
    }));

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "openai-responses"
        }),
        "gpt-5.5",
        [{ content: "Hi", role: "user" }],
        {
          fallbackTransport,
          onDelta,
          streamTransport
        }
      )
    ).resolves.toEqual({
      content: "Fallback answer",
      finishReason: "completed"
    });

    expect(streamTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('"stream":true'),
        url: "https://api.openai.com/v1/responses"
      }),
      expect.any(Function)
    );
    expect(fallbackTransport).toHaveBeenCalledWith({
      body: JSON.stringify({
        input: [{ content: [{ text: "Hi", type: "input_text" }], role: "user", type: "message" }],
        model: "gpt-5.5",
        tools: []
      }),
      headers: {
        Authorization: "Bearer secret",
        "content-type": "application/json"
      },
      url: "https://api.openai.com/v1/responses"
    });
    expect(onDelta).toHaveBeenCalledWith("Fallback answer");
  });

  it("falls back to non-stream compatible chat when non-stream Responses also fails", async () => {
    const onDelta = vi.fn();
    const streamTransport = vi.fn(async () => ({
      body: { error: { message: "Upstream service temporarily unavailable", type: "upstream_error" } },
      status: 502
    }));
    const fallbackTransport = vi.fn()
      .mockResolvedValueOnce({
        body: { error: { message: "Upstream service temporarily unavailable", type: "upstream_error" } },
        status: 502
      })
      .mockResolvedValueOnce({
        body: {
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: "Compatible chat answer",
                role: "assistant"
              }
            }
          ]
        },
        status: 200
      });

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "openai-responses"
        }),
        "gpt-5.5",
        [{ content: "Hi", role: "user" }],
        {
          fallbackTransport,
          onDelta,
          streamTransport
        }
      )
    ).resolves.toEqual({
      content: "Compatible chat answer",
      finishReason: "stop"
    });

    expect(fallbackTransport).toHaveBeenNthCalledWith(1, expect.objectContaining({
      body: expect.stringContaining('"input"'),
      url: "https://api.openai.com/v1/responses"
    }));
    expect(fallbackTransport).toHaveBeenNthCalledWith(2, {
      body: JSON.stringify({
        messages: [{ content: "Hi", role: "user" }],
        model: "gpt-5.5",
        temperature: 0.7
      }),
      headers: {
        Authorization: "Bearer secret",
        "content-type": "application/json"
      },
      url: "https://api.openai.com/v1/chat/completions"
    });
    expect(onDelta).toHaveBeenCalledWith("Compatible chat answer");
  });

  it("falls back to non-stream compatible chat when a compatible stream has malformed JSON before text", async () => {
    const onDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"id":"chatcmpl_test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"unterminated}\n\n');

      return { status: 200 };
    });
    const fallbackTransport = vi.fn(async () => ({
      body: {
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "Recovered compatible answer",
              role: "assistant"
            }
          }
        ]
      },
      status: 200
    }));

    await expect(
      chatCompletionStream(provider(), "gpt-5.5", [{ content: "Hi", role: "user" }], {
        fallbackTransport,
        onDelta,
        streamTransport
      })
    ).resolves.toEqual({
      content: "Recovered compatible answer",
      finishReason: "stop"
    });

    expect(fallbackTransport).toHaveBeenCalledWith({
      body: JSON.stringify({
        messages: [{ content: "Hi", role: "user" }],
        model: "gpt-5.5",
        temperature: 0.7
      }),
      headers: {
        Authorization: "Bearer secret",
        "content-type": "application/json"
      },
      url: "https://api.openai.com/v1/chat/completions"
    });
    expect(onDelta).toHaveBeenCalledWith("Recovered compatible answer");
  });

  it("uses the Vercel AI SDK stream path for OpenAI Responses when enabled", async () => {
    const onDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"response.created","response":{"id":"resp_test","created_at":0,"model":"gpt-5.5","object":"response","status":"in_progress"}}\n\n');
      onChunk('data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg_1","type":"message","status":"in_progress","role":"assistant","content":[]}}\n\n');
      onChunk('data: {"type":"response.content_part.added","item_id":"msg_1","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n');
      onChunk('data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"SDK "}\n\n');
      onChunk('data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"answer"}\n\n');
      onChunk('data: {"type":"response.output_text.done","item_id":"msg_1","output_index":0,"content_index":0,"text":"SDK answer"}\n\n');
      onChunk('data: {"type":"response.content_part.done","item_id":"msg_1","output_index":0,"content_index":0,"part":{"type":"output_text","text":"SDK answer","annotations":[]}}\n\n');
      onChunk('data: {"type":"response.output_item.done","output_index":0,"item":{"id":"msg_1","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"SDK answer","annotations":[]}]}}\n\n');
      onChunk('data: {"type":"response.completed","response":{"id":"resp_test","created_at":0,"model":"gpt-5.5","object":"response","status":"completed","output":[{"id":"msg_1","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"SDK answer","annotations":[]}]}],"usage":{"input_tokens":1,"output_tokens":2,"total_tokens":3,"input_tokens_details":{"cached_tokens":0},"output_tokens_details":{"reasoning_tokens":0}}}}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });
    const fallbackTransport = vi.fn();

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "openai-responses"
        }),
        "gpt-5.5",
        [{ content: "Hi", role: "user" }],
        {
          fallbackTransport,
          onDelta,
          streamTransport,
          useVercelAiSdk: true
        }
      )
    ).resolves.toEqual({
      content: "SDK answer",
      finishReason: "stop"
    });

    expect(streamTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('"stream":true'),
        url: "https://api.openai.com/v1/responses"
      }),
      expect.any(Function)
    );
    expect(onDelta).toHaveBeenNthCalledWith(1, "SDK ");
    expect(onDelta).toHaveBeenNthCalledWith(2, "answer");
    expect(fallbackTransport).not.toHaveBeenCalled();
  });

  it("uses the Vercel AI SDK stream path for OpenAI Responses thinking and web search", async () => {
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"response.created","response":{"id":"resp_test","created_at":0,"model":"gpt-5.5","object":"response","status":"in_progress"}}\n\n');
      onChunk('data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg_1","type":"message","status":"in_progress","role":"assistant","content":[]}}\n\n');
      onChunk('data: {"type":"response.content_part.added","item_id":"msg_1","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}}\n\n');
      onChunk('data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"Fresh "}\n\n');
      onChunk('data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"answer"}\n\n');
      onChunk('data: {"type":"response.output_text.done","item_id":"msg_1","output_index":0,"content_index":0,"text":"Fresh answer"}\n\n');
      onChunk('data: {"type":"response.completed","response":{"id":"resp_test","created_at":0,"model":"gpt-5.5","object":"response","status":"completed","output":[{"id":"msg_1","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Fresh answer","annotations":[]}]}],"usage":{"input_tokens":1,"output_tokens":2,"total_tokens":3,"input_tokens_details":{"cached_tokens":0},"output_tokens_details":{"reasoning_tokens":0}}}}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "openai-responses",
          models: [{ capabilities: ["text", "web"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }]
        }),
        "gpt-5.5",
        [{ content: "Find current info.", role: "user" }],
        {
          fallbackTransport: vi.fn(),
          streamTransport,
          thinkingEnabled: true,
          useVercelAiSdk: true,
          webSearchEnabled: true
        }
      )
    ).resolves.toEqual({
      content: "Fresh answer",
      finishReason: "stop"
    });

    const request = streamTransport.mock.calls[0]?.[0];
    const body = JSON.parse(request?.body ?? "{}") as Record<string, unknown>;
    expect(request?.headers).toEqual(expect.objectContaining({
      "user-agent": expect.stringContaining("ai-sdk/openai/")
    }));
    expect(body.reasoning).toEqual({ effort: "high", summary: "auto" });
    expect(body.tools).toContainEqual(expect.objectContaining({ type: "web_search" }));
  });

  it("streams Vercel AI SDK tool calls for OpenAI Responses when enabled", async () => {
    const onToolCallDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"response.created","response":{"id":"resp_tool","created_at":0,"model":"gpt-5.5","object":"response","status":"in_progress"}}\n\n');
      onChunk('data: {"type":"response.output_item.added","output_index":0,"item":{"id":"fc_1","type":"function_call","status":"in_progress","call_id":"call_read","name":"read_document","arguments":""}}\n\n');
      onChunk('data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","output_index":0,"delta":"{\\"path\\":"}\n\n');
      onChunk('data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","output_index":0,"delta":"\\"README.md\\"}"}\n\n');
      onChunk('data: {"type":"response.function_call_arguments.done","item_id":"fc_1","output_index":0,"arguments":"{\\"path\\":\\"README.md\\"}"}\n\n');
      onChunk('data: {"type":"response.output_item.done","output_index":0,"item":{"id":"fc_1","type":"function_call","status":"completed","call_id":"call_read","name":"read_document","arguments":"{\\"path\\":\\"README.md\\"}"}}\n\n');
      onChunk('data: {"type":"response.completed","response":{"id":"resp_tool","created_at":0,"model":"gpt-5.5","object":"response","status":"completed","output":[{"id":"fc_1","type":"function_call","status":"completed","call_id":"call_read","name":"read_document","arguments":"{\\"path\\":\\"README.md\\"}"}],"usage":{"input_tokens":1,"output_tokens":2,"total_tokens":3,"input_tokens_details":{"cached_tokens":0},"output_tokens_details":{"reasoning_tokens":0}}}}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    const response = await chatCompletionStream(
      provider({
        apiStyle: "openai-responses"
      }),
      "gpt-5.5",
      [{ content: "Read the document.", role: "user" }],
      {
        fallbackTransport: vi.fn(),
        onToolCallDelta,
        streamTransport,
        tools: [
          {
            description: "Read the current document.",
            name: "read_document",
            parameters: {
              additionalProperties: false,
              properties: {
                path: { type: "string" }
              },
              required: ["path"],
              type: "object"
            }
          }
        ],
        useVercelAiSdk: true
      }
    );
    expect(response).toEqual({
      content: "",
      finishReason: "tool-calls",
      toolCalls: [
        {
          arguments: { path: "README.md" },
          id: "call_read",
          name: "read_document",
          thoughtSignature: expect.any(String)
        }
      ]
    });
    expect(decodeProviderMetadata(response.toolCalls?.[0]?.thoughtSignature)).toEqual({
      openai: { itemId: "fc_1" }
    });

    expect(onToolCallDelta).toHaveBeenCalledWith({
      id: "call_read",
      index: 0,
      nameDelta: "read_document"
    });
    expect(onToolCallDelta).toHaveBeenCalledWith({
      argumentsDelta: "{\"path\":\"README.md\"}",
      id: "call_read",
      index: 0,
      nameDelta: "read_document",
      replaceArguments: true,
      replaceName: true
    });
  });

  it("captures and replays OpenAI Responses reasoning items", async () => {
    const onThinkingMetadata = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"response.created","response":{"id":"resp_reasoning","created_at":0,"model":"gpt-5.5","object":"response","status":"in_progress"}}\n\n');
      onChunk('data: {"type":"response.output_item.added","output_index":0,"item":{"id":"rs_1","type":"reasoning","status":"in_progress","summary":[],"encrypted_content":"encrypted-reasoning"}}\n\n');
      onChunk('data: {"type":"response.output_item.done","output_index":0,"item":{"id":"rs_1","type":"reasoning","status":"completed","summary":[],"encrypted_content":"encrypted-reasoning"}}\n\n');
      onChunk('data: {"type":"response.completed","response":{"id":"resp_reasoning","created_at":0,"model":"gpt-5.5","object":"response","status":"completed","output":[{"id":"rs_1","type":"reasoning","status":"completed","summary":[],"encrypted_content":"encrypted-reasoning"}],"usage":{"input_tokens":1,"output_tokens":2,"total_tokens":3,"input_tokens_details":{"cached_tokens":0},"output_tokens_details":{"reasoning_tokens":1}}}}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });
    const openAiResponsesProvider = provider({ apiStyle: "openai-responses" });

    await chatCompletionStream(openAiResponsesProvider, "gpt-5.5", [{ content: "Inspect.", role: "user" }], {
      fallbackTransport: vi.fn(),
      onThinkingMetadata,
      streamTransport,
      thinkingEnabled: true,
      useVercelAiSdk: true
    });

    const signature = onThinkingMetadata.mock.calls
      .map(([metadata]) => metadata.signature as string | undefined)
      .find((value) => decodeProviderMetadata(value)?.openai !== undefined);
    expect(decodeProviderMetadata(signature)).toEqual({
      openai: { itemId: "rs_1", reasoningEncryptedContent: "encrypted-reasoning" }
    });

    const replayStreamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"response.created","response":{"id":"resp_done","created_at":0,"model":"gpt-5.5","object":"response","status":"in_progress"}}\n\n');
      onChunk('data: {"type":"response.completed","response":{"id":"resp_done","created_at":0,"model":"gpt-5.5","object":"response","status":"completed","output":[{"id":"msg_1","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Done","annotations":[]}]}],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2,"input_tokens_details":{"cached_tokens":0},"output_tokens_details":{"reasoning_tokens":0}}}}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });
    await chatCompletionStream(
      openAiResponsesProvider,
      "gpt-5.5",
      [
        { content: "Inspect.", role: "user" },
        {
          content: "",
          role: "assistant",
          thinking: "",
          thinkingSignature: signature,
          toolCalls: [{ arguments: {}, id: "call_read", name: "read_document" }]
        },
        {
          content: "Tool result from read_document:\nDraft",
          role: "user",
          toolResult: { outputText: "Draft", toolCallId: "call_read", toolName: "read_document" }
        }
      ],
      {
        fallbackTransport: vi.fn(),
        streamTransport: replayStreamTransport,
        thinkingEnabled: true,
        tools: [{ description: "Read.", name: "read_document", parameters: { properties: {}, type: "object" } }],
        useVercelAiSdk: true
      }
    );

    const replayBody = JSON.parse(replayStreamTransport.mock.calls[0]?.[0].body ?? "{}") as {
      input?: Array<Record<string, unknown>>;
    };
    expect(replayBody.input).toContainEqual({ id: "rs_1", type: "item_reference" });
  });

  it("does not fall back after the Vercel AI SDK has emitted tool-call state", async () => {
    const onToolCallDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"response.created","response":{"id":"resp_tool","created_at":0,"model":"gpt-5.5","object":"response","status":"in_progress"}}\n\n');
      onChunk('data: {"type":"response.output_item.added","output_index":0,"item":{"id":"fc_1","type":"function_call","status":"in_progress","call_id":"call_read","name":"read_document","arguments":""}}\n\n');
      onChunk('data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","output_index":0,"delta":"{\\"path\\":"}\n\n');
      onChunk('data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":1,"content_index":0,"delta":"unterminated}\n\n');

      return { status: 200 };
    });
    const fallbackTransport = vi.fn(async () => ({
      body: {
        object: "response",
        output: [
          {
            arguments: "{\"path\":\"README.md\"}",
            call_id: "call_read",
            name: "read_document",
            type: "function_call"
          }
        ],
        status: "completed"
      },
      status: 200
    }));

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "openai-responses"
        }),
        "gpt-5.5",
        [{ content: "Read the document.", role: "user" }],
        {
          fallbackTransport,
          onToolCallDelta,
          streamTransport,
          tools: [
            {
              description: "Read the current document.",
              name: "read_document",
              parameters: {
                additionalProperties: false,
                properties: {
                  path: { type: "string" }
                },
                required: ["path"],
                type: "object"
              }
            }
          ],
          useVercelAiSdk: true
        }
      )
    ).rejects.toThrow();

    expect(onToolCallDelta).toHaveBeenCalledWith({
      id: "call_read",
      index: 0,
      nameDelta: "read_document"
    });
    expect(fallbackTransport).not.toHaveBeenCalled();
  });

  it("uses the Vercel AI SDK stream path for Anthropic when enabled", async () => {
    const onDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[],"stop_reason":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n');
      onChunk('data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n');
      onChunk('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Claude "}}\n\n');
      onChunk('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"answer"}}\n\n');
      onChunk('data: {"type":"content_block_stop","index":0}\n\n');
      onChunk('data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}\n\n');
      onChunk('data: {"type":"message_stop"}\n\n');

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "anthropic",
          baseUrl: "https://api.anthropic.com/v1",
          id: "anthropic",
          name: "Anthropic",
          type: "anthropic"
        }),
        "claude-sonnet-4-5",
        [{ content: "Hi", role: "user" }],
        {
          fallbackTransport: vi.fn(),
          onDelta,
          streamTransport,
          useVercelAiSdk: true
        }
      )
    ).resolves.toEqual({
      content: "Claude answer",
      finishReason: "stop"
    });

    expect(streamTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('"max_tokens":64000'),
        headers: expect.objectContaining({
          "x-api-key": "secret"
        }),
        url: "https://api.anthropic.com/v1/messages"
      }),
      expect.any(Function)
    );
    expect(onDelta).toHaveBeenNthCalledWith(1, "Claude ");
    expect(onDelta).toHaveBeenNthCalledWith(2, "answer");
  });

  it("uses the Vercel AI SDK stream path for Anthropic thinking and web search", async () => {
    const onThinkingDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[],"stop_reason":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n');
      onChunk('data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n');
      onChunk('data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Checking sources"}}\n\n');
      onChunk('data: {"type":"content_block_stop","index":0}\n\n');
      onChunk('data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n');
      onChunk('data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Claude answer"}}\n\n');
      onChunk('data: {"type":"content_block_stop","index":1}\n\n');
      onChunk('data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}\n\n');
      onChunk('data: {"type":"message_stop"}\n\n');

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "anthropic",
          baseUrl: "https://api.anthropic.com/v1",
          id: "anthropic",
          models: [{ capabilities: ["text", "web"], enabled: true, id: "claude-sonnet-4-5", name: "Claude Sonnet" }],
          name: "Anthropic",
          type: "anthropic"
        }),
        "claude-sonnet-4-5",
        [{ content: "Find current info.", role: "user" }],
        {
          fallbackTransport: vi.fn(),
          onThinkingDelta,
          streamTransport,
          thinkingEnabled: true,
          useVercelAiSdk: true,
          webSearchEnabled: true
        }
      )
    ).resolves.toEqual({
      content: "Claude answer",
      finishReason: "stop"
    });

    const request = streamTransport.mock.calls[0]?.[0];
    const body = JSON.parse(request?.body ?? "{}") as Record<string, unknown>;
    expect(request?.headers).toEqual(expect.objectContaining({
      "user-agent": expect.stringContaining("ai-sdk/anthropic/")
    }));
    expect(body.thinking).toEqual({ budget_tokens: 1024, type: "enabled" });
    expect(body.tools).toContainEqual(expect.objectContaining({
      name: "web_search",
      type: "web_search_20250305"
    }));
    expect(onThinkingDelta).toHaveBeenCalledWith("Checking sources");
  });

  it("preserves Anthropic tool call arguments emitted as SDK string input", async () => {
    const onToolCallDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[],"stop_reason":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n');
      onChunk('data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_read","name":"read_document","input":{}}}\n\n');
      onChunk('data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}\n\n');
      onChunk('data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"README.md\\"}"}}\n\n');
      onChunk('data: {"type":"content_block_stop","index":0}\n\n');
      onChunk('data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":2}}\n\n');
      onChunk('data: {"type":"message_stop"}\n\n');

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "anthropic",
          baseUrl: "https://api.anthropic.com/v1",
          id: "anthropic",
          name: "Anthropic",
          type: "anthropic"
        }),
        "claude-sonnet-4-5",
        [{ content: "Read the document.", role: "user" }],
        {
          fallbackTransport: vi.fn(),
          onToolCallDelta,
          streamTransport,
          tools: [
            {
              description: "Read the current document.",
              name: "read_document",
              parameters: {
                additionalProperties: false,
                properties: {
                  path: { type: "string" }
                },
                required: ["path"],
                type: "object"
              }
            }
          ],
          useVercelAiSdk: true
        }
      )
    ).resolves.toEqual({
      content: "",
      finishReason: "tool-calls",
      toolCalls: [
        {
          arguments: { path: "README.md" },
          id: "call_read",
          name: "read_document"
        }
      ]
    });

    expect(onToolCallDelta).toHaveBeenCalledWith({
      argumentsDelta: "{\"path\":\"README.md\"}",
      id: "call_read",
      index: 0,
      nameDelta: "read_document",
      replaceArguments: true,
      replaceName: true
    });
  });

  it("captures and replays Anthropic thinking signatures through the Vercel AI SDK", async () => {
    const onThinkingMetadata = vi.fn();
    const signatureStreamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[],"stop_reason":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n');
      onChunk('data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n');
      onChunk('data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Inspect first"}}\n\n');
      onChunk('data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"anthropic-signature"}}\n\n');
      onChunk('data: {"type":"content_block_stop","index":0}\n\n');
      onChunk('data: {"type":"content_block_start","index":1,"content_block":{"type":"redacted_thinking","data":"anthropic-redacted-data"}}\n\n');
      onChunk('data: {"type":"content_block_stop","index":1}\n\n');
      onChunk('data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}\n\n');
      onChunk('data: {"type":"message_stop"}\n\n');

      return { status: 200 };
    });
    const anthropicProvider = provider({
      apiStyle: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      id: "anthropic",
      name: "Anthropic",
      type: "anthropic"
    });

    await chatCompletionStream(anthropicProvider, "claude-sonnet-4-5", [{ content: "Inspect.", role: "user" }], {
      fallbackTransport: vi.fn(),
      onThinkingMetadata,
      streamTransport: signatureStreamTransport,
      thinkingEnabled: true,
      useVercelAiSdk: true
    });

    const signature = onThinkingMetadata.mock.calls
      .map(([metadata]) => metadata.signature as string | undefined)
      .find((value) => decodeProviderMetadata(value)?.anthropic !== undefined);
    expect(decodeProviderMetadata(signature)).toEqual({
      anthropic: { signature: "anthropic-signature" }
    });
    const redactedSignature = onThinkingMetadata.mock.calls
      .map(([metadata]) => metadata.signature as string | undefined)
      .find((value) => decodeProviderMetadata(value)?.anthropic?.redactedData !== undefined);
    expect(decodeProviderMetadata(redactedSignature)).toEqual({
      anthropic: { redactedData: "anthropic-redacted-data" }
    });

    const replayStreamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"message_start","message":{"id":"msg_2","type":"message","role":"assistant","model":"claude-sonnet-4-5","content":[],"stop_reason":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n');
      onChunk('data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n');
      onChunk('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Done"}}\n\n');
      onChunk('data: {"type":"content_block_stop","index":0}\n\n');
      onChunk('data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":1}}\n\n');
      onChunk('data: {"type":"message_stop"}\n\n');

      return { status: 200 };
    });

    await chatCompletionStream(
      anthropicProvider,
      "claude-sonnet-4-5",
      [
        { content: "Inspect.", role: "user" },
        {
          content: "",
          role: "assistant",
          thinking: "Inspect first",
          thinkingBlocks: [
            { thinking: "Inspect first", thinkingSignature: signature },
            { redacted: true, thinking: "", thinkingSignature: redactedSignature }
          ],
          thinkingSignature: signature,
          toolCalls: [{ arguments: {}, id: "call_read", name: "read_document" }]
        },
        {
          content: "Tool result from read_document:\nDraft",
          role: "user",
          toolResult: { outputText: "Draft", toolCallId: "call_read", toolName: "read_document" }
        }
      ],
      {
        fallbackTransport: vi.fn(),
        streamTransport: replayStreamTransport,
        thinkingEnabled: true,
        tools: [{ description: "Read.", name: "read_document", parameters: { properties: {}, type: "object" } }],
        useVercelAiSdk: true
      }
    );

    const replayBody = JSON.parse(replayStreamTransport.mock.calls[0]?.[0].body ?? "{}") as {
      messages?: Array<{ content?: Array<Record<string, unknown>>; role?: string }>;
    };
    expect(replayBody.messages?.find((message) => message.role === "assistant")?.content).toContainEqual({
      signature: "anthropic-signature",
      thinking: "Inspect first",
      type: "thinking"
    });
    expect(replayBody.messages?.find((message) => message.role === "assistant")?.content).toContainEqual({
      data: "anthropic-redacted-data",
      type: "redacted_thinking"
    });
  });

  it("uses the Vercel AI SDK stream path for Google when enabled", async () => {
    const onDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Gemini "}]}}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}\n\n');
      onChunk('data: {"candidates":[{"content":{"role":"model","parts":[{"text":"answer"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":2,"totalTokenCount":3}}\n\n');

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "google",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          id: "google",
          name: "Google",
          type: "google"
        }),
        "gemini-2.5-pro",
        [{ content: "Hi", role: "user" }],
        {
          fallbackTransport: vi.fn(),
          onDelta,
          streamTransport,
          useVercelAiSdk: true
        }
      )
    ).resolves.toEqual({
      content: "Gemini answer",
      finishReason: "stop"
    });

    expect(streamTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-goog-api-key": "secret"
        }),
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse"
      }),
      expect.any(Function)
    );
    expect(streamTransport.mock.calls[0]?.[0].url).not.toContain("key=");
    expect(onDelta).toHaveBeenNthCalledWith(1, "Gemini ");
    expect(onDelta).toHaveBeenNthCalledWith(2, "answer");
  });

  it("uses the Vercel AI SDK stream path for Google thinking and web search", async () => {
    const onThinkingDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"candidates":[{"content":{"role":"model","parts":[{"thought":true,"text":"Grounding "},{"text":"Gemini answer"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":2,"totalTokenCount":3}}\n\n');

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "google",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          id: "google",
          models: [{ capabilities: ["text", "web"], enabled: true, id: "gemini-3.1-pro-preview", name: "Gemini" }],
          name: "Google",
          type: "google"
        }),
        "gemini-3.1-pro-preview",
        [{ content: "Find current info.", role: "user" }],
        {
          fallbackTransport: vi.fn(),
          onThinkingDelta,
          streamTransport,
          thinkingEnabled: true,
          useVercelAiSdk: true,
          webSearchEnabled: true
        }
      )
    ).resolves.toEqual({
      content: "Gemini answer",
      finishReason: "stop"
    });

    const request = streamTransport.mock.calls[0]?.[0];
    const body = JSON.parse(request?.body ?? "{}") as Record<string, unknown>;
    expect(request?.headers).toEqual(expect.objectContaining({
      "user-agent": expect.stringContaining("ai-sdk/google/")
    }));
    expect(request?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse");
    expect(body.generationConfig).toEqual(expect.objectContaining({
      thinkingConfig: { includeThoughts: true }
    }));
    expect(body.tools).toContainEqual({ googleSearch: {} });
    expect(onThinkingDelta).toHaveBeenCalledWith("Grounding ");
  });

  it("captures and replays Gemini thought signatures on tool calls", async () => {
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"read_document","args":{}},"thoughtSignature":"gemini-signature"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}\n\n');

      return { status: 200 };
    });
    const googleProvider = provider({
      apiStyle: "google",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      id: "google",
      name: "Google",
      type: "google"
    });
    const firstResponse = await chatCompletionStream(
      googleProvider,
      "gemini-3.1-pro-preview",
      [{ content: "Read.", role: "user" }],
      {
        fallbackTransport: vi.fn(),
        streamTransport,
        thinkingEnabled: true,
        tools: [{ description: "Read.", name: "read_document", parameters: { properties: {}, type: "object" } }],
        useVercelAiSdk: true
      }
    );
    const thoughtSignature = firstResponse.toolCalls?.[0]?.thoughtSignature;
    expect(decodeProviderMetadata(thoughtSignature)).toEqual({
      google: { thoughtSignature: "gemini-signature" }
    });

    const replayStreamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Done"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}\n\n');

      return { status: 200 };
    });
    await chatCompletionStream(
      googleProvider,
      "gemini-3.1-pro-preview",
      [
        { content: "Read.", role: "user" },
        {
          content: "",
          role: "assistant",
          toolCalls: [{ arguments: {}, id: "call_read", name: "read_document", thoughtSignature }]
        },
        {
          content: "Tool result from read_document:\nDraft",
          role: "user",
          toolResult: { outputText: "Draft", toolCallId: "call_read", toolName: "read_document" }
        }
      ],
      {
        fallbackTransport: vi.fn(),
        streamTransport: replayStreamTransport,
        thinkingEnabled: true,
        tools: [{ description: "Read.", name: "read_document", parameters: { properties: {}, type: "object" } }],
        useVercelAiSdk: true
      }
    );

    const replayBody = JSON.parse(replayStreamTransport.mock.calls[0]?.[0].body ?? "{}") as {
      contents?: Array<{ parts?: Array<Record<string, unknown>>; role?: string }>;
    };
    expect(replayBody.contents?.find((message) => message.role === "model")?.parts).toContainEqual(expect.objectContaining({
      functionCall: { args: {}, id: "call_read", name: "read_document" },
      thoughtSignature: "gemini-signature"
    }));
  });

  it.each([
    {
      baseUrl: "https://api.deepseek.com",
      id: "deepseek",
      model: "deepseek-chat",
      name: "DeepSeek",
      type: "deepseek",
      url: "https://api.deepseek.com/chat/completions",
      userAgent: "ai-sdk/deepseek/"
    },
    {
      baseUrl: "https://api.mistral.ai/v1",
      id: "mistral",
      model: "mistral-large-latest",
      name: "Mistral",
      type: "mistral",
      url: "https://api.mistral.ai/v1/chat/completions",
      userAgent: "ai-sdk/mistral/"
    },
    {
      baseUrl: "https://api.groq.com/openai/v1",
      id: "groq",
      model: "llama-3.3-70b-versatile",
      name: "Groq",
      type: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      userAgent: "ai-sdk/groq/"
    },
    {
      baseUrl: "https://api.x.ai/v1",
      id: "xai",
      model: "grok-4",
      name: "xAI",
      type: "xai",
      url: "https://api.x.ai/v1/chat/completions",
      userAgent: "ai-sdk/xai/"
    },
    {
      baseUrl: "https://api.together.xyz/v1",
      id: "together",
      model: "moonshotai/Kimi-K2.5",
      name: "Together.ai",
      type: "together",
      url: "https://api.together.xyz/v1/chat/completions",
      userAgent: "ai-sdk/togetherai/"
    },
    {
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      id: "aliyun-bailian",
      model: "qwen3.6-plus",
      name: "Qwen",
      type: "openai-compatible",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      userAgent: "ai-sdk/alibaba/"
    }
  ] as const)("uses the provider-specific Vercel AI SDK package for $name", async ({ baseUrl, id, model, name, type, url, userAgent }) => {
    const onDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"id":"chatcmpl_test","object":"chat.completion.chunk","created":0,"model":"test","choices":[{"index":0,"delta":{"content":"SDK "}}]}\n\n');
      onChunk('data: {"id":"chatcmpl_test","object":"chat.completion.chunk","created":0,"model":"test","choices":[{"index":0,"delta":{"content":"answer"},"finish_reason":"stop"}]}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "openai-compatible",
          baseUrl,
          id,
          name,
          type
        }),
        model,
        [{ content: "Hi", role: "user" }],
        {
          fallbackTransport: vi.fn(),
          onDelta,
          streamTransport,
          useVercelAiSdk: true
        }
      )
    ).resolves.toEqual({
      content: "SDK answer",
      finishReason: "stop"
    });

    expect(streamTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining(`"model":"${model}"`),
        headers: expect.objectContaining({
          "user-agent": expect.stringContaining(userAgent)
        }),
        url
      }),
      expect.any(Function)
    );
    expect(onDelta).toHaveBeenNthCalledWith(1, "SDK ");
    expect(onDelta).toHaveBeenNthCalledWith(2, "answer");
  });

  it("replays DeepSeek V4 reasoning content through the Vercel AI SDK after a tool call", async () => {
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"id":"chatcmpl_test","object":"chat.completion.chunk","created":0,"model":"deepseek-v4-pro","choices":[{"index":0,"delta":{"content":"Done"},"finish_reason":"stop"}]}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    await chatCompletionStream(
      provider({
        apiStyle: "openai-compatible",
        baseUrl: "https://api.deepseek.com",
        id: "deepseek",
        name: "DeepSeek",
        type: "deepseek"
      }),
      "deepseek-v4-pro",
      [
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
        fallbackTransport: vi.fn(),
        streamTransport,
        thinkingEnabled: true,
        tools: [
          {
            description: "Read the current document.",
            name: "read_document",
            parameters: {
              additionalProperties: false,
              properties: {},
              type: "object"
            }
          }
        ],
        useVercelAiSdk: true
      }
    );

    const request = streamTransport.mock.calls[0]?.[0];
    const body = JSON.parse(request?.body ?? "{}") as {
      messages?: Array<Record<string, unknown>>;
    };
    expect(body.messages).toContainEqual(expect.objectContaining({
      reasoning_content: "I need to inspect the document before answering.",
      role: "assistant"
    }));
  });

  it("replays DeepSeek V4 reasoning content on the native fallback path", async () => {
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"choices":[{"delta":{"content":"Done"},"finish_reason":"stop"}]}\n\n');
      onChunk("data: [DONE]\n\n");
      return { status: 200 };
    });

    await chatCompletionStream(
      provider({
        apiStyle: "openai-compatible",
        baseUrl: "https://api.deepseek.com",
        id: "deepseek",
        name: "DeepSeek",
        type: "deepseek"
      }),
      "deepseek-v4-pro",
      [
        { content: "Inspect.", role: "user" },
        {
          content: "",
          role: "assistant",
          thinking: "Need the document first.",
          toolCalls: [{ arguments: {}, id: "call_read", name: "read_document" }]
        },
        {
          content: "Tool result from read_document:\nDraft",
          role: "user",
          toolResult: { outputText: "Draft", toolCallId: "call_read", toolName: "read_document" }
        }
      ],
      { streamTransport, thinkingEnabled: true }
    );

    const body = JSON.parse(streamTransport.mock.calls[0]?.[0].body ?? "{}") as {
      messages?: Array<Record<string, unknown>>;
    };
    expect(body.messages).toContainEqual(expect.objectContaining({
      reasoning_content: "Need the document first.",
      role: "assistant"
    }));
  });

  it.each([
    { baseUrl: "https://api.mistral.ai/v1", id: "mistral", model: "mistral-large-latest", name: "Mistral", type: "mistral" },
    { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", id: "aliyun-bailian", model: "qwen3.6-plus", name: "Qwen", type: "openai-compatible" }
  ] as const)("does not replay unsigned reasoning content through the $name SDK", async ({ baseUrl, id, model, name, type }) => {
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"id":"chatcmpl_test","object":"chat.completion.chunk","created":0,"model":"test","choices":[{"index":0,"delta":{"content":"Done"},"finish_reason":"stop"}]}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    await chatCompletionStream(
      provider({ apiStyle: "openai-compatible", baseUrl, id, name, type }),
      model,
      [
        { content: "Inspect.", role: "user" },
        {
          content: "",
          role: "assistant",
          thinking: "Unsigned private reasoning",
          toolCalls: [{ arguments: {}, id: "call_read", name: "read_document" }]
        },
        {
          content: "Tool result from read_document:\nDraft",
          role: "user",
          toolResult: { outputText: "Draft", toolCallId: "call_read", toolName: "read_document" }
        }
      ],
      {
        fallbackTransport: vi.fn(),
        streamTransport,
        thinkingEnabled: true,
        tools: [{ description: "Read.", name: "read_document", parameters: { properties: {}, type: "object" } }],
        useVercelAiSdk: true
      }
    );

    expect(streamTransport.mock.calls[0]?.[0].body).not.toContain("Unsigned private reasoning");
  });

  it("uses the Azure OpenAI Vercel AI SDK package with deployment URLs", async () => {
    const onDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"id":"chatcmpl_test","object":"chat.completion.chunk","created":0,"model":"test","choices":[{"index":0,"delta":{"content":"Azure "}}]}\n\n');
      onChunk('data: {"id":"chatcmpl_test","object":"chat.completion.chunk","created":0,"model":"test","choices":[{"index":0,"delta":{"content":"answer"},"finish_reason":"stop"}]}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "openai-compatible",
          baseUrl: "https://markra.openai.azure.com",
          id: "azure-openai",
          name: "Azure OpenAI",
          type: "azure-openai"
        }),
        "writer-deployment",
        [{ content: "Hi", role: "user" }],
        {
          fallbackTransport: vi.fn(),
          onDelta,
          streamTransport,
          useVercelAiSdk: true
        }
      )
    ).resolves.toEqual({
      content: "Azure answer",
      finishReason: "stop"
    });

    expect(streamTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('"model":"writer-deployment"'),
        headers: expect.objectContaining({
          "api-key": "secret",
          "user-agent": expect.stringContaining("ai-sdk/azure/")
        }),
        url: "https://markra.openai.azure.com/openai/deployments/writer-deployment/chat/completions?api-version=2024-10-21"
      }),
      expect.any(Function)
    );
    expect(onDelta).toHaveBeenNthCalledWith(1, "Azure ");
    expect(onDelta).toHaveBeenNthCalledWith(2, "answer");
  });

  it("does not send API key auth for Ollama Vercel AI SDK requests", async () => {
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"id":"chatcmpl_test","object":"chat.completion.chunk","created":0,"model":"test","choices":[{"index":0,"delta":{"content":"Local"},"finish_reason":"stop"}]}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          apiKey: "stale-local-key",
          apiStyle: "openai-compatible",
          baseUrl: "http://localhost:11434/v1",
          id: "ollama",
          name: "Ollama",
          type: "ollama"
        }),
        "llama3.3",
        [{ content: "Hi", role: "user" }],
        {
          fallbackTransport: vi.fn(),
          streamTransport,
          useVercelAiSdk: true
        }
      )
    ).resolves.toEqual({
      content: "Local",
      finishReason: "stop"
    });

    const requestHeaders = streamTransport.mock.calls[0]?.[0].headers ?? {};
    expect(requestHeaders).not.toHaveProperty("authorization");
    expect(requestHeaders).not.toHaveProperty("Authorization");
  });

  it("falls back to non-stream Responses requests when the stream returns a provider error event before content", async () => {
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"error":{"message":"Concurrency limit exceeded for user, please retry later","type":"rate_limit_error"}}\n\n');

      return { status: 200 };
    });
    const fallbackTransport = vi.fn(async () => ({
      body: {
        object: "response",
        output_text: "Recovered answer",
        status: "completed"
      },
      status: 200
    }));

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "openai-responses"
        }),
        "gpt-5.5",
        [{ content: "Hi", role: "user" }],
        {
          fallbackTransport,
          streamTransport
        }
      )
    ).resolves.toEqual({
      content: "Recovered answer",
      finishReason: "completed"
    });
    expect(fallbackTransport).toHaveBeenCalledOnce();
  });

  it("falls back to non-stream Responses requests when the stream ends without output", async () => {
    const streamTransport = vi.fn(async () => ({ status: 200 }));
    const fallbackTransport = vi.fn(async () => ({
      body: {
        object: "response",
        output_text: "Recovered empty stream",
        status: "completed"
      },
      status: 200
    }));

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "openai-responses"
        }),
        "gpt-5.5",
        [{ content: "Hi", role: "user" }],
        {
          fallbackTransport,
          streamTransport
        }
      )
    ).resolves.toEqual({
      content: "Recovered empty stream",
      finishReason: "completed"
    });
    expect(fallbackTransport).toHaveBeenCalledOnce();
  });

  it("falls back to non-stream Responses requests when malformed stream JSON follows tool call deltas", async () => {
    const onToolCallDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","call_id":"call_read_document","name":"read_document"}}\n\n');
      onChunk('data: {"type":"response.function_call_arguments.delta","output_index":0,"call_id":"call_read_document","delta":"{\\"path\\"\n\n');

      return { status: 200 };
    });
    const fallbackTransport = vi.fn(async () => ({
      body: {
        object: "response",
        output: [
          {
            arguments: "{\"path\":\"README.md\"}",
            call_id: "call_read_document",
            name: "read_document",
            type: "function_call"
          }
        ],
        status: "completed"
      },
      status: 200
    }));

    await expect(
      chatCompletionStream(
        provider({
          apiStyle: "openai-responses"
        }),
        "gpt-5.5",
        [{ content: "Summarize this document.", role: "user" }],
        {
          fallbackTransport,
          onToolCallDelta,
          streamTransport,
          tools: [
            {
              description: "Read the current document.",
              name: "read_document",
              parameters: {
                additionalProperties: false,
                properties: {},
                type: "object"
              }
            }
          ]
        }
      )
    ).resolves.toEqual({
      content: "",
      finishReason: "completed",
      toolCalls: [
        {
          arguments: { path: "README.md" },
          id: "call_read_document",
          name: "read_document"
        }
      ]
    });

    expect(onToolCallDelta).toHaveBeenCalledWith({
      id: "call_read_document",
      index: 0,
      nameDelta: "read_document"
    });
    expect(fallbackTransport).toHaveBeenCalledOnce();
  });

  it("streams provider SSE chunks through the native transport", async () => {
    const onDelta = vi.fn();
    const onThinkingDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"choices":[{"delta":{"reasoning_content":"Thinking"}}]}\n\n');
      onChunk('data: {"choices":[{"delta":{"content":"Better "}}]}\n\n');
      onChunk('data: {"choices":[{"delta":{"content":"text"},"finish_reason":"stop"}]}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(provider(), "gpt-5.5", [{ content: "Hi", role: "user" }], {
        onDelta,
        onThinkingDelta,
        streamTransport
      })
    ).resolves.toEqual({
      content: "Better text",
      finishReason: "stop"
    });

    expect(streamTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        body: JSON.stringify({
          messages: [{ content: "Hi", role: "user" }],
          model: "gpt-5.5",
          stream: true,
          temperature: 0.7
        })
      }),
      expect.any(Function)
    );
    expect(onThinkingDelta).toHaveBeenCalledWith("Thinking");
    expect(onDelta).toHaveBeenNthCalledWith(1, "Better ");
    expect(onDelta).toHaveBeenNthCalledWith(2, "text");
  });

  it("merges OpenRouter reasoning_details and replays them after a streamed tool call", async () => {
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.text","index":0,"text":"Inspect "}]}}]}\n\n');
      onChunk('data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.text","index":0,"text":"first"},{"type":"reasoning.encrypted","index":1,"id":"call_read","data":"encrypted"}],"tool_calls":[{"index":0,"id":"call_read","function":{"name":"read_document","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    const response = await chatCompletionStream(
      provider({
        baseUrl: "https://openrouter.ai/api/v1",
        id: "openrouter",
        name: "OpenRouter",
        type: "openrouter"
      }),
      "anthropic/claude-sonnet-4.5",
      [{ content: "Inspect.", role: "user" }],
      {
        fallbackTransport: vi.fn(),
        streamTransport,
        tools: [{ description: "Read.", name: "read_document", parameters: { properties: {}, type: "object" } }],
        useVercelAiSdk: true
      }
    );

    expect(response).toMatchObject({
      finishReason: "toolUse",
      toolCalls: [{ arguments: {}, id: "call_read", name: "read_document", thoughtSignature: expect.any(String) }]
    });
    expect(decodeOpenRouterReasoningDetails(response.toolCalls?.[0]?.thoughtSignature)).toEqual([
      { index: 0, text: "Inspect first", type: "reasoning.text" },
      { data: "encrypted", id: "call_read", index: 1, type: "reasoning.encrypted" }
    ]);
    expect(streamTransport.mock.calls[0]?.[0].headers["user-agent"]).toBeUndefined();
  });

  it("falls back to a final provider body when streaming chunks contain no text", async () => {
    const onDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"choices":[{"delta":{"annotations":[{"type":"url_citation","url":"https://example.test"}]}}]}\n\n');
      onChunk("data: [DONE]\n\n");

      return {
        body: {
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: "MiMo final answer from response body",
                role: "assistant"
              }
            }
          ]
        },
        status: 200
      };
    });

    await expect(
      chatCompletionStream(
        provider({
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          id: "xiaomi-mimo",
          type: "openai-compatible"
        }),
        "mimo-v2.5-pro",
        [{ content: "Hi", role: "user" }],
        {
          onDelta,
          streamTransport,
          webSearchEnabled: true
        }
      )
    ).resolves.toEqual({
      content: "MiMo final answer from response body",
      finishReason: "stop"
    });

    expect(onDelta).toHaveBeenCalledWith("MiMo final answer from response body");
  });

  it("parses raw JSON stream chunks from compatible endpoints that do not prefix SSE data lines", async () => {
    const onDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('{"choices":[{"delta":{"content":"Grounded "}}]}\n');
      onChunk('{"choices":[{"delta":{"content":"answer"},"finish_reason":"stop"}]}\n');

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          id: "xiaomi-mimo",
          type: "openai-compatible"
        }),
        "mimo-v2.5",
        [{ content: "Hi", role: "user" }],
        {
          onDelta,
          streamTransport,
          webSearchEnabled: true
        }
      )
    ).resolves.toEqual({
      content: "Grounded answer",
      finishReason: "stop"
    });

    expect(onDelta).toHaveBeenNthCalledWith(1, "Grounded ");
    expect(onDelta).toHaveBeenNthCalledWith(2, "answer");
  });

  it("extracts inline thinking tags from streamed content when thinking is enabled", async () => {
    const onDelta = vi.fn();
    const onThinkingDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"choices":[{"delta":{"content":"<think>checking "}}]}\n\n');
      onChunk('data: {"choices":[{"delta":{"content":"the note</think>Final "}}]}\n\n');
      onChunk('data: {"choices":[{"delta":{"content":"answer"},"finish_reason":"stop"}]}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(provider(), "gpt-5.5", [{ content: "Hi", role: "user" }], {
        onDelta,
        onThinkingDelta,
        streamTransport,
        thinkingEnabled: true
      })
    ).resolves.toEqual({
      content: "Final answer",
      finishReason: "stop"
    });

    expect(onThinkingDelta).toHaveBeenNthCalledWith(1, "checking ");
    expect(onThinkingDelta).toHaveBeenNthCalledWith(2, "the note");
    expect(onDelta).toHaveBeenNthCalledWith(1, "Final ");
    expect(onDelta).toHaveBeenNthCalledWith(2, "answer");
  });

  it("reconstructs Responses API tool calls from function_call_arguments.done events", async () => {
    const onToolCallDelta = vi.fn();
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk('data: {"type":"response.function_call_arguments.done","output_index":0,"call_id":"call_read_document","name":"read_document","arguments":"{\\"path\\":\\"README.md\\"}"}\n\n');
      onChunk('data: {"type":"response.completed"}\n\n');
      onChunk("data: [DONE]\n\n");

      return { status: 200 };
    });

    await expect(
      chatCompletionStream(
        provider({
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          id: "aliyun-bailian",
          type: "openai-compatible"
        }),
        "qwen3.6-plus",
        [{ content: "Read the document.", role: "user" }],
        {
          onToolCallDelta,
          streamTransport,
          tools: [
            {
              description: "Read the document.",
              name: "read_document",
              parameters: {
                additionalProperties: false,
                properties: {},
                type: "object"
              }
            }
          ],
          webSearchEnabled: true
        }
      )
    ).resolves.toEqual({
      content: "",
      finishReason: "stop",
      toolCalls: [
        {
          arguments: { path: "README.md" },
          id: "call_read_document",
          name: "read_document"
        }
      ]
    });

    expect(onToolCallDelta).toHaveBeenCalledWith({
      argumentsDelta: "{\"path\":\"README.md\"}",
      id: "call_read_document",
      index: 0,
      nameDelta: "read_document",
      replaceArguments: true,
      replaceName: true
    });
  });
});
