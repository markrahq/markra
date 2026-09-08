import type { AiProviderApiStyle } from "./providers";

export type ProviderCapabilities = {
  chat: boolean;
  modelList: boolean;
  streaming: boolean;
  toolCalling: boolean;
};

const defaultByApiStyle: Record<AiProviderApiStyle, ProviderCapabilities> = {
  anthropic: { chat: true, modelList: true, streaming: true, toolCalling: true },
  "azure-openai": { chat: true, modelList: false, streaming: true, toolCalling: true },
  deepseek: { chat: true, modelList: true, streaming: true, toolCalling: true },
  google: { chat: true, modelList: true, streaming: true, toolCalling: true },
  groq: { chat: true, modelList: true, streaming: true, toolCalling: true },
  mistral: { chat: true, modelList: true, streaming: true, toolCalling: true },
  ollama: { chat: true, modelList: true, streaming: true, toolCalling: false },
  openai: { chat: true, modelList: true, streaming: true, toolCalling: true },
  "openai-compatible": { chat: true, modelList: false, streaming: true, toolCalling: true },
  openrouter: { chat: true, modelList: true, streaming: true, toolCalling: true },
  together: { chat: true, modelList: true, streaming: true, toolCalling: true },
  xai: { chat: true, modelList: true, streaming: true, toolCalling: true }
};

const providerOverrides: Record<string, Partial<ProviderCapabilities>> = {
  orcarouter: { modelList: true },
  "aliyun-bailian": { modelList: true, toolCalling: true },
  volcengine: { modelList: true, toolCalling: true },
  "xiaomi-mimo": { modelList: true, toolCalling: true }
};

export function getProviderCapabilities(providerId: string, apiStyle: AiProviderApiStyle): ProviderCapabilities {
  return {
    ...defaultByApiStyle[apiStyle],
    ...(providerOverrides[providerId] ?? {})
  };
}
