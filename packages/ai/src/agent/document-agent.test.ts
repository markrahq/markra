import { runDocumentAiAgent, type DocumentAiHistoryMessage } from "./document-agent";
import type { AiProviderConfig } from "@markra/providers";
import type { ChatMessage } from "./chat/types";
import {
  buildDocumentAgentMessages,
  buildDocumentToolCallingHistoryMessages,
  buildDocumentToolCallingSystemPrompt,
  buildDocumentToolCallingTurnMessages
} from "./document/messages";

function provider(overrides: Partial<AiProviderConfig> = {}): AiProviderConfig {
  return {
    apiKey: "secret",
    baseUrl: "https://api.openai.com/v1",
    defaultModelId: "gpt-5.5",
    enabled: true,
    id: "openai",
    models: [{ capabilities: ["text", "vision", "tools"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
    name: "OpenAI",
    type: "openai",
    ...overrides
  };
}

describe("document AI agent", () => {
  it("keeps explicit chat images on their original history and current turns", () => {
    const historyImage = {
      dataUrl: "data:image/png;base64,aGlzdG9yeQ==",
      id: "history-image",
      mimeType: "image/png"
    };
    const currentImage = {
      dataUrl: "data:image/webp;base64,Y3VycmVudA==",
      id: "current-image",
      mimeType: "image/webp"
    };
    const documentImage = {
      dataUrl: "data:image/gif;base64,ZG9jdW1lbnQ=",
      mimeType: "image/gif"
    };
    const messages = buildDocumentAgentMessages({
      documentContent: "# Synthetic note",
      documentImages: [documentImage],
      history: [{ images: [historyImage], role: "user", text: "Earlier image" }],
      images: [currentImage],
      prompt: "Compare these images",
      selection: null,
      toolResults: [],
      webSearchMode: "none"
    } as Parameters<typeof buildDocumentAgentMessages>[0] & { images: typeof currentImage[] });

    expect(messages[1]?.images).toEqual([historyImage]);
    expect(messages.at(-1)?.images).toEqual([currentImage, documentImage]);
  });

  it("keeps explicit images in tool-calling history and uses protocol text for image-only turns", () => {
    const image = {
      dataUrl: "data:image/png;base64,aGVsbG8=",
      id: "attachment-1",
      mimeType: "image/png"
    };
    const history = buildDocumentToolCallingHistoryMessages({
      history: [{ images: [image], role: "user", text: "" }],
      model: "gpt-5.5",
      providerId: "openai"
    });
    const turn = buildDocumentToolCallingTurnMessages({
      documentContent: "# Synthetic note",
      documentImages: [],
      images: [image],
      prompt: "",
      selection: null,
      webSearchMode: "none"
    } as Parameters<typeof buildDocumentToolCallingTurnMessages>[0] & { images: typeof image[] });
    const historyMessage = history[0];
    const currentMessage = turn.at(-1);

    expect(historyMessage?.role).toBe("user");
    expect(historyMessage?.role === "user" ? historyMessage.content : undefined).toEqual([
      { text: "Attached images", type: "text" },
      { data: image.dataUrl, mimeType: "image/png", type: "image" }
    ]);
    expect(currentMessage?.role).toBe("user");
    expect(currentMessage?.role === "user" ? currentMessage.content : undefined).toEqual([
      { text: "User request:\nAttached images", type: "text" },
      { data: image.dataUrl, mimeType: "image/png", type: "image" }
    ]);
  });

  it.each([
    { capabilities: ["text", "vision"] as const, type: "openai-compatible" as const },
    { capabilities: ["text", "vision", "tools"] as const, type: "openai" as const }
  ])("passes explicit current-turn images through the $type agent path", async ({ capabilities, type }) => {
    const image = {
      dataUrl: "data:image/png;base64,aGVsbG8=",
      id: "attachment-1",
      mimeType: "image/png"
    };
    const complete = vi.fn().mockImplementation(async (_provider, _model, messages: ChatMessage[]) => {
      expect(messages.at(-1)?.images).toEqual([
        expect.objectContaining({
          dataUrl: image.dataUrl,
          mimeType: image.mimeType
        })
      ]);

      return {
        content: "I inspected the attached image.",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Synthetic note",
      documentPath: "/vault/note.md",
      images: [image],
      model: "gpt-5.5",
      prompt: "Inspect this image",
      provider: provider({
        models: [{ capabilities: [...capabilities], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
        type
      }),
      workspaceFiles: []
    });

    expect(result.content).toBe("I inspected the attached image.");
  });

  it("adds basic runtime context to document system prompts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2042, 2, 4, 5, 6, 7));

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown";
      const chatOnlySystemPrompt = buildDocumentAgentMessages({
        documentContent: "# Synthetic note",
        documentImages: [],
        history: [],
        prompt: "Summarize this synthetic note.",
        selection: null,
        toolResults: [],
        webSearchMode: "none"
      })[0]?.content ?? "";
      const toolCallingSystemPrompt = buildDocumentToolCallingSystemPrompt("none");

      for (const systemPrompt of [chatOnlySystemPrompt, toolCallingSystemPrompt]) {
        expect(systemPrompt).toContain("Current date: 2042-03-04");
        expect(systemPrompt).toContain("Current time: 05:06:07");
        expect(systemPrompt).toContain(`Current timezone: ${timezone}`);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces provider errors from the tool-calling runtime", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("Concurrency limit exceeded for user, please retry later"));

    await expect(runDocumentAiAgent({
      complete,
      documentContent: "# Draft",
      documentPath: "/vault/README.md",
      model: "gpt-5.5",
      prompt: "Summarize this document.",
      provider: provider(),
      workspaceFiles: []
    })).rejects.toThrow("Concurrency limit exceeded for user, please retry later");
  });

  it("asks the tool-calling agent to answer in the user's language", async () => {
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
      expect(messages[0]?.content).toContain("Reply in the user's language");
      expect(messages[0]?.content).toContain("Use only the context and tools available in this turn");
      expect(messages[0]?.content).toContain("After a successful write tool call, briefly tell the user what changed");

      return {
        content: "I will answer in the user's language.",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Draft",
      documentPath: "/vault/README.md",
      model: "gpt-5.5",
      prompt: "Please review this document.",
      provider: provider(),
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "I will answer in the user's language.",
      finishReason: "stop",
      preparedPreview: false
    });
  });

  it("lets the tool-calling agent read document images through a tool", async () => {
    const readDocumentImage = vi.fn(async (src: string) => ({
      alt: "Architecture screenshot",
      dataUrl: "data:image/png;base64,aGVsbG8=",
      mimeType: "image/png",
      path: `/vault/${src}`,
      src
    }));
    const complete = vi.fn()
      .mockImplementationOnce(async (_provider, _model, _messages: ChatMessage[], options) => {
        const toolNames = options?.tools?.map((tool: { name: string }) => tool.name) ?? [];
        expect(toolNames).toEqual(expect.arrayContaining([
          "list_assets",
          "view_asset"
        ]));
        expect(readDocumentImage).not.toHaveBeenCalled();
        options?.onToolCallDelta?.({
          id: "call_view_asset",
          index: 0,
          nameDelta: "view_asset"
        });
        options?.onToolCallDelta?.({
          argumentsDelta: JSON.stringify({
            src: "assets/arch.png"
          }),
          index: 0
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
        const toolResult = messages.at(-1);
        expect(toolResult?.content).toContain("Tool result from view_asset:");
        expect(toolResult?.images).toEqual([
          {
            dataUrl: "data:image/png;base64,aGVsbG8=",
            mimeType: "image/png"
          }
        ]);

        return {
          content: "The screenshot shows an architecture diagram.",
          finishReason: "stop"
        };
      });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Note\n\n![Architecture screenshot](assets/arch.png)",
      documentPath: "/vault/note.md",
      model: "gpt-5.5",
      prompt: "What is shown in this screenshot?",
      provider: provider({
        models: [{ capabilities: ["text", "vision", "tools"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }]
      }),
      readDocumentImage,
      workspaceFiles: []
    });

    expect(readDocumentImage).toHaveBeenCalledWith("assets/arch.png");
    expect(result.content).toBe("The screenshot shows an architecture diagram.");
  });

  it("uses document image tools for Qwen vision models", async () => {
    const readDocumentImage = vi.fn();
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, _messages: ChatMessage[], options) => {
      const toolNames = options?.tools?.map((tool: { name: string }) => tool.name) ?? [];
      expect(toolNames).toEqual(expect.arrayContaining([
        "list_assets",
        "view_asset"
      ]));

      return {
        content: "I can inspect document images with tools.",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Note\n\n![Architecture screenshot](assets/arch.png)",
      documentPath: "/vault/note.md",
      model: "qwen3.6-plus",
      prompt: "What is shown in this screenshot?",
      provider: provider({
        id: "aliyun-bailian",
        models: [{ capabilities: ["text", "vision", "tools"], enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
        name: "Qwen",
        type: "openai-compatible"
      }),
      readDocumentImage,
      workspaceFiles: []
    });

    expect(readDocumentImage).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.content).toBe("I can inspect document images with tools.");
  });

  it("replays Qwen Responses tool turns with provider call ids and structured tool results", async () => {
    let replayMessages: ChatMessage[] = [];
    const complete = vi.fn()
      .mockImplementationOnce(async (_provider, _model, _messages: ChatMessage[], options) => {
        options?.onToolCallDelta?.({
          id: "call_read_document",
          index: 0,
          nameDelta: "read_document"
        });
        options?.onToolCallDelta?.({
          argumentsDelta: JSON.stringify({ targetKind: "document" }),
          id: "call_read_document",
          index: 0
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
        replayMessages = messages;

        return {
          content: "I have the document content now.",
          finishReason: "stop"
        };
      });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Draft",
      documentPath: "/vault/README.md",
      model: "qwen3.6-plus",
      prompt: "Read the current document, then summarize it.",
      provider: provider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        id: "aliyun-bailian",
        models: [{ capabilities: ["text", "tools", "web"], enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
        name: "Qwen",
        type: "openai-compatible"
      }),
      webSearchEnabled: true,
      workspaceFiles: []
    });

    expect(complete).toHaveBeenCalledTimes(2);
    expect(replayMessages.at(-2)).toMatchObject({
      content: "",
      role: "assistant",
      toolCalls: [
        {
          arguments: {
            targetKind: "document"
          },
          id: "call_read_document|tool-call-1",
          name: "read_document"
        }
      ]
    });
    expect(replayMessages.at(-1)).toMatchObject({
      content: expect.stringContaining("Tool result from read_document:"),
      role: "user",
      toolResult: {
        outputText: expect.stringContaining("# Draft"),
        toolCallId: "call_read_document|tool-call-1",
        toolName: "read_document"
      }
    });
    expect(result.content).toBe("I have the document content now.");
  });

  it("attaches referenced document images in chat-only mode when a vision model needs them", async () => {
    const readDocumentImage = vi.fn(async (src: string) => ({
      alt: "Architecture screenshot",
      dataUrl: "data:image/png;base64,aGVsbG8=",
      mimeType: "image/png",
      path: `/vault/${src}`,
      src
    }));
    const complete = vi.fn()
      .mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
        expect(messages.at(-1)?.content).toContain("What is shown in this screenshot?");
        expect(messages.at(-1)?.images).toBeUndefined();

        return {
          content: "YES",
          finishReason: "stop"
        };
      })
      .mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
        const request = messages.at(-1);
        expect(request?.content).toBe("User request:\nWhat is shown in this screenshot?");
        expect(request?.images).toEqual([
          {
            dataUrl: "data:image/png;base64,aGVsbG8=",
            mimeType: "image/png"
          }
        ]);

        return {
          content: "The screenshot shows an architecture diagram.",
          finishReason: "stop"
        };
      });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Note\n\n![Architecture screenshot](assets/arch.png)",
      documentPath: "/vault/note.md",
      model: "gpt-5.5",
      prompt: "What is shown in this screenshot?",
      provider: provider({
        models: [{ capabilities: ["text", "vision"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
        type: "openai-compatible"
      }),
      readDocumentImage,
      workspaceFiles: []
    });

    expect(complete).toHaveBeenCalledTimes(2);
    expect(readDocumentImage).toHaveBeenCalledWith("assets/arch.png");
    expect(result.content).toBe("The screenshot shows an architecture diagram.");
  });

  it("uses the model to classify image requests before attaching images", async () => {
    const readDocumentImage = vi.fn(async (src: string) => ({
      alt: "Architecture screenshot",
      dataUrl: "data:image/png;base64,aGVsbG8=",
      mimeType: "image/png",
      path: `/vault/${src}`,
      src
    }));
    const complete = vi.fn()
      .mockResolvedValueOnce({
        content: "YES",
        finishReason: "stop"
      })
      .mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
        const request = messages.at(-1);
        expect(request?.content).toBe("User request:\nWhat does this capture show?");
        expect(request?.images).toEqual([
          {
            dataUrl: "data:image/png;base64,aGVsbG8=",
            mimeType: "image/png"
          }
        ]);

        return {
          content: "The capture shows an architecture diagram.",
          finishReason: "stop"
        };
      });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Note\n\n![Architecture screenshot](assets/arch.png)",
      documentPath: "/vault/note.md",
      model: "gpt-5.5",
      prompt: "What does this capture show?",
      provider: provider({
        models: [{ capabilities: ["text", "vision"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
        type: "openai-compatible"
      }),
      readDocumentImage,
      workspaceFiles: []
    });

    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0]?.[2].at(-1)?.content).toContain("What does this capture show?");
    expect(readDocumentImage).toHaveBeenCalledWith("assets/arch.png");
    expect(result.content).toBe("The capture shows an architecture diagram.");
  });

  it("does not read document images for non-visual turns", async () => {
    const readDocumentImage = vi.fn();
    const complete = vi.fn().mockResolvedValue({
      content: "This document contains one image reference.",
      finishReason: "stop"
    });

    await runDocumentAiAgent({
      complete,
      documentContent: "# Note\n\n![Architecture screenshot](assets/arch.png)",
      documentPath: "/vault/note.md",
      model: "gpt-5.5",
      prompt: "Summarize this document.",
      provider: provider({
        models: [{ capabilities: ["text", "vision"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }]
      }),
      readDocumentImage,
      workspaceFiles: []
    });

    expect(readDocumentImage).not.toHaveBeenCalled();
  });

  it("passes tool-calling history as transcript messages instead of embedding it in the current prompt", async () => {
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
      expect(messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user", "user"]);
      expect(messages[1]?.content).toBe("Earlier synthetic request");
      expect(messages[2]?.content).toContain("Earlier synthetic answer");
      expect(messages[3]?.content).toContain("Document runtime context:");
      expect(messages[4]?.content).toBe("User request:\nCurrent synthetic request");
      expect(messages[4]?.content).not.toContain("Conversation so far:");

      return {
        content: "Current synthetic answer",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Section Alpha",
      documentPath: "/vault/example.md",
      history: [
        { role: "user", text: "Earlier synthetic request" },
        { role: "assistant", text: "Earlier synthetic answer" }
      ],
      model: "gpt-5.5",
      prompt: "Current synthetic request",
      provider: provider(),
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "Current synthetic answer",
      finishReason: "stop",
      preparedPreview: false
    });
  });

  it("includes prepared editor preview summaries in tool-calling transcript history", async () => {
    const history: DocumentAiHistoryMessage[] = [
      {
        preview: {
          from: 10,
          original: "old-token",
          replacement: "new-token",
          target: {
            from: 10,
            id: "table:0",
            kind: "table",
            title: "Cost impact",
            to: 19
          },
          to: 19,
          type: "replace"
        },
        role: "assistant",
        text: "The editor change is ready."
      }
    ];

    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
      expect(messages.map((message) => message.role)).toEqual(["system", "assistant", "user", "user"]);
      expect(messages[1]?.content).toContain("Prepared editor preview");
      expect(messages[1]?.content).toContain("Target: table: Cost impact (10-19)");
      expect(messages[1]?.content).toContain("old-token");
      expect(messages[1]?.content).toContain("new-token");
      expect(messages[2]?.content).toContain("Document runtime context:");
      expect(messages[3]?.content).toBe("User request:\nFollow-up synthetic request");

      return {
        content: "Follow-up synthetic answer",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Section Alpha",
      documentPath: "/vault/example.md",
      history,
      model: "gpt-5.5",
      prompt: "Follow-up synthetic request",
      provider: provider(),
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "Follow-up synthetic answer",
      finishReason: "stop",
      preparedPreview: false
    });
  });

  it("keeps tool-calling runtime context separate from the current user request", async () => {
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
      expect(messages.map((message) => message.role)).toEqual(["system", "user", "user"]);
      expect(messages[1]?.content).toContain("Document runtime context:");
      expect(messages[1]?.content).toContain("Current selection snapshot:");
      expect(messages[1]?.content).toContain("Range: 2-13");
      expect(messages[1]?.content).toContain("Synthetic text");
      expect(messages[1]?.content).toContain("Use web_search for live web information.");
      expect(messages[2]?.content).toBe("User request:\nRewrite the selected synthetic text");
      expect(messages[2]?.content).not.toContain("Current selection snapshot:");
      expect(messages[2]?.content).not.toContain("Use web_search for live web information.");

      return {
        content: "Synthetic response",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Section Alpha",
      documentPath: "/vault/example.md",
      model: "gpt-5.5",
      prompt: "Rewrite the selected synthetic text",
      provider: provider(),
      selection: {
        from: 2,
        source: "selection",
        text: "Synthetic text",
        to: 13
      },
      webSearchEnabled: true,
      webSearchSettings: {
        contentMaxChars: 12000,
        enabled: true,
        maxResults: 5,
        providerId: "local-bing",
        searxngApiHost: ""
      },
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "Synthetic response",
      finishReason: "stop",
      preparedPreview: false
    });
  });

  it("includes selected heading Markdown source in the runtime context", async () => {
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
      expect(messages[1]?.content).toContain("Markdown source range: 0-10");
      expect(messages[1]?.content).toContain("```markdown\n# LoginAWS\n```");

      return {
        content: "You selected a level-one heading.",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# LoginAWS\n\nBody",
      documentEndPosition: 16,
      documentPath: "/vault/AWS.md",
      headingAnchors: [{ from: 0, level: 1, title: "LoginAWS", to: 10 }],
      model: "gpt-5.5",
      prompt: "Which heading level did I select?",
      provider: provider(),
      sectionAnchors: [{
        description: "Section LoginAWS",
        from: 0,
        id: "section:0",
        kind: "section",
        title: "LoginAWS",
        to: 16
      }],
      selection: {
        cursor: 10,
        from: 2,
        source: "selection",
        text: "LoginAWS",
        to: 10
      },
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "You selected a level-one heading.",
      finishReason: "stop",
      preparedPreview: false
    });
  });

  it("includes containing section Markdown source when the selection is not a heading", async () => {
    const documentContent = ["# LoginAWS", "", "Body paragraph", "", "## Pull img"].join("\n");
    const bodyStart = documentContent.indexOf("Body paragraph");
    const nextHeadingStart = documentContent.indexOf("## Pull img");
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
      expect(messages[1]?.content).toContain(`Markdown source range: 0-${nextHeadingStart}`);
      expect(messages[1]?.content).toContain("# LoginAWS");
      expect(messages[1]?.content).toContain("Body paragraph");

      return {
        content: "This selection belongs to the LoginAWS section.",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/AWS.md",
      headingAnchors: [
        { from: 0, level: 1, title: "LoginAWS", to: "# LoginAWS".length },
        {
          from: nextHeadingStart,
          level: 2,
          title: "Pull img",
          to: nextHeadingStart + "## Pull img".length
        }
      ],
      model: "gpt-5.5",
      prompt: "Which section did I select?",
      provider: provider(),
      sectionAnchors: [{
        description: "Section LoginAWS",
        from: 0,
        id: "section:0",
        kind: "section",
        title: "LoginAWS",
        to: nextHeadingStart
      }],
      selection: {
        cursor: bodyStart + "Body paragraph".length,
        from: bodyStart,
        source: "selection",
        text: "Body paragraph",
        to: bodyStart + "Body paragraph".length
      },
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "This selection belongs to the LoginAWS section.",
      finishReason: "stop",
      preparedPreview: false
    });
  });

  it("registers the Cherry-style web search tool for tool-calling agents when enabled and configured", async () => {
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
      expect(messages[0]?.content).toContain("web_search");

      return {
        content: "I can search the web with the configured tool.",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Section Alpha",
      documentPath: "/vault/example.md",
      model: "writer-tools",
      prompt: "Search the current release notes",
      provider: provider({
        baseUrl: "https://proxy.example.test/v1",
        models: [{ capabilities: ["text", "tools"], enabled: true, id: "writer-tools", name: "Writer Tools" }],
        type: "openai-compatible"
      }),
      webSearchEnabled: true,
      webSearchSettings: {
        contentMaxChars: 12000,
        enabled: true,
        maxResults: 5,
        providerId: "local-bing",
        searxngApiHost: ""
      },
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "I can search the web with the configured tool.",
      finishReason: "stop",
      preparedPreview: false
    });
  });

  it("uses native web search instead of the Cherry-style web search tool when the provider supports it", async () => {
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, messages: ChatMessage[], options) => {
      const toolNames = options?.tools?.map((tool: { name: string }) => tool.name) ?? [];

      expect(messages[0]?.content).not.toContain("web_search");
      expect(messages[1]?.content).toContain("Native web search is enabled for this request.");
      expect(messages[1]?.content).not.toContain("If live browsing is unavailable");
      expect(toolNames).not.toContain("web_search");
      expect(options?.webSearchEnabled).toBe(true);

      return {
        content: "I can use native web search.",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Section Alpha",
      documentPath: "/vault/example.md",
      model: "qwen3.6-plus",
      prompt: "Search the current release notes",
      provider: provider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        id: "aliyun-bailian",
        models: [{ capabilities: ["text", "reasoning", "tools", "web"], enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
        name: "Qwen",
        type: "openai-compatible"
      }),
      webSearchEnabled: true,
      webSearchSettings: {
        contentMaxChars: 12000,
        enabled: true,
        maxResults: 5,
        providerId: "local-bing",
        searxngApiHost: ""
      },
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "I can use native web search.",
      finishReason: "stop",
      preparedPreview: false
    });
  });

  it.each([
    {
      model: "qwen3.6-plus",
      provider: provider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        id: "aliyun-bailian",
        models: [{ capabilities: ["text", "reasoning", "tools", "web"], enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
        name: "Qwen",
        type: "openai-compatible"
      }),
      toolName: "google_search"
    },
    {
      model: "qwen3.6-plus",
      provider: provider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        id: "aliyun-bailian",
        models: [{ capabilities: ["text", "reasoning", "tools", "web"], enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
        name: "Qwen",
        type: "openai-compatible"
      }),
      toolName: "browse_page"
    },
    {
      model: "gpt-5.5",
      provider: provider({
        models: [{ capabilities: ["text", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" }],
        type: "openai"
      }),
      toolName: "web_search"
    },
    {
      model: "claude-opus-4-7",
      provider: provider({
        baseUrl: "https://api.anthropic.com/v1",
        id: "anthropic",
        models: [{ capabilities: ["text", "reasoning", "tools", "web"], enabled: true, id: "claude-opus-4-7", name: "Claude Opus 4.7" }],
        name: "Anthropic",
        type: "anthropic"
      }),
      toolName: "web_search"
    },
    {
      model: "sonar-pro",
      provider: provider({
        baseUrl: "https://api.perplexity.ai",
        id: "perplexity",
        models: [{ capabilities: ["text", "tools", "web"], enabled: true, id: "sonar-pro", name: "Sonar Pro" }],
        name: "Perplexity",
        type: "openai-compatible"
      }),
      toolName: "web_search_preview"
    },
    {
      model: "qwen3.6-plus",
      provider: provider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        id: "aliyun-bailian",
        models: [{ capabilities: ["text", "reasoning", "tools", "web"], enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
        name: "Qwen",
        type: "openai-compatible"
      }),
      toolName: "synthetic_provider_search_action"
    }
  ])("does not execute provider-native $toolName calls as local agent tools", async ({ model, provider, toolName }) => {
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, _messages: ChatMessage[], options) => {
      options?.onToolCallDelta?.({
        id: "native_google_search",
        index: 0,
        nameDelta: toolName
      });
      options?.onToolCallDelta?.({
        argumentsDelta: JSON.stringify({ query: "https://research.example.test/" }),
        index: 0
      });
      options?.onDelta?.("Grounded answer");

      return {
        content: "Grounded answer",
        finishReason: "stop"
      };
    });
    const events: string[] = [];

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Section Alpha",
      documentPath: "/vault/example.md",
      model,
      onEvent: (event) => {
        events.push(event.type);
      },
      prompt: "Research this synthetic site: https://research.example.test/",
      provider,
      webSearchEnabled: true,
      webSearchSettings: {
        contentMaxChars: 12000,
        enabled: true,
        maxResults: 5,
        providerId: "local-bing",
        searxngApiHost: ""
      },
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "Grounded answer",
      finishReason: "stop",
      preparedPreview: false
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(events).not.toContain("tool_start");
  });

  it("guides the tool-calling agent to use table-specific replacement for table edits", async () => {
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
      expect(messages[0]?.content).toContain("Apply the narrowest reliable edit");
      expect(messages[0]?.content).toContain("Use table-level edits for Markdown tables");
      expect(messages[0]?.content).toContain("Use move tools for reordering or moving content");

      return {
        content: "I will use the table-specific edit path.",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Section Alpha",
      documentPath: "/vault/example.md",
      model: "gpt-5.5",
      prompt: "Update the synthetic table",
      provider: provider(),
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "I will use the table-specific edit path.",
      finishReason: "stop",
      preparedPreview: false
    });
  });

  it("keeps chat-only context and read-only tool output separate from the current user request", async () => {
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, messages: ChatMessage[]) => {
      expect(messages.map((message) => message.role)).toEqual(["system", "user", "user", "user"]);
      expect(messages[1]?.content).toContain("Document runtime context:");
      expect(messages[1]?.content).toContain("Current cursor snapshot:");
      expect(messages[2]?.content).toContain("Read-only workspace context:");
      expect(messages[2]?.content).toContain("Tool: current_document");
      expect(messages[3]?.content).toBe("User request:\nAnswer with synthetic context");
      expect(messages[3]?.content).not.toContain("Read-only workspace context:");

      return {
        content: "Chat-only synthetic response",
        finishReason: "stop"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Section Alpha",
      documentPath: "/vault/example.md",
      model: "local-synthetic-model",
      prompt: "Answer with synthetic context",
      provider: provider({
        id: "ollama",
        type: "ollama"
      }),
      selection: {
        cursor: 4,
        from: 4,
        source: "block",
        text: "",
        to: 4
      },
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "Chat-only synthetic response",
      finishReason: "stop"
    });
  });

  it("executes a replace-region tool call and stops for editor confirmation", async () => {
    const onPreviewResult = vi.fn();
    const complete = vi
      .fn()
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onToolCallDelta?.({
          id: "call_replace_content",
          index: 0,
          nameDelta: "replace_content"
        });
        options?.onToolCallDelta?.({
          argumentsDelta: "{\"replacement\":\"Polished draft\"}",
          index: 0
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onDelta?.("I prepared a polished replacement for the current selection.");

        return {
          content: "I prepared a polished replacement for the current selection.",
          finishReason: "stop"
        };
      });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Draft",
      documentPath: "/vault/README.md",
      model: "gpt-5.5",
      onPreviewResult,
      prompt: "Polish this selection",
      provider: provider(),
      selection: {
        from: 3,
        source: "selection",
        text: "Draft",
        to: 8
      },
      workspaceFiles: []
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 3,
      original: "Draft",
      replacement: "Polished draft",
      to: 8,
      type: "replace"
    }, expect.any(String));
    expect(result).toEqual({
      content: "",
      finishReason: "toolUse",
      preparedPreview: true
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("allows multiple write previews in the same assistant turn", async () => {
    const onPreviewResult = vi.fn();
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, _messages, options) => {
      options?.onToolCallDelta?.({
        id: "call_insert_content_intro",
        index: 0,
        nameDelta: "insert_content"
      });
      options?.onToolCallDelta?.({
        argumentsDelta: JSON.stringify({
          anchorId: "document-end",
          content: "## Synthetic intro",
          placement: "before_anchor"
        }),
        index: 0
      });
      options?.onToolCallDelta?.({
        id: "call_insert_content_summary",
        index: 1,
        nameDelta: "insert_content"
      });
      options?.onToolCallDelta?.({
        argumentsDelta: JSON.stringify({
          anchorId: "document-end",
          content: "## Synthetic summary",
          placement: "before_anchor"
        }),
        index: 1
      });

      return {
        content: "",
        finishReason: "toolUse"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Old note\n\nBody",
      documentEndPosition: 16,
      documentPath: "/vault/README.md",
      model: "qwen3.6-plus",
      onPreviewResult,
      prompt: "Add an intro and a summary",
      provider: provider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        id: "aliyun-bailian",
        models: [{ capabilities: ["text", "tools"], enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
        name: "Qwen",
        type: "openai-compatible"
      }),
      workspaceFiles: []
    });

    expect(onPreviewResult).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      content: "",
      finishReason: "toolUse",
      preparedPreview: true
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("collapses duplicate insert_content retries with identical content in the same assistant turn", async () => {
    const onPreviewResult = vi.fn();
    const complete = vi.fn().mockImplementationOnce(async (_provider, _model, _messages, options) => {
      options?.onToolCallDelta?.({
        id: "call_insert_content_first",
        index: 0,
        nameDelta: "insert_content"
      });
      options?.onToolCallDelta?.({
        argumentsDelta: JSON.stringify({
          anchorId: "document-end",
          content: "## Synthetic summary\n\nSame generated report.",
          placement: "before_anchor"
        }),
        index: 0
      });
      options?.onToolCallDelta?.({
        id: "call_insert_content_second",
        index: 1,
        nameDelta: "insert_content"
      });
      options?.onToolCallDelta?.({
        argumentsDelta: JSON.stringify({
          anchorId: "heading:0",
          content: "## Synthetic summary\n\nSame generated report.",
          placement: "after_anchor"
        }),
        index: 1
      });

      return {
        content: "",
        finishReason: "toolUse"
      };
    });

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Old note\n\nBody",
      documentEndPosition: 16,
      documentPath: "/vault/README.md",
      model: "qwen3.6-plus",
      onPreviewResult,
      prompt: "Insert the synthetic summary",
      provider: provider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        id: "aliyun-bailian",
        models: [{ capabilities: ["text", "tools"], enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" }],
        name: "Qwen",
        type: "openai-compatible"
      }),
      workspaceFiles: []
    });

    expect(onPreviewResult).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      content: "",
      finishReason: "toolUse",
      preparedPreview: true
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("lets the agent choose where to insert markdown around the current context", async () => {
    const onPreviewResult = vi.fn();
    const complete = vi
      .fn()
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onToolCallDelta?.({
          id: "call_insert_content",
          index: 0,
          nameDelta: "insert_content"
        });
        options?.onToolCallDelta?.({
          argumentsDelta: JSON.stringify({
            content: "## Follow-up\n\nMore detail.",
            placement: "after_selection"
          }),
          index: 0
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async () => ({
        content: "I prepared the follow-up after the current block.",
        finishReason: "stop"
      }));

    await runDocumentAiAgent({
      complete,
      documentContent: "# Draft\n\nBody",
      documentPath: "/vault/README.md",
      model: "gpt-5.5",
      onPreviewResult,
      prompt: "Add a follow-up section after this block",
      provider: provider(),
      selection: {
        cursor: 3,
        from: 3,
        source: "block",
        text: "Draft",
        to: 8
      },
      workspaceFiles: []
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 8,
      original: "",
      replacement: "## Follow-up\n\nMore detail.",
      to: 8,
      type: "insert"
    }, expect.any(String));
  });

  it("stops after preparing an editor write preview", async () => {
    const onPreviewResult = vi.fn();
    const complete = vi
      .fn()
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onToolCallDelta?.({
          id: "call_insert_content",
          index: 0,
          nameDelta: "insert_content"
        });
        options?.onToolCallDelta?.({
          argumentsDelta: JSON.stringify({
            anchorId: "document-end",
            content: "# Synthetic comparison title",
            placement: "before_anchor"
          }),
          index: 0
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async () => ({
        content: "This follow-up should not be requested.",
        finishReason: "stop"
      }));

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "",
      documentPath: "/vault/example.md",
      model: "gpt-5.5",
      onPreviewResult,
      prompt: "Write a comparison",
      provider: provider(),
      workspaceFiles: []
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 0,
      original: "",
      replacement: "# Synthetic comparison title",
      to: 0,
      type: "insert"
    }, expect.any(String));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      content: "",
      finishReason: "toolUse",
      preparedPreview: true
    });
  });

  it("uses the last assistant narration when the final agent message has no text", async () => {
    const complete = vi
      .fn()
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onDelta?.("I inspected the document and found it is empty.");
        options?.onToolCallDelta?.({
          id: "call_read_document",
          index: 0,
          nameDelta: "read_document"
        });

        return {
          content: "I inspected the document and found it is empty.",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async () => ({
        content: "",
        finishReason: "stop"
      }));

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "",
      documentPath: "/vault/cf.md",
      model: "gpt-5.5",
      prompt: "What is in this document?",
      provider: provider(),
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "I inspected the document and found it is empty.",
      finishReason: "stop",
      preparedPreview: false
    });
  });

  it("assigns unique local tool ids when the provider reuses tool ids across turns", async () => {
    const toolExecutionIds: string[] = [];
    const complete = vi
      .fn()
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onToolCallDelta?.({
          id: "provider-tool-1",
          index: 0,
          nameDelta: "read_document"
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onToolCallDelta?.({
          id: "provider-tool-1",
          index: 0,
          nameDelta: "read_document"
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async () => ({
        content: "Done.",
        finishReason: "stop"
      }));

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "",
      documentPath: "/vault/empty.md",
      model: "gpt-5.5",
      onEvent: (event) => {
        if (event.type === "tool_execution_start") toolExecutionIds.push(event.toolCallId);
      },
      prompt: "Insert something into the document.",
      provider: provider(),
      workspaceFiles: []
    });

    expect(result).toEqual({
      content: "Done.",
      finishReason: "stop",
      preparedPreview: false
    });
    expect(toolExecutionIds).toHaveLength(2);
    expect(new Set(toolExecutionIds).size).toBe(2);
    expect(toolExecutionIds[0]).not.toBe("provider-tool-1");
    expect(toolExecutionIds[1]).not.toBe("provider-tool-1");
  });

  it("executes a delete-region tool call and stops for editor confirmation", async () => {
    const onPreviewResult = vi.fn();
    const complete = vi
      .fn()
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onToolCallDelta?.({
          id: "call_delete_content",
          index: 0,
          nameDelta: "delete_content"
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async () => ({
        content: "I prepared a deletion preview for the selected title.",
        finishReason: "stop"
      }));

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Draft\n\nBody",
      documentPath: "/vault/README.md",
      model: "gpt-5.5",
      onPreviewResult,
      prompt: "Delete this heading",
      provider: provider(),
      selection: {
        from: 0,
        source: "selection",
        text: "# Draft",
        to: 7
      },
      workspaceFiles: []
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 0,
      original: "# Draft",
      replacement: "",
      to: 7,
      type: "replace"
    }, expect.any(String));
    expect(result).toEqual({
      content: "",
      finishReason: "toolUse",
      preparedPreview: true
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("executes a full-document replacement tool call and stops for editor confirmation", async () => {
    const onPreviewResult = vi.fn();
    const documentContent = "# Old title\n\nOld comparison";
    const complete = vi
      .fn()
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onToolCallDelta?.({
          id: "call_replace_content",
          index: 0,
          nameDelta: "replace_content"
        });
        options?.onToolCallDelta?.({
          argumentsDelta: JSON.stringify({
            targetKind: "document",
            replacement: "# Synthetic focus note\n\nFocused comparison."
          }),
          index: 0
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async () => ({
        content: "This follow-up should not be requested.",
        finishReason: "stop"
      }));

    const result = await runDocumentAiAgent({
      complete,
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      model: "gpt-5.5",
      onPreviewResult,
      prompt: "Only keep the synthetic focus note and a comparison",
      provider: provider(),
      workspaceFiles: []
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 0,
      original: documentContent,
      replacement: "# Synthetic focus note\n\nFocused comparison.",
      to: documentContent.length,
      type: "replace"
    }, expect.any(String));
    expect(result).toEqual({
      content: "",
      finishReason: "toolUse",
      preparedPreview: true
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("executes a table replacement tool call and stops for editor confirmation", async () => {
    const onPreviewResult = vi.fn();
    const table = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (old-token) |"
    ].join("\n");
    const replacement = [
      "| Field | Variant One | Variant Two |",
      "| ----- | ----------- | ----------- |",
      "| Sync note | None | Needs source token (new-token) |"
    ].join("\n");
    const documentContent = ["### Section Alpha", "", table, "", "### Section Beta"].join("\n");
    const tableStart = documentContent.indexOf(table);
    const complete = vi
      .fn()
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onToolCallDelta?.({
          id: "call_replace_content",
          index: 0,
          nameDelta: "replace_content"
        });
        options?.onToolCallDelta?.({
          argumentsDelta: JSON.stringify({
            anchorId: "table:0",
            replacement
          }),
          index: 0
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async () => ({
        content: "This follow-up should not be requested.",
        finishReason: "stop"
      }));

    const result = await runDocumentAiAgent({
      complete,
      documentContent,
      documentEndPosition: documentContent.length,
      documentPath: "/vault/example.md",
      headingAnchors: [
        { from: 0, level: 3, title: "Section Alpha", to: "### Section Alpha".length },
        { from: documentContent.indexOf("### Section Beta"), level: 3, title: "Section Beta", to: documentContent.length }
      ],
      model: "gpt-5.5",
      onPreviewResult,
      prompt: "Update only the synthetic table",
      provider: provider(),
      workspaceFiles: []
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: tableStart,
      original: table,
      replacement,
      target: {
        from: tableStart,
        id: "table:0",
        kind: "table",
        title: "Section Alpha table",
        to: tableStart + table.length
      },
      to: tableStart + table.length,
      type: "replace"
    }, expect.any(String));
    expect(result).toEqual({
      content: "",
      finishReason: "toolUse",
      preparedPreview: true
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("uses a section-level delete tool when the user asks to remove a whole section", async () => {
    const onPreviewResult = vi.fn();
    const complete = vi
      .fn()
      .mockImplementationOnce(async (_provider, _model, _messages, options) => {
        options?.onToolCallDelta?.({
          id: "call_delete_content",
          index: 0,
          nameDelta: "delete_content"
        });
        options?.onToolCallDelta?.({
          argumentsDelta: JSON.stringify({
            anchorId: "section:2"
          }),
          index: 0
        });

        return {
          content: "",
          finishReason: "toolUse"
        };
      })
      .mockImplementationOnce(async () => ({
        content: "I prepared a deletion preview for the whole section.",
        finishReason: "stop"
      }));

    const result = await runDocumentAiAgent({
      complete,
      documentContent: "# Intro\n\n## 10. Current\n\nBody\n\n## 11. Follow-ups\n\nMore body",
      documentEndPosition: 61,
      documentPath: "/vault/README.md",
      headingAnchors: [
        { from: 0, level: 1, title: "Intro", to: 8 },
        { from: 9, level: 2, title: "10. Current", to: 23 },
        { from: 30, level: 2, title: "11. Follow-ups", to: 46 }
      ],
      model: "gpt-5.5",
      onPreviewResult,
      prompt: "Delete section 11",
      provider: provider(),
      selection: {
        cursor: 55,
        from: 49,
        source: "block",
        text: "More body",
        to: 58
      },
      workspaceFiles: []
    });

    expect(onPreviewResult).toHaveBeenCalledWith(expect.objectContaining({
      from: 30,
      replacement: "",
      to: 61,
      type: "replace"
    }), expect.any(String));
    expect(result).toEqual({
      content: "",
      finishReason: "toolUse",
      preparedPreview: true
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
