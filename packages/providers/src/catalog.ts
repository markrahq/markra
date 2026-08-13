import type { AiProviderApiStyle, AiProviderConfigSeed, AiProviderRequestStyle } from "./types";

export const defaultApiUrlByApiStyle: Partial<Record<AiProviderApiStyle, string>> = {
  anthropic: "https://api.anthropic.com/v1",
  "azure-openai": "https://your-resource-name.openai.azure.com",
  deepseek: "https://api.deepseek.com",
  google: "https://generativelanguage.googleapis.com/v1beta",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  ollama: "http://localhost:11434/v1",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
  xai: "https://api.x.ai/v1"
};

export const defaultApiUrlByRequestStyle: Partial<Record<AiProviderRequestStyle, string>> = {
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  "openai-compatible": "https://api.openai.com/v1",
  "openai-responses": "https://api.openai.com/v1"
};

export const defaultProviderTemplates: AiProviderConfigSeed[] = [
  {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    defaultModelId: "gpt-5.6-sol",
    enabled: false,
    id: "openai",
    models: [
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.5", name: "GPT-5.5" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.4", name: "GPT-5.4" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.4-mini", name: "GPT-5.4 mini" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.4-nano", name: "GPT-5.4 nano" },
      { capabilities: ["image"], enabled: true, id: "gpt-image-2", name: "GPT Image 2" }
    ],
    name: "OpenAI",
    apiStyle: "openai-responses",
    type: "openai"
  },
  {
    apiKey: "",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModelId: "claude-opus-5",
    enabled: false,
    id: "anthropic",
    models: [
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "claude-opus-5", name: "Claude Opus 5" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "claude-fable-5", name: "Claude Fable 5" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "claude-opus-4-7", name: "Claude Opus 4.7" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
      { capabilities: ["text", "vision", "reasoning", "tools"], enabled: true, id: "claude-haiku-4-5", name: "Claude Haiku 4.5" }
    ],
    name: "Anthropic",
    apiStyle: "anthropic",
    type: "anthropic"
  },
  {
    apiKey: "",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModelId: "gemini-3.6-flash",
    enabled: false,
    id: "google",
    models: [
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
      {
        capabilities: ["text", "vision", "reasoning", "tools", "web"],
        enabled: true,
        id: "gemini-3.1-flash-lite-preview",
        name: "Gemini 3.1 Flash-Lite Preview"
      }
    ],
    name: "Google",
    apiStyle: "google",
    type: "google"
  },
  {
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    defaultModelId: "deepseek-v4-pro",
    enabled: false,
    id: "deepseek",
    models: [
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }
    ],
    name: "DeepSeek",
    apiStyle: "openai-compatible",
    type: "deepseek"
  },
  {
    apiKey: "",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModelId: "mistral-medium-3-5",
    enabled: false,
    id: "mistral",
    models: [
      { capabilities: ["text", "vision", "tools"], enabled: true, id: "mistral-medium-3-5", name: "Mistral Medium 3.5" },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "mistral-small-2603", name: "Mistral Small 4" },
      { capabilities: ["text", "vision", "tools"], enabled: true, id: "mistral-large-2512", name: "Mistral Large 3" },
      { capabilities: ["text", "vision", "tools"], enabled: true, id: "mistral-medium-latest", name: "Mistral Medium 3.5 (latest alias)" },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "mistral-small-latest", name: "Mistral Small 4 (latest alias)" },
      { capabilities: ["text", "vision", "tools"], enabled: true, id: "mistral-large-latest", name: "Mistral Large 3 (latest alias)" },
      { capabilities: ["text", "tools"], enabled: true, id: "devstral-latest", name: "Devstral 2" }
    ],
    name: "Mistral",
    apiStyle: "openai-compatible",
    type: "mistral"
  },
  {
    apiKey: "",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModelId: "groq/compound",
    enabled: false,
    id: "groq",
    models: [
      { capabilities: ["text", "tools", "web"], enabled: true, id: "groq/compound", name: "Groq Compound" },
      { capabilities: ["text", "tools", "web"], enabled: true, id: "groq/compound-mini", name: "Groq Compound Mini" },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
      { capabilities: ["text", "tools"], enabled: true, id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" }
    ],
    name: "Groq",
    apiStyle: "openai-compatible",
    type: "groq"
  },
  {
    apiKey: "",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModelId: "openrouter/auto",
    enabled: false,
    id: "openrouter",
    models: [
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "openrouter/auto", name: "OpenRouter Auto" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "anthropic/claude-fable-5", name: "Claude Fable 5" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "anthropic/claude-opus-5", name: "Claude Opus 5" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "google/gemini-3.6-flash", name: "Gemini 3.6 Flash" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "openai/gpt-5.5", name: "GPT-5.5" },
      { capabilities: ["text", "vision", "reasoning", "tools"], enabled: true, id: "anthropic/claude-opus-4.7", name: "Claude Opus 4.7" },
      { capabilities: ["text", "vision", "reasoning", "tools"], enabled: true, id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" }
    ],
    name: "OpenRouter",
    apiStyle: "openai-compatible",
    type: "openrouter"
  },
  {
    apiKey: "",
    baseUrl: "https://api.together.xyz/v1",
    defaultModelId: "moonshotai/Kimi-K2.6",
    enabled: false,
    id: "together",
    models: [
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "moonshotai/Kimi-K2.6",
        name: "Kimi K2.6"
      },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "zai-org/GLM-5.1", name: "GLM-5.1" },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "deepseek-ai/DeepSeek-V4-Pro", name: "DeepSeek V4 Pro" },
      {
        capabilities: ["text", "vision", "reasoning", "tools"],
        enabled: true,
        id: "moonshotai/Kimi-K2.5",
        name: "Kimi K2.5"
      },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1" }
    ],
    name: "Together.ai",
    apiStyle: "openai-compatible",
    type: "together"
  },
  {
    apiKey: "",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModelId: "qwen3.8-max",
    enabled: false,
    id: "aliyun-bailian",
    models: [
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "qwen3.8-max", name: "Qwen3.8 Max" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "qwen3.7-plus", name: "Qwen3.7 Plus" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "qwen3.7-flash", name: "Qwen3.7 Flash" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "qwen3.6-plus", name: "Qwen3.6 Plus" },
      { capabilities: ["text", "reasoning", "tools", "web"], enabled: true, id: "qwen3-max", name: "Qwen3 Max" },
      { capabilities: ["text", "tools"], enabled: true, id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "qwen3.5-flash", name: "Qwen3.5 Flash" }
    ],
    name: "Qwen",
    apiStyle: "openai-compatible",
    type: "openai-compatible"
  },
  {
    apiKey: "",
    baseUrl: "https://api.xiaomimimo.com/v1",
    defaultModelId: "mimo-v2.5-pro",
    enabled: false,
    id: "xiaomi-mimo",
    models: [
      { capabilities: ["text", "reasoning", "tools", "web"], enabled: true, id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "mimo-v2.5", name: "MiMo V2.5" },
      { capabilities: ["text", "tools", "web"], enabled: true, id: "mimo-v2.5-flash", name: "MiMo V2.5 Flash" }
    ],
    name: "Xiaomi MiMo",
    apiStyle: "openai-compatible",
    type: "openai-compatible"
  },
  {
    apiKey: "",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModelId: "doubao-seed-evolving",
    enabled: false,
    id: "volcengine",
    models: [
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "doubao-seed-evolving", name: "Doubao Seed Evolving" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "doubao-seed-2-1-pro-260628", name: "Doubao Seed 2.1 Pro" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "doubao-seed-2-1-turbo-260628", name: "Doubao Seed 2.1 Turbo" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "doubao-seed-1-6-flash-250715", name: "Doubao Seed 1.6 Flash" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "doubao-seed-1-6-thinking-250715", name: "Doubao Seed 1.6 Thinking" },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "deepseek-v3-2-250915", name: "DeepSeek V3.2" },
      { capabilities: ["text", "reasoning"], enabled: true, id: "deepseek-r1-250528", name: "DeepSeek R1" }
    ],
    name: "Volcengine Ark",
    apiStyle: "openai-compatible",
    type: "openai-compatible"
  },
  {
    apiKey: "",
    baseUrl: "https://api.x.ai/v1",
    defaultModelId: "grok-4.5",
    enabled: false,
    id: "xai",
    models: [
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "grok-4.5", name: "Grok 4.5" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "grok-4.3", name: "Grok 4.3" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "grok-4.3-fast", name: "Grok 4.3 Fast" }
    ],
    name: "xAI",
    apiStyle: "openai-compatible",
    type: "xai"
  },
  {
    apiKey: "",
    baseUrl: "https://your-resource-name.openai.azure.com",
    defaultModelId: "gpt-5.6-sol",
    enabled: false,
    id: "azure-openai",
    models: [
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.6-sol", name: "GPT-5.6 Sol deployment" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.6-terra", name: "GPT-5.6 Terra deployment" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.6-luna", name: "GPT-5.6 Luna deployment" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.4", name: "GPT-5.4 deployment" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.4-mini", name: "GPT-5.4 mini deployment" },
      { capabilities: ["text", "vision", "reasoning", "tools", "web"], enabled: true, id: "gpt-5.4-nano", name: "GPT-5.4 nano deployment" }
    ],
    name: "Azure OpenAI",
    apiStyle: "openai-compatible",
    type: "azure-openai"
  },
  {
    apiKey: "",
    baseUrl: "http://localhost:11434/v1",
    defaultModelId: "qwen3.5",
    enabled: false,
    id: "ollama",
    models: [
      { capabilities: ["text", "vision", "reasoning", "tools"], enabled: true, id: "qwen3.5", name: "Qwen3.5 9B" },
      { capabilities: ["text", "vision", "reasoning", "tools"], enabled: true, id: "gemma4:12b", name: "Gemma 4 12B" },
      { capabilities: ["text", "reasoning", "tools"], enabled: true, id: "gpt-oss:20b", name: "GPT-OSS 20B" },
      { capabilities: ["text"], enabled: true, id: "llama3.3", name: "Llama 3.3" },
      { capabilities: ["text"], enabled: true, id: "qwen3:32b", name: "Qwen3 32B" }
    ],
    name: "Ollama",
    apiStyle: "openai-compatible",
    type: "ollama"
  }
];

export const staleDefaultModelIdsByProviderId: Partial<Record<string, string[]>> = {
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-3-5"],
  "aliyun-bailian": ["qwen3.6-plus", "qwen3-max", "qwen3-coder-plus", "qwen3.5-flash"],
  "azure-openai": ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4o"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  google: ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-2.5-pro", "gemini-2.5-flash"],
  groq: ["llama-3.3-70b-versatile"],
  mistral: ["mistral-medium-latest", "mistral-small-latest", "mistral-large-latest", "devstral-latest"],
  ollama: ["llama3.3", "qwen3:32b", "gpt-oss:20b", "llama"],
  openai: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-image-2", "gpt-image-1.5", "gpt-5", "gpt-5-mini", "gpt-4o"],
  openrouter: ["openrouter/auto", "openai/gpt-5.5", "anthropic/claude-opus-4.7", "anthropic/claude-sonnet-4.6", "google/gemini-3.1-pro-preview"],
  together: ["moonshotai/Kimi-K2.5", "openai/gpt-oss-120b", "deepseek-ai/DeepSeek-R1", "meta-llama/Llama-3.3-70B-Instruct-Turbo"],
  volcengine: ["doubao-seed-1-6-flash-250715", "doubao-seed-1-6-thinking-250715", "deepseek-v3-2-250915", "deepseek-r1-250528"],
  xai: ["grok-4.3", "grok-4.3-fast", "grok-4"]
};

export const previousDefaultModelIdsByProviderId: Partial<Record<string, string[]>> = {
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
  "aliyun-bailian": ["qwen3.6-plus", "qwen3-max", "qwen3-coder-plus", "qwen3.5-flash"],
  "azure-openai": ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"],
  google: ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"],
  mistral: ["mistral-medium-latest", "mistral-small-latest", "mistral-large-latest", "devstral-latest"],
  ollama: ["llama3.3", "qwen3:32b", "gpt-oss:20b"],
  openai: ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-image-2"],
  openrouter: ["openrouter/auto", "openai/gpt-5.5", "anthropic/claude-opus-4.7", "anthropic/claude-sonnet-4.6", "google/gemini-3.1-pro-preview"],
  together: ["moonshotai/Kimi-K2.5", "openai/gpt-oss-120b", "deepseek-ai/DeepSeek-R1"],
  volcengine: ["doubao-seed-1-6-flash-250715", "doubao-seed-1-6-thinking-250715", "deepseek-v3-2-250915", "deepseek-r1-250528"],
  xai: ["grok-4.3", "grok-4.3-fast"]
};

export function defaultProviderTemplateForProviderId(providerId: string): AiProviderConfigSeed | undefined {
  return defaultProviderTemplates.find((provider) => provider.id === providerId);
}

export function defaultApiUrlForApiStyle(apiStyle: AiProviderApiStyle) {
  return defaultApiUrlByApiStyle[apiStyle] ?? "";
}

export function defaultApiUrlForRequestStyle(apiStyle: AiProviderRequestStyle) {
  return defaultApiUrlByRequestStyle[apiStyle] ?? "";
}

export function defaultApiUrlForStoredProvider(providerId: string, type: AiProviderApiStyle) {
  if (providerId.startsWith("custom-provider-")) return "";

  return defaultProviderTemplateForProviderId(providerId)?.baseUrl ?? defaultApiUrlForApiStyle(type);
}
