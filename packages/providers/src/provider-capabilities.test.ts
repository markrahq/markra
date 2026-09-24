import { getProviderCapabilities } from "./provider-capabilities";

describe("provider capabilities", () => {
  it("enables model discovery for the built-in OrcaRouter gateway", () => {
    expect(getProviderCapabilities("orcarouter", "openai-compatible")).toEqual({
      chat: true,
      modelList: true,
      streaming: true,
      toolCalling: true
    });
  });

  it("enables model discovery for the built-in Requesty gateway", () => {
    expect(getProviderCapabilities("requesty", "openai-compatible")).toEqual({
      chat: true,
      modelList: true,
      streaming: true,
      toolCalling: true
    });
  });

  it("uses api-style defaults and provider-level overrides", () => {
    expect(getProviderCapabilities("custom-provider-1", "openai-compatible")).toEqual({
      chat: true,
      modelList: false,
      streaming: true,
      toolCalling: true
    });
    expect(getProviderCapabilities("aliyun-bailian", "openai-compatible")).toEqual({
      chat: true,
      modelList: true,
      streaming: true,
      toolCalling: true
    });
    expect(getProviderCapabilities("volcengine", "openai-compatible")).toMatchObject({
      modelList: true,
      toolCalling: true
    });
    expect(getProviderCapabilities("xiaomi-mimo", "openai-compatible")).toMatchObject({
      modelList: true,
      toolCalling: true
    });
    expect(getProviderCapabilities("azure-openai", "azure-openai")).toEqual({
      chat: true,
      modelList: false,
      streaming: true,
      toolCalling: true
    });
    expect(getProviderCapabilities("ollama", "ollama").toolCalling).toBe(false);
  });
});
