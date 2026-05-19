import { buildInlineAiMessages, normalizeInlineAiReplacement } from "./inline-prompt";

describe("inline AI prompt builder", () => {
  it("uses action-specific instructions and forbids non-Markdown wrappers", () => {
    const messages = buildInlineAiMessages({
      documentContent: "# Title\n\nOriginal text",
      intent: "polish",
      prompt: "Polish",
      targetScope: "selection",
      targetText: "Original text",
      targetType: "replace"
    });

    expect(messages[0]).toMatchObject({
      content: expect.stringContaining("Return only the Markdown fragment"),
      role: "system"
    });
    expect(messages[0]?.content).toContain("Do not return JSON");
    expect(messages[0]?.content).toContain("Do not wrap the answer in code fences");
    expect(messages[1]).toMatchObject({
      content: expect.stringContaining("Task:\nPolish the target text"),
      role: "user"
    });
    expect(messages[1]?.content).toContain("Target scope:\nSelected text");
    expect(messages[1]?.content).toContain("Edit mode:\nReplace the target");
  });

  it("describes current block fallback separately from an explicit text selection", () => {
    const messages = buildInlineAiMessages({
      documentContent: "# Title\n\nFirst paragraph.\n\nSecond paragraph.",
      intent: "custom",
      prompt: "make it clearer",
      targetScope: "block",
      targetText: "First paragraph.",
      targetType: "replace"
    });

    expect(messages[1]?.content).toContain("Target scope:\nCurrent Markdown block");
    expect(messages[1]?.content).toContain("Target text:\nFirst paragraph.");
    expect(messages[1]?.content).toContain("Do not edit unrelated document content.");
  });

  it("frames custom questions as answers grounded in the selected text context", () => {
    const messages = buildInlineAiMessages({
      documentContent: '- On 2042-03-04, the project team introduced "sample slogan".',
      intent: "custom",
      prompt: "When was this introduced?",
      targetContext: '- On 2042-03-04, the project team introduced "sample slogan".',
      targetScope: "selection",
      targetText: "sample slogan",
      targetType: "replace"
    });

    expect(messages[0]?.content).toContain("If the user asks a question, answer it directly");
    expect(messages[1]?.content).toContain("Nearby target context:");
    expect(messages[1]?.content).toContain("2042-03-04");
    expect(messages[1]?.content).toContain("User instruction:\nWhen was this introduced?");
  });

  it("frames continuation as inserted text without repeating the target", () => {
    const messages = buildInlineAiMessages({
      documentContent: "# Title\n\nOpening paragraph.",
      intent: "continue",
      prompt: "Continue writing",
      targetScope: "selection",
      targetText: "Opening paragraph.",
      targetType: "insert"
    });

    expect(messages[1]?.content).toContain("Task:\nContinue after the target text");
    expect(messages[1]?.content).toContain("Edit mode:\nInsert after the target");
    expect(messages[1]?.content).toContain("Do not repeat the target text.");
  });

  it("auto-detects the current text language before choosing a translation target", () => {
    const messages = buildInlineAiMessages({
      documentContent: "# Title\n\nBonjour",
      intent: "translate",
      prompt: "Translate",
      targetText: "Bonjour",
      translationTargetLanguage: "Japanese"
    });
    const defaultMessages = buildInlineAiMessages({
      documentContent: "# Title\n\nBonjour",
      intent: "translate",
      prompt: "Translate",
      targetText: "Bonjour"
    });

    expect(messages[1]?.content).toContain("Task:\nAutomatically detect the target text's current language");
    expect(messages[1]?.content).toContain("Use Japanese as the preferred target language");
    expect(messages[1]?.content).toContain("If the target text is already in Japanese, translate it into English");
    expect(defaultMessages[1]?.content).toContain(
      "Use English as the preferred target language"
    );
  });

  it("removes accidental Markdown code fences from final model output", () => {
    expect(normalizeInlineAiReplacement("```markdown\nImproved **text**.\n```")).toBe("Improved **text**.");
    expect(normalizeInlineAiReplacement("\nImproved text.\n")).toBe("Improved text.");
  });
});
