import {
  decodeOpenRouterReasoningDetails,
  decodeProviderMetadata,
  encodeOpenRouterReasoningDetails,
  encodeProviderMetadata,
  mergeOpenRouterReasoningDetails
} from "./reasoning-metadata";

describe("reasoning metadata", () => {
  it("round-trips AI SDK provider metadata through an opaque signature", () => {
    const metadata = {
      anthropic: {
        signature: "anthropic-signature"
      }
    };

    expect(decodeProviderMetadata(encodeProviderMetadata(metadata))).toEqual(metadata);
  });

  it("round-trips OpenRouter reasoning details through an opaque signature", () => {
    const details = [
      {
        format: "anthropic-claude-v1",
        index: 0,
        signature: "detail-signature",
        text: "Need context",
        type: "reasoning.text"
      }
    ];

    expect(decodeOpenRouterReasoningDetails(encodeOpenRouterReasoningDetails(details))).toEqual(details);
  });

  it("ignores malformed, unknown, and mismatched signatures", () => {
    const unknownVersion = JSON.stringify({
      kind: "provider-metadata",
      value: { anthropic: { signature: "signature" } },
      version: 2
    });

    expect(decodeProviderMetadata("not-json")).toBeUndefined();
    expect(decodeProviderMetadata(unknownVersion)).toBeUndefined();
    expect(decodeOpenRouterReasoningDetails(encodeProviderMetadata({ openai: { itemId: "rs_123" } }))).toBeUndefined();
  });

  it("merges incremental and cumulative OpenRouter reasoning detail chunks in order", () => {
    const merged = mergeOpenRouterReasoningDetails(
      [
        { format: "anthropic-claude-v1", index: 0, text: "Need", type: "reasoning.text" },
        { data: "encrypted", id: "call_read", index: 1, type: "reasoning.encrypted" }
      ],
      [
        { index: 0, text: " context", type: "reasoning.text" },
        { data: "encrypted-final", id: "call_read", index: 1, type: "reasoning.encrypted" },
        { index: 2, summary: "Ready", type: "reasoning.summary" }
      ]
    );

    expect(merged).toEqual([
      { format: "anthropic-claude-v1", index: 0, text: "Need context", type: "reasoning.text" },
      { data: "encrypted-final", id: "call_read", index: 1, type: "reasoning.encrypted" },
      { index: 2, summary: "Ready", type: "reasoning.summary" }
    ]);

    expect(mergeOpenRouterReasoningDetails(merged, [
      { index: 0, text: "Need context for tools", type: "reasoning.text" }
    ])[0]).toEqual({
      format: "anthropic-claude-v1",
      index: 0,
      text: "Need context for tools",
      type: "reasoning.text"
    });
  });
});
