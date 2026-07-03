import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests, type AppAcpAgentMessageEvent } from "../runtime";
import { parseAcpAgentArgs, resolveAcpAgentCwd, runAcpDocumentAgent, runAcpInlineAiAgent } from "./acp-agent";

describe("ACP agent helpers", () => {
  afterEach(() => {
    resetAppRuntimeForTests();
  });

  it("parses ACP command arguments with quoted values", () => {
    expect(parseAcpAgentArgs("--mode acp --label \"local agent\" '--dry run'")).toEqual([
      "--mode",
      "acp",
      "--label",
      "local agent",
      "--dry run"
    ]);
  });

  it("uses the workspace root as the default ACP working directory", () => {
    expect(resolveAcpAgentCwd(
      {
        args: "",
        command: "synthetic-agent",
        cwd: "",
        enabled: true
      },
      "/mock-workspace/notes/current.md",
      "/mock-workspace"
    )).toBe("/mock-workspace");
  });

  it("uses the document parent when the workspace key is the current document path", () => {
    expect(resolveAcpAgentCwd(
      {
        args: "",
        command: "synthetic-agent",
        cwd: "",
        enabled: true
      },
      "/mock-workspace/notes/current.md",
      "/mock-workspace/notes/current.md"
    )).toBe("/mock-workspace/notes");
  });

  it("rejects with ACP stderr when the agent exits before responding", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async () => {
          handleAgentMessage?.({
            connectionId: "acp-1",
            message: "synthetic adapter failed",
            type: "stderr"
          });
          handleAgentMessage?.({
            connectionId: "acp-1",
            message: "exit code 1",
            type: "exit"
          });
        })
      }
    });

    const run = runAcpDocumentAgent({
      documentContent: "# Test",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onTextDelta: vi.fn(),
      prompt: "Hello",
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    await expect(Promise.race([
      run,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timed out waiting for ACP failure.")), 50);
      })
    ])).rejects.toThrow("synthetic adapter failed");
  });

  it("turns ACP current-document writes into Markra editor previews", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();
    const onPreviewResult = vi.fn();

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async (_connectionId, message) => {
          if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({
                id: 91,
                jsonrpc: "2.0",
                method: "fs/write_text_file",
                params: {
                  content: "# Updated\n\nBody",
                  path: "/mock-workspace/current.md",
                  sessionId: "session-1"
                }
              }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "id" in message && message.id === 91 && "result" in message) {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: 3, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
              type: "message"
            });
          }
        })
      }
    });

    const result = await runAcpDocumentAgent({
      documentContent: "# Draft",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onPreviewResult,
      onTextDelta: vi.fn(),
      prompt: "Update this note",
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    expect(onPreviewResult).toHaveBeenCalledWith({
      from: 0,
      original: "# Draft",
      replacement: "# Updated\n\nBody",
      target: {
        kind: "document",
        title: "current.md"
      },
      to: 7,
      type: "replace"
    }, "acp-write:/mock-workspace/current.md:1");
    expect(result).toEqual({
      content: "",
      finishReason: "stop",
      preparedPreview: true,
      stopReasonCode: undefined
    });
  });

  it("keeps ACP text responses as chat content when no filesystem write occurs", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();
    const onPreviewResult = vi.fn();
    const onTextDelta = vi.fn();
    const suggestedResponse = [
      "```markdown",
      "Markra 是一个本地优先、开源的 Markdown 编辑器。",
      "```"
    ].join("\n");

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async (_connectionId, message) => {
          if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({
                jsonrpc: "2.0",
                method: "session/update",
                params: {
                  sessionId: "session-1",
                  update: {
                    content: {
                      text: suggestedResponse,
                      type: "text"
                    },
                    sessionUpdate: "agent_message_chunk"
                  }
                }
              }),
              type: "message"
            });
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
              type: "message"
            });
          }
        })
      }
    });

    const result = await runAcpDocumentAgent({
      documentContent: "# Draft\n\nMarkra 是一个 Markdown 编辑器。",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onPreviewResult,
      onTextDelta,
      prompt: "优化一下这段话",
      selection: {
        cursor: 29,
        from: 9,
        source: "selection",
        text: "Markra 是一个 Markdown 编辑器。",
        to: 29
      },
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    expect(onTextDelta).toHaveBeenCalledWith(suggestedResponse);
    expect(onPreviewResult).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: suggestedResponse,
      finishReason: "stop",
      preparedPreview: false,
      stopReasonCode: undefined
    });
  });

  it("does not use replacement cue text to infer ACP editor previews", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();
    const onPreviewResult = vi.fn();
    const suggestedResponse = [
      "建议替换为：",
      "",
      "```markdown",
      "Markra 是一个本地优先、开源的 Markdown 编辑器。",
      "```",
      "",
      "这只是普通说明，不是 Markra 编辑预览输出。"
    ].join("\n");

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async (_connectionId, message) => {
          if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({
                jsonrpc: "2.0",
                method: "session/update",
                params: {
                  sessionId: "session-1",
                  update: {
                    content: {
                      text: suggestedResponse,
                      type: "text"
                    },
                    sessionUpdate: "agent_message_chunk"
                  }
                }
              }),
              type: "message"
            });
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
              type: "message"
            });
          }
        })
      }
    });

    const result = await runAcpDocumentAgent({
      documentContent: "# Draft\n\nMarkra 是一个 Markdown 编辑器。",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onPreviewResult,
      onTextDelta: vi.fn(),
      prompt: "优化一下这段话",
      selection: {
        cursor: 29,
        from: 9,
        source: "selection",
        text: "Markra 是一个 Markdown 编辑器。",
        to: 29
      },
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    expect(onPreviewResult).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: suggestedResponse,
      finishReason: "stop",
      preparedPreview: false,
      stopReasonCode: undefined
    });
  });

  it("includes current editor selection context in ACP document prompts", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();
    let promptBlocks: unknown = null;

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async (_connectionId, message) => {
          if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
            const params = "params" in message && message.params && typeof message.params === "object"
              ? message.params as { prompt?: unknown }
              : {};
            promptBlocks = params.prompt ?? null;
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
              type: "message"
            });
          }
        })
      }
    });

    await runAcpDocumentAgent({
      documentContent: "# Draft\n\nOriginal draft",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onTextDelta: vi.fn(),
      prompt: "Polish this selection",
      selection: {
        cursor: 23,
        from: 9,
        source: "selection",
        text: "Original draft",
        to: 23
      },
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    expect(promptBlocks).toEqual(expect.any(Array));
    const textBlocks = promptBlocks as Array<{ text?: string; type?: string }>;
    const previewPolicyBlock = textBlocks.find((block) =>
      block.type === "text" && block.text?.includes("Markra edit preview policy:")
    );
    const contextBlock = textBlocks.find((block) =>
      block.type === "text" && block.text?.includes("Markra editor context:")
    );

    expect(previewPolicyBlock).toBeUndefined();
    expect(contextBlock?.text).toContain("Current selection snapshot:");
    expect(contextBlock?.text).toContain("Range: 9-23");
    expect(contextBlock?.text).toContain("Cursor: 23");
    expect(contextBlock?.text).toContain("Source: selection");
    expect(contextBlock?.text).toContain("Selected text:\nOriginal draft");
  });

  it("runs ACP inline edit prompts and returns normalized replacement content", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();
    const onTextDelta = vi.fn();
    let promptText = "";

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async (_connectionId, message) => {
          if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
            const params = "params" in message && message.params && typeof message.params === "object"
              ? message.params as { prompt?: Array<{ text?: string }> }
              : {};
            promptText = params.prompt?.map((block) => block.text ?? "").join("\n\n") ?? "";
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({
                jsonrpc: "2.0",
                method: "session/update",
                params: {
                  sessionId: "session-1",
                  update: {
                    content: [{ text: "Better draft", type: "text" }],
                    sessionUpdate: "agent_message_chunk"
                  }
                }
              }),
              type: "message"
            });
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
              type: "message"
            });
          }
        })
      }
    });

    const result = await runAcpInlineAiAgent({
      documentContent: "# Draft\n\nOriginal draft",
      documentPath: "/mock-workspace/current.md",
      intent: "polish",
      onTextDelta,
      prompt: "Make it clearer",
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      target: {
        from: 9,
        original: "Original draft",
        promptText: "Original draft",
        scope: "selection",
        to: 23,
        type: "replace"
      },
      workspaceKey: "/mock-workspace"
    });

    expect(promptText).toContain("Markra inline edit task:");
    expect(promptText).toContain("Return only the Markdown fragment");
    expect(promptText).toContain("Target scope:\nSelected text");
    expect(promptText).toContain("Edit mode:\nReplace the target");
    expect(promptText).toContain("Target range:\n9-23");
    expect(promptText).toContain("Target text:\nOriginal draft");
    expect(promptText).toContain("User instruction:\nMake it clearer");
    expect(onTextDelta).toHaveBeenCalledWith("Better draft");
    expect(result).toEqual({
      content: "Better draft",
      finishReason: "stop"
    });
  });

  it("resolves relative ACP current-document writes against the agent working directory", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();
    const onPreviewResult = vi.fn();

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async (_connectionId, message) => {
          if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({
                id: 91,
                jsonrpc: "2.0",
                method: "fs/write_text_file",
                params: {
                  content: "# Updated\n\nBody",
                  path: "notes/current.md",
                  sessionId: "session-1"
                }
              }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "id" in message && message.id === 91 && "result" in message) {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: 3, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
              type: "message"
            });
          }
        })
      }
    });

    await runAcpDocumentAgent({
      documentContent: "# Draft",
      documentPath: "/mock-workspace/notes/current.md",
      history: [],
      onPreviewResult,
      onTextDelta: vi.fn(),
      prompt: "Update this note",
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    expect(onPreviewResult).toHaveBeenCalledWith(expect.objectContaining({
      replacement: "# Updated\n\nBody",
      target: {
        kind: "document",
        title: "current.md"
      }
    }), "acp-write:/mock-workspace/notes/current.md:1");
  });

  it("rejects ACP filesystem reads outside the workspace root", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();
    const readWorkspaceFile = vi.fn(async () => "# Secret");
    let readResponse: unknown = null;

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async (_connectionId, message) => {
          if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({
                id: 91,
                jsonrpc: "2.0",
                method: "fs/read_text_file",
                params: {
                  path: "../secret.md",
                  sessionId: "session-1"
                }
              }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "id" in message && message.id === 91) {
            readResponse = message;
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: 3, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
              type: "message"
            });
          }
        })
      }
    });

    await runAcpDocumentAgent({
      documentContent: "# Draft",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onTextDelta: vi.fn(),
      prompt: "Read outside the workspace",
      readWorkspaceFile,
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    expect(readWorkspaceFile).not.toHaveBeenCalled();
    expect(readResponse).toMatchObject({
      error: {
        message: "ACP filesystem reads are only available inside the current workspace."
      },
      id: 91,
      jsonrpc: "2.0"
    });
  });

  it("streams text from ACP agent_message_chunk arrays", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();
    const onTextDelta = vi.fn();

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async (_connectionId, message) => {
          if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({
                jsonrpc: "2.0",
                method: "session/update",
                params: {
                  sessionId: "session-1",
                  update: {
                    content: [
                      { text: "Hello", type: "text" },
                      { type: "resource_link", name: "note.md", uri: "file:///mock-workspace/note.md" },
                      { text: " ACP", type: "text" }
                    ],
                    sessionUpdate: "agent_message_chunk"
                  }
                }
              }),
              type: "message"
            });
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
              type: "message"
            });
          }
        })
      }
    });

    const result = await runAcpDocumentAgent({
      documentContent: "# Draft",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onTextDelta,
      prompt: "Hello",
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    expect(onTextDelta).toHaveBeenCalledWith("Hello ACP");
    expect(result.content).toBe("Hello ACP");
  });

  it("cancels the ACP session and stops the agent when aborted", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();
    const abortController = new AbortController();
    const stopAgent = vi.fn(async () => undefined);
    const writeAgentMessage = vi.fn(async (_connectionId, message) => {
      if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
        handleAgentMessage?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
          type: "message"
        });
        return;
      }

      if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
        handleAgentMessage?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
          type: "message"
        });
      }
    });

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent,
        writeAgentMessage
      }
    });

    const run = runAcpDocumentAgent({
      documentContent: "# Draft",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onTextDelta: vi.fn(),
      prompt: "Keep running",
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      signal: abortController.signal,
      workspaceKey: "/mock-workspace"
    });

    await vi.waitFor(() => expect(writeAgentMessage).toHaveBeenCalledWith("acp-1", expect.objectContaining({
      method: "session/prompt"
    })));

    abortController.abort();

    await expect(run).rejects.toThrow("ACP agent request was cancelled.");
    expect(writeAgentMessage).toHaveBeenCalledWith("acp-1", {
      jsonrpc: "2.0",
      method: "session/cancel",
      params: {
        sessionId: "session-1"
      }
    });
    expect(stopAgent).toHaveBeenCalledWith("acp-1");
  });

  it("surfaces ACP permission requests as rejected Markra activities", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const runtime = createDefaultAppRuntime();
    const onEvent = vi.fn();

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async (_connectionId, message) => {
          if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({
                id: 91,
                jsonrpc: "2.0",
                method: "session/request_permission",
                params: {
                  options: [
                    { kind: "allow_once", name: "Allow once", optionId: "allow_once" },
                    { kind: "reject_once", name: "Reject once", optionId: "reject_once" }
                  ],
                  sessionId: "session-1",
                  toolCall: {
                    kind: "edit",
                    title: "Write file"
                  }
                }
              }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "id" in message && message.id === 91 && "result" in message) {
            expect(message.result).toEqual({
              outcome: {
                outcome: "selected",
                optionId: "reject_once"
              }
            });
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: 3, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
              type: "message"
            });
          }
        })
      }
    });

    await runAcpDocumentAgent({
      documentContent: "# Draft",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onEvent,
      onTextDelta: vi.fn(),
      prompt: "Update this note",
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    expect(onEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      args: expect.objectContaining({
        kind: "edit",
        summary: "Permission rejected by Markra.",
        title: "Permission requested: Write file"
      }),
      toolCallId: "acp-permission-1",
      toolName: "acp.permission",
      type: "tool_execution_start"
    }));
    expect(onEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      isError: true,
      result: expect.objectContaining({
        details: expect.objectContaining({
          kind: "edit",
          summary: "Permission rejected by Markra.",
          title: "Permission requested: Write file"
        })
      }),
      toolCallId: "acp-permission-1",
      toolName: "acp.permission",
      type: "tool_execution_end"
    }));
  });

  it("waits for provided ACP permission decisions before responding to the agent", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    const permissionResolver: {
      current: ((outcome: { optionId: string; outcome: "selected" }) => unknown) | null;
    } = {
      current: null
    };
    let permissionResponse: unknown = null;
    const runtime = createDefaultAppRuntime();
    const onPermissionRequest = vi.fn(() => new Promise<{ optionId: string; outcome: "selected" }>((resolve) => {
      permissionResolver.current = resolve;
    }));

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage: vi.fn(async (_connectionId, message) => {
          if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { sessionId: "session-1" } }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({
                id: 91,
                jsonrpc: "2.0",
                method: "session/request_permission",
                params: {
                  options: [
                    { kind: "allow_once", name: "Allow once", optionId: "allow_once" },
                    { kind: "reject_once", name: "Reject once", optionId: "reject_once" }
                  ],
                  sessionId: "session-1",
                  toolCall: {
                    kind: "edit",
                    title: "Write file"
                  }
                }
              }),
              type: "message"
            });
            return;
          }

          if (message && typeof message === "object" && "id" in message && message.id === 91 && "result" in message) {
            permissionResponse = message.result;
            handleAgentMessage?.({
              connectionId: "acp-1",
              message: JSON.stringify({ id: 3, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
              type: "message"
            });
          }
        })
      }
    });

    const run = runAcpDocumentAgent({
      documentContent: "# Draft",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onPermissionRequest,
      onTextDelta: vi.fn(),
      prompt: "Update this note",
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    await vi.waitFor(() => expect(onPermissionRequest).toHaveBeenCalledTimes(1));
    expect(permissionResponse).toBeNull();

    const resolvePermission = permissionResolver.current;
    if (!resolvePermission) throw new Error("ACP permission resolver was not registered.");
    resolvePermission({ optionId: "allow_once", outcome: "selected" });

    await expect(run).resolves.toMatchObject({
      finishReason: "stop"
    });
    expect(permissionResponse).toEqual({
      outcome: {
        outcome: "selected",
        optionId: "allow_once"
      }
    });
  });

  it("authenticates and retries ACP session creation when the agent requires auth", async () => {
    let handleAgentMessage: ((event: AppAcpAgentMessageEvent) => unknown) | null = null;
    let sessionNewCount = 0;
    const runtime = createDefaultAppRuntime();
    const onEvent = vi.fn();
    const writeAgentMessage = vi.fn(async (_connectionId, message) => {
      if (message && typeof message === "object" && "method" in message && message.method === "initialize") {
        handleAgentMessage?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            id: message.id,
            jsonrpc: "2.0",
            result: {
              authMethods: [
                {
                  description: "Sign in with the local Codex CLI account.",
                  id: "codex-login",
                  name: "Codex login"
                }
              ],
              protocolVersion: 1
            }
          }),
          type: "message"
        });
        return;
      }

      if (message && typeof message === "object" && "method" in message && message.method === "session/new") {
        sessionNewCount += 1;
        handleAgentMessage?.({
          connectionId: "acp-1",
          message: JSON.stringify(
            sessionNewCount === 1
              ? {
                  error: {
                    code: -32000,
                    message: "Authentication required"
                  },
                  id: message.id,
                  jsonrpc: "2.0"
                }
              : {
                  id: message.id,
                  jsonrpc: "2.0",
                  result: { sessionId: "session-1" }
                }
          ),
          type: "message"
        });
        return;
      }

      if (message && typeof message === "object" && "method" in message && message.method === "authenticate") {
        handleAgentMessage?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: {} }),
          type: "message"
        });
        return;
      }

      if (message && typeof message === "object" && "method" in message && message.method === "session/prompt") {
        handleAgentMessage?.({
          connectionId: "acp-1",
          message: JSON.stringify({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "session-1",
              update: {
                content: { text: "Ready after auth", type: "text" },
                sessionUpdate: "agent_message_chunk"
              }
            }
          }),
          type: "message"
        });
        handleAgentMessage?.({
          connectionId: "acp-1",
          message: JSON.stringify({ id: message.id, jsonrpc: "2.0", result: { stopReason: "end_turn" } }),
          type: "message"
        });
      }
    });

    configureAppRuntime({
      ...runtime,
      acp: {
        listenAgentMessages: vi.fn(async (handler) => {
          handleAgentMessage = handler;

          return () => {
            handleAgentMessage = null;
          };
        }),
        startAgent: vi.fn(async () => ({ connectionId: "acp-1" })),
        stopAgent: vi.fn(async () => undefined),
        writeAgentMessage
      }
    });

    const result = await runAcpDocumentAgent({
      documentContent: "# Draft",
      documentPath: "/mock-workspace/current.md",
      history: [],
      onEvent,
      onTextDelta: vi.fn(),
      prompt: "Hello",
      settings: {
        args: "",
        command: "synthetic-acp-agent",
        cwd: "",
        enabled: true
      },
      workspaceKey: "/mock-workspace"
    });

    expect(writeAgentMessage).toHaveBeenCalledWith("acp-1", expect.objectContaining({
      method: "authenticate",
      params: {
        methodId: "codex-login"
      }
    }));
    expect(sessionNewCount).toBe(2);
    expect(onEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      args: expect.objectContaining({
        summary: "Sign in with the local Codex CLI account.",
        title: "Authenticate ACP agent: Codex login"
      }),
      toolCallId: "acp-authentication",
      toolName: "acp.authentication",
      type: "tool_execution_start"
    }));
    expect(onEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      isError: false,
      result: expect.objectContaining({
        details: expect.objectContaining({
          summary: "Authentication completed.",
          title: "Authenticate ACP agent: Codex login"
        })
      }),
      toolCallId: "acp-authentication",
      toolName: "acp.authentication",
      type: "tool_execution_end"
    }));
    expect(result.content).toBe("Ready after auth");
  });
});
