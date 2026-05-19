import { act, renderHook } from "@testing-library/react";
import { runInlineAiAgent } from "@markra/ai";
import { useAiCommandUi } from "./useAiCommandUi";
import type { AiProviderConfig } from "@markra/providers";

vi.mock("@markra/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@markra/ai")>();

  return {
    ...actual,
    runInlineAiAgent: vi.fn()
  };
});

const mockedRunInlineAiAgent = vi.mocked(runInlineAiAgent);

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

describe("useAiCommandUi", () => {
  beforeEach(() => {
    mockedRunInlineAiAgent.mockReset();
  });

  it("only opens the command surface when text is selected", () => {
    let selection: { from: number; text: string; to: number } | null = null;
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "# Draft",
        getSelection: () => selection,
        model: "gpt-5.5",
        onAiResult: vi.fn(),
        provider: provider(),
        settingsLoading: false
      })
    );

    act(() => {
      result.current.openAiCommand();
    });

    expect(result.current.open).toBe(false);

    selection = { from: 2, text: "Draft", to: 7 };

    act(() => {
      result.current.openAiCommand();
    });

    expect(result.current.open).toBe(true);
  });

  it("returns a configuration error when no provider is ready", async () => {
    const onAiResult = vi.fn();
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "# Draft",
        getSelection: () => ({ from: 2, text: "Draft", to: 7 }),
        model: null,
        onAiResult,
        provider: null,
        settingsLoading: false
      })
    );

    act(() => {
      result.current.updatePrompt("rewrite");
    });
    await act(async () => {
      await result.current.submitPrompt();
    });

    expect(mockedRunInlineAiAgent).not.toHaveBeenCalled();
    expect(onAiResult).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  it("runs the inline agent with editor context and emits a replace result", async () => {
    const onAiResult = vi.fn();
    mockedRunInlineAiAgent.mockResolvedValue({ content: "Better draft", finishReason: "stop" });
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "# Draft\n\nOriginal draft",
        documentPath: "/vault/README.md",
        getSelection: () => ({ from: 9, text: "Original draft", to: 23 }),
        model: "gpt-5.5",
        onAiResult,
        provider: provider(),
        settingsLoading: false
      })
    );

    act(() => {
      result.current.updatePrompt("make it clearer");
    });
    await act(async () => {
      await result.current.submitPrompt();
    });

    expect(mockedRunInlineAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      documentContent: "# Draft\n\nOriginal draft",
      documentPath: "/vault/README.md",
      intent: "custom",
      model: "gpt-5.5",
      prompt: "make it clearer",
      provider: expect.objectContaining({ id: "openai" }),
      target: expect.objectContaining({
        original: "Original draft",
        promptText: "Original draft",
        scope: "selection",
        type: "replace"
      })
    }));
    expect(onAiResult).toHaveBeenCalledWith({
      from: 9,
      original: "Original draft",
      replacement: "Better draft",
      to: 23,
      type: "replace"
    });
  });

  it("passes command thinking options into the inline agent", async () => {
    mockedRunInlineAiAgent.mockResolvedValue({ content: "Better draft", finishReason: "stop" });
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "# Draft\n\nOriginal draft",
        getSelection: () => ({ from: 9, text: "Original draft", to: 23 }),
        model: "gpt-5.5",
        onAiResult: vi.fn(),
        provider: provider({ id: "deepseek", type: "deepseek" }),
        settingsLoading: false
      })
    );

    await act(async () => {
      await result.current.submitPrompt("make it clearer", "custom", { thinkingEnabled: true });
    });

    expect(mockedRunInlineAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      thinkingEnabled: true
    }));
  });

  it("can submit a prompt override before prompt state catches up", async () => {
    const onAiResult = vi.fn();
    mockedRunInlineAiAgent.mockResolvedValue({ content: "Better draft", finishReason: "stop" });
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "# Draft\n\nOriginal draft",
        getSelection: () => ({ from: 9, text: "Original draft", to: 23 }),
        model: "gpt-5.5",
        onAiResult,
        provider: provider(),
        settingsLoading: false
      })
    );

    await act(async () => {
      await result.current.submitPrompt("Polish");
    });

    expect(mockedRunInlineAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      prompt: "Polish"
    }));
    expect(onAiResult).toHaveBeenCalledWith(expect.objectContaining({ replacement: "Better draft" }));
  });

  it("uses the current Markdown block as the replacement target when no text is selected", async () => {
    const onAiResult = vi.fn();
    mockedRunInlineAiAgent.mockResolvedValue({ content: "Better paragraph.", finishReason: "stop" });
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "# Draft\n\nOriginal paragraph.\n\nOther paragraph.",
        getSelection: () => ({ from: 9, source: "block", text: "Original paragraph.", to: 28 }),
        model: "gpt-5.5",
        onAiResult,
        provider: provider(),
        settingsLoading: false
      })
    );

    await act(async () => {
      await result.current.submitPrompt("make it clearer");
    });

    expect(mockedRunInlineAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.objectContaining({
        from: 9,
        original: "Original paragraph.",
        promptText: "Original paragraph.",
        scope: "block",
        to: 28,
        type: "replace"
      })
    }));
    expect(onAiResult).toHaveBeenCalledWith({
      from: 9,
      original: "Original paragraph.",
      replacement: "Better paragraph.",
      to: 28,
      type: "replace"
    });
  });

  it("turns the continue action into an insert after the target instead of replacing it", async () => {
    const onAiResult = vi.fn();
    mockedRunInlineAiAgent.mockResolvedValue({ content: "\n\nNext paragraph.", finishReason: "stop" });
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "# Draft\n\nOpening paragraph.",
        getSelection: () => ({ from: 9, source: "selection", text: "Opening paragraph.", to: 27 }),
        model: "gpt-5.5",
        onAiResult,
        provider: provider(),
        settingsLoading: false
      })
    );

    await act(async () => {
      await result.current.submitPrompt("Continue writing", "continue");
    });

    expect(mockedRunInlineAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      intent: "continue",
      target: expect.objectContaining({
        from: 27,
        original: "",
        promptText: "Opening paragraph.",
        scope: "selection",
        to: 27,
        type: "insert"
      })
    }));
    expect(onAiResult).toHaveBeenCalledWith({
      from: 27,
      original: "",
      replacement: "\n\nNext paragraph.",
      to: 27,
      type: "insert"
    });
  });

  it("passes the selected app language as the preferred translation target", async () => {
    const onAiResult = vi.fn();
    mockedRunInlineAiAgent.mockResolvedValue({ content: "Bonjour", finishReason: "stop" });
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "# Draft\n\nHello",
        getSelection: () => ({ from: 9, source: "selection", text: "Hello", to: 14 }),
        model: "gpt-5.5",
        onAiResult,
        provider: provider(),
        settingsLoading: false,
        translationTargetLanguage: "Simplified Chinese"
      })
    );

    await act(async () => {
      await result.current.submitPrompt("Translate", "translate");
    });

    expect(mockedRunInlineAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      intent: "translate",
      translationTargetLanguage: "Simplified Chinese"
    }));
  });

  it("keeps the command session open and clears the prompt after a suggestion is ready", async () => {
    const onAiResult = vi.fn();
    mockedRunInlineAiAgent.mockResolvedValue({ content: "Better draft", finishReason: "stop" });
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "# Draft\n\nOriginal draft",
        getSelection: () => ({ from: 9, text: "Original draft", to: 23 }),
        model: "gpt-5.5",
        onAiResult,
        provider: provider(),
        settingsLoading: false
      })
    );

    act(() => {
      result.current.openAiCommand();
      result.current.updatePrompt("make it clearer");
    });
    await act(async () => {
      await result.current.submitPrompt();
    });

    expect(result.current.open).toBe(true);
    expect(result.current.prompt).toBe("");
    expect(onAiResult).toHaveBeenCalledWith(expect.objectContaining({ replacement: "Better draft", type: "replace" }));
  });

  it("treats an empty AI response as an error instead of a red-only diff", async () => {
    const onAiResult = vi.fn();
    mockedRunInlineAiAgent.mockResolvedValue({ content: "   ", finishReason: "stop" });
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "# Draft\n\nOriginal draft",
        getSelection: () => ({ from: 9, text: "Original draft", to: 23 }),
        model: "gpt-5.5",
        onAiResult,
        provider: provider(),
        settingsLoading: false,
        translate: (key) => (key === "app.aiEmptyResponse" ? "AI returned no text." : key)
      })
    );

    await act(async () => {
      await result.current.submitPrompt("make it clearer");
    });

    expect(onAiResult).toHaveBeenCalledWith({
      message: "AI returned no text.",
      type: "error"
    });
    expect(onAiResult).not.toHaveBeenCalledWith(expect.objectContaining({
      replacement: expect.any(String),
      type: "replace"
    }));
    expect(result.current.status).toBe("error");
  });

  it("continues from a pending AI suggestion when the editor selection has already moved", async () => {
    const onAiResult = vi.fn();
    mockedRunInlineAiAgent.mockResolvedValue({ content: "Even better draft", finishReason: "stop" });
    const pendingResult = {
      from: 9,
      original: "Original draft",
      replacement: "Better draft",
      to: 23,
      type: "replace" as const
    };
    const commandContext = {
      getDocumentContent: () => "# Draft\n\nOriginal draft",
      getPendingResult: () => pendingResult,
      getSelection: () => null,
      model: "gpt-5.5",
      onAiResult,
      provider: provider(),
      settingsLoading: false
    };
    const { result } = renderHook(() => useAiCommandUi(commandContext));

    act(() => {
      result.current.updatePrompt("make the suggestion warmer");
    });
    await act(async () => {
      await result.current.submitPrompt();
    });

    expect(mockedRunInlineAiAgent).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.objectContaining({
        promptText: "Better draft",
        suggestionContext: {
          original: "Original draft",
          replacement: "Better draft"
        }
      })
    }));
    expect(onAiResult).toHaveBeenCalledWith({
      from: 9,
      original: "Original draft",
      replacement: "Even better draft",
      to: 23,
      type: "replace"
    });
  });

  it("interrupts an in-flight AI request and ignores its eventual response", async () => {
    const onAiResult = vi.fn();
    let resolveCompletion: (value: { content: string; finishReason: string }) => unknown = () => {};
    mockedRunInlineAiAgent.mockReturnValue(
      new Promise((resolve) => {
        resolveCompletion = resolve;
      })
    );
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "Original draft",
        getSelection: () => ({ from: 1, text: "Original draft", to: 15 }),
        model: "gpt-5.5",
        onAiResult,
        provider: provider(),
        settingsLoading: false
      })
    );

    act(() => {
      result.current.updatePrompt("make it clearer");
    });

    let submitPromise: Promise<unknown>;
    act(() => {
      submitPromise = result.current.submitPrompt();
    });

    expect(result.current.submitting).toBe(true);

    act(() => {
      result.current.interruptPrompt();
    });

    expect(result.current.submitting).toBe(false);

    await act(async () => {
      resolveCompletion({ content: "Better draft", finishReason: "stop" });
      await submitPromise;
    });

    expect(onAiResult).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it("tracks a single AI command status through streaming and suggestion", async () => {
    const onAiResult = vi.fn();
    let resolveCompletion: (value: { content: string; finishReason: string }) => unknown = () => {};
    mockedRunInlineAiAgent.mockImplementation((input) => {
      input.onEvent?.({
        message: {
          role: "assistant"
        },
        type: "message_start"
      } as Parameters<NonNullable<typeof input.onEvent>>[0]);
      input.onEvent?.({
        assistantMessageEvent: {
          contentIndex: 0,
          delta: "Better",
          partial: {
            content: [{ text: "Better", type: "text" }],
            role: "assistant"
          },
          type: "text_delta"
        },
        message: {
          content: [{ text: "Better", type: "text" }],
          role: "assistant"
        },
        type: "message_update"
      } as Parameters<NonNullable<typeof input.onEvent>>[0]);

      return new Promise((resolve) => {
        resolveCompletion = resolve;
      });
    });
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "Original draft",
        getSelection: () => ({ from: 1, text: "Original draft", to: 15 }),
        model: "gpt-5.5",
        onAiResult,
        provider: provider(),
        settingsLoading: false
      })
    );

    expect(result.current.status).toBe("idle");

    act(() => {
      result.current.updatePrompt("make it clearer");
    });

    expect(result.current.status).toBe("composing");

    let submitPromise: Promise<unknown>;
    act(() => {
      submitPromise = result.current.submitPrompt();
    });

    expect(result.current.status).toBe("streaming");

    await act(async () => {
      resolveCompletion({ content: "Better draft", finishReason: "stop" });
      await submitPromise;
    });

    expect(result.current.status).toBe("suggestion");
    expect(result.current.submitting).toBe(false);
  });

  it("streams partial agent output into the pending editor suggestion", async () => {
    const onAiResult = vi.fn();
    let resolveCompletion: (value: { content: string; finishReason: string }) => unknown = () => {};
    mockedRunInlineAiAgent.mockImplementation((input) => {
      input.onEvent?.({
        assistantMessageEvent: {
          contentIndex: 0,
          delta: "Better",
          partial: {
            content: [{ text: "Better", type: "text" }],
            role: "assistant"
          },
          type: "text_delta"
        },
        message: {
          content: [{ text: "Better", type: "text" }],
          role: "assistant"
        },
        type: "message_update"
      } as Parameters<NonNullable<typeof input.onEvent>>[0]);

      return new Promise((resolve) => {
        resolveCompletion = resolve;
      });
    });
    const { result } = renderHook(() =>
      useAiCommandUi({
        getDocumentContent: () => "Original draft",
        getSelection: () => ({ from: 1, text: "Original draft", to: 15 }),
        model: "gpt-5.5",
        onAiResult,
        provider: provider(),
        settingsLoading: false
      })
    );

    act(() => {
      result.current.updatePrompt("make it clearer");
    });

    let submitPromise: Promise<unknown>;
    act(() => {
      submitPromise = result.current.submitPrompt();
    });

    expect(onAiResult).toHaveBeenCalledWith({
      from: 1,
      original: "Original draft",
      replacement: "Better",
      to: 15,
      type: "replace"
    });

    await act(async () => {
      resolveCompletion({ content: "Better draft", finishReason: "stop" });
      await submitPromise;
    });

    expect(onAiResult).toHaveBeenLastCalledWith({
      from: 1,
      original: "Original draft",
      replacement: "Better draft",
      to: 15,
      type: "replace"
    });
  });
});
