import azureAiLogo from "../assets/provider-logos/azure-ai.svg";
import claudeLogo from "../assets/provider-logos/claude.svg";
import deepseekLogo from "../assets/provider-logos/deepseek.svg";
import geminiLogo from "../assets/provider-logos/gemini.svg";
import grokLogo from "../assets/provider-logos/grok.svg";
import groqLogo from "../assets/provider-logos/groq.svg";
import mistralLogo from "../assets/provider-logos/mistral.svg";
import ollamaLogo from "../assets/provider-logos/ollama.svg";
import openAiLogo from "../assets/provider-logos/openai.svg";
import openRouterLogo from "../assets/provider-logos/openrouter.svg";
import orcaRouterLogo from "../assets/provider-logos/orcarouter.png";
import qwenLogo from "../assets/provider-logos/qwen.svg";
import requestyLogo from "../assets/provider-logos/requesty.svg";
import togetherLogo from "../assets/provider-logos/together.svg";
import volcengineLogo from "../assets/provider-logos/volcengine.svg";
import xiaomiMimoLogo from "../assets/provider-logos/xiaomi-mimo.svg";
import type { AiProviderApiStyle, AiProviderConfig, AiProviderRequestStyle } from "@markra/providers";
import type { I18nKey } from "@markra/shared";

type Translate = (key: I18nKey) => string;

const providerLogoByType: Partial<Record<AiProviderApiStyle, string>> = {
  anthropic: claudeLogo,
  "azure-openai": azureAiLogo,
  deepseek: deepseekLogo,
  google: geminiLogo,
  groq: groqLogo,
  mistral: mistralLogo,
  ollama: ollamaLogo,
  openai: openAiLogo,
  openrouter: openRouterLogo,
  together: togetherLogo,
  xai: grokLogo
};

const providerLogoById: Partial<Record<string, string>> = {
  orcarouter: orcaRouterLogo,
  requesty: requestyLogo,
  "aliyun-bailian": qwenLogo,
  "volcengine": volcengineLogo,
  "xiaomi-mimo": xiaomiMimoLogo
};

export function aiProviderApiStyleLabel(type: AiProviderApiStyle | AiProviderRequestStyle, translate: Translate) {
  const requestStyleLabels: Partial<Record<AiProviderRequestStyle, string>> = {
    anthropic: "Anthropic",
    google: "Google (Gemini)",
    "openai-responses": "OpenAI Responses"
  };
  if (type === "openai-compatible") return translate("settings.ai.apiStyleOpenAiCompatible");
  if (type in requestStyleLabels) return requestStyleLabels[type as AiProviderRequestStyle] ?? type;

  const labels: Partial<Record<AiProviderApiStyle, string>> = {
    anthropic: "Anthropic",
    "azure-openai": "Azure OpenAI",
    deepseek: "DeepSeek",
    google: "Google",
    groq: "Groq",
    mistral: "Mistral",
    ollama: "Ollama",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    together: "Together.ai",
    xai: "xAI"
  };

  return labels[type as AiProviderApiStyle] ?? type;
}

export function AiProviderBadge({ provider, translate }: { provider: AiProviderConfig; translate: Translate }) {
  const logo = providerLogoById[provider.id] ?? providerLogoByType[provider.type];

  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-(--border-default) bg-[oklch(0.985_0.004_255)] leading-4 font-[750] text-(--accent)">
      {logo ? (
        <img
          className="size-5 object-contain"
          src={logo}
          alt={`${provider.name} ${translate("settings.ai.providerLogo")}`}
          draggable={false}
        />
      ) : (
        provider.name.slice(0, 2)
      )}
    </span>
  );
}
