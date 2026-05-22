import { runInlineAiAgent } from "./runtime";
import { messagesFromPiContext } from "./runtime/messages";
import type { AiProviderConfig } from "@markra/providers";
import type { ChatMessage } from "./chat/types";

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

describe("inline AI agent runtime", () => {
  it("surfaces provider errors from the streaming runtime", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("Concurrency limit exceeded for user, please retry later"));

    await expect(runInlineAiAgent({
      complete,
      documentContent: "# Draft\n\nOriginal body",
      documentPath: "/vault/README.md",
      model: "gpt-5.5",
      prompt: "make it clearer",
      provider: provider(),
      target: {
        from: 9,
        original: "Original body",
        promptText: "Original body",
        to: 22,
        type: "replace"
      }
    })).rejects.toThrow("Concurrency limit exceeded for user, please retry later");
  });

  it("keeps continuation context local instead of sending unrelated document sections", async () => {
    const documentContent = [
      "# Synthetic Topic Alpha",
      "",
      "Opening line for the current topic.",
      "",
      "# Synthetic Topic Beta",
      "",
      "Unrelated downstream details that should stay out of an inline continuation prompt."
    ].join("\n");
    const targetText = "# Synthetic Topic Alpha";
    const from = documentContent.indexOf(targetText);
    const complete = vi.fn().mockResolvedValue({ content: "Better body", finishReason: "stop" });

    await expect(
      runInlineAiAgent({
        complete,
        documentContent,
        documentPath: "/vault/synthetic.md",
        intent: "continue",
        model: "gpt-5.5",
        prompt: "continue this topic",
        provider: provider(),
        target: {
          from,
          original: targetText,
          promptText: targetText,
          scope: "block",
          to: from + targetText.length,
          type: "insert"
        },
        workspaceFiles: [{ name: "README.md", path: "/vault/README.md", relativePath: "README.md" }]
      })
    ).resolves.toEqual({ content: "Better body", finishReason: "stop" });

    const messages = (complete.mock.calls[0]?.[2] ?? []) as ChatMessage[];
    const userMessage = messages.find((message) => message.role === "user")?.content ?? "";
    expect(userMessage).toContain("Target text:\n# Synthetic Topic Alpha");
    expect(userMessage).not.toContain("Synthetic Topic Beta");
    expect(userMessage).not.toContain("Unrelated downstream details");
    expect(userMessage).not.toContain("Read-only agent tool context");
    expect(userMessage).not.toContain("workspace_markdown_files");
  });

  it("adds nearby target context for selected-text questions", async () => {
    const documentContent = [
      "# Synthetic note",
      "",
      "- On 2042-03-04, the team introduced the motto \"Selected sample phrase\" during a mock launch note."
    ].join("\n");
    const targetText = "Selected sample phrase";
    const from = documentContent.indexOf(targetText);
    const complete = vi.fn().mockResolvedValue({ content: "It was introduced on 2042-03-04.", finishReason: "stop" });

    await runInlineAiAgent({
      complete,
      documentContent,
      documentPath: "/vault/synthetic.md",
      model: "local-synthetic-model",
      prompt: "When was this introduced?",
      provider: provider({ id: "ollama", type: "ollama" }),
      target: {
        from,
        original: targetText,
        promptText: targetText,
        scope: "selection",
        to: from + targetText.length,
        type: "replace"
      }
    });

    const messages = (complete.mock.calls[0]?.[2] ?? []) as ChatMessage[];
    const userMessage = messages.find((message) => message.role === "user")?.content ?? "";
    expect(userMessage).toContain("Nearby target context:");
    expect(userMessage).toContain("2042-03-04");
    expect(userMessage).not.toContain("Current document context");
  });

  it("emits agent lifecycle and assistant update events while producing the inline edit", async () => {
    const events: string[] = [];
    const complete = vi.fn().mockResolvedValue({ content: "Better body", finishReason: "stop" });

    await runInlineAiAgent({
      complete,
      documentContent: "# Draft\n\nOriginal body",
      documentPath: "/vault/README.md",
      model: "gpt-5.5",
      onEvent: (event) => {
        events.push(event.type);
      },
      prompt: "make it clearer",
      provider: provider(),
      target: {
        from: 9,
        original: "Original body",
        promptText: "Original body",
        to: 22,
        type: "replace"
      }
    });

    expect(events).toEqual(expect.arrayContaining(["agent_start", "message_update", "agent_end"]));
  });

  it("forwards streaming deltas into pi-agent message update events", async () => {
    const deltas: string[] = [];
    const thinkingDeltas: string[] = [];
    const complete = vi.fn(async (_provider, _model, _messages, options) => {
      options?.onThinkingDelta?.("Checking context");
      options?.onDelta?.("Better ");
      options?.onDelta?.("body");

      return { content: "Better body", finishReason: "stop" };
    });

    await expect(
      runInlineAiAgent({
        complete,
        documentContent: "# Draft\n\nOriginal body",
        documentPath: "/vault/README.md",
        model: "gpt-5.5",
        onEvent: (event) => {
          if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
            thinkingDeltas.push(event.assistantMessageEvent.delta);
          }
          if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
            deltas.push(event.assistantMessageEvent.delta);
          }
        },
        prompt: "make it clearer",
        provider: provider(),
        target: {
          from: 9,
          original: "Original body",
          promptText: "Original body",
          to: 22,
          type: "replace"
        }
      })
    ).resolves.toEqual({ content: "Better body", finishReason: "stop" });

    expect(thinkingDeltas).toEqual(["Checking context"]);
    expect(deltas).toEqual(["Better ", "body"]);
  });

  it("preserves assistant thinking blocks when replaying tool-calling context", () => {
    expect(messagesFromPiContext({
      messages: [
        {
          content: [
            { thinking: "Need to inspect the document first.", type: "thinking" },
            { arguments: {}, id: "call_read_document", name: "read_document", type: "toolCall" }
          ],
          role: "assistant"
        }
      ],
      systemPrompt: ""
    } as never)).toEqual([
      {
        content: "",
        role: "assistant",
        thinking: "Need to inspect the document first.",
        toolCalls: [
          {
            arguments: {},
            id: "call_read_document",
            name: "read_document"
          }
        ]
      }
    ]);
  });
});
