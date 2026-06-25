import { Brain, Eye, Globe2, ImageIcon, Type, Wrench, type LucideIcon } from "lucide-react";
import type { AiModelCapability } from "@markra/providers";
import type { I18nKey } from "@markra/shared";
import { Badge } from "@markra/ui";

type Translate = (key: I18nKey) => string;

export const aiModelCapabilities: AiModelCapability[] = ["text", "vision", "image", "reasoning", "tools", "web"];

const modelCapabilityLabelKeys: Record<AiModelCapability, I18nKey> = {
  image: "settings.ai.capabilityImage",
  reasoning: "settings.ai.capabilityReasoning",
  text: "settings.ai.capabilityText",
  tools: "settings.ai.capabilityTools",
  vision: "settings.ai.capabilityVision",
  web: "settings.ai.capabilityWeb"
};

const capabilityIcons: Record<AiModelCapability, LucideIcon> = {
  image: ImageIcon,
  reasoning: Brain,
  text: Type,
  tools: Wrench,
  vision: Eye,
  web: Globe2
};

const capabilityPillClasses: Record<AiModelCapability, string> = {
  image: "bg-[oklch(0.95_0.075_315)] text-[oklch(0.48_0.18_315)]",
  reasoning: "bg-[oklch(0.95_0.04_270)] text-[oklch(0.48_0.13_270)]",
  text: "bg-[oklch(0.96_0.004_255)] text-(--text-secondary)",
  tools: "bg-[oklch(0.95_0.07_55)] text-[oklch(0.5_0.14_55)]",
  vision: "bg-[oklch(0.94_0.055_155)] text-[oklch(0.45_0.14_155)]",
  web: "bg-[oklch(0.95_0.055_250)] text-[oklch(0.48_0.14_250)]"
};

export function modelCapabilityLabel(capability: AiModelCapability, translate: Translate) {
  return translate(modelCapabilityLabelKeys[capability]);
}

export function toggleModelCapability(capabilities: AiModelCapability[], capability: AiModelCapability) {
  if (capabilities.includes(capability)) return capabilities.filter((item) => item !== capability);

  return aiModelCapabilities.filter((item) => item === capability || capabilities.includes(item));
}

function CapabilityPill({ capability, translate }: { capability: AiModelCapability; translate: Translate }) {
  const Icon = capabilityIcons[capability];
  const label = modelCapabilityLabel(capability, translate);

  return (
    <Badge
      className={capabilityPillClasses[capability]}
      aria-label={label}
      tooltip={label}
    >
      <Icon aria-hidden="true" size={13} strokeWidth={2.1} />
      <span className="sr-only">{label}</span>
    </Badge>
  );
}

export function CapabilityPills({
  capabilities,
  translate
}: {
  capabilities: AiModelCapability[];
  translate: Translate;
}) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {capabilities.map((capability) => (
        <CapabilityPill key={capability} capability={capability} translate={translate} />
      ))}
    </span>
  );
}

export function CapabilityPicker({
  label,
  onChange,
  translate,
  value
}: {
  label: string;
  onChange: (value: AiModelCapability[]) => unknown;
  translate: Translate;
  value: AiModelCapability[];
}) {
  return (
    <fieldset className="grid gap-1.5" aria-label={label}>
      <legend className="text-[12px] leading-5 font-[650] text-(--text-secondary)">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {aiModelCapabilities.map((capability) => {
          const Icon = capabilityIcons[capability];
          const isSelected = value.includes(capability);
          const capabilityLabel = modelCapabilityLabel(capability, translate);

          return (
            <button
              className={`inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2.5 text-[12px] leading-4 font-bold transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) ${
                isSelected
                  ? `${capabilityPillClasses[capability]} border-transparent`
                  : "border-(--border-default) bg-(--bg-primary) text-(--text-secondary) hover:bg-(--bg-hover)"
              }`}
              key={capability}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(toggleModelCapability(value, capability))}
            >
              <Icon aria-hidden="true" size={13} strokeWidth={2.1} />
              {capabilityLabel}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
