import { useEffect, useState } from "react";
import type { PluginStorage } from "@markra/plugin-api";
import {
  SettingsCheckbox,
  SettingsNumberInput,
  SettingsRow,
  SettingsSection,
  SettingsSwitch
} from "@markra/plugin-api/react";
import {
  defaultDocumentStatsOptions,
  normalizeDocumentStatsOptions,
  type DocumentStatsOptions
} from "./stats";
import { loadDocumentStatsOptions, saveDocumentStatsOptions } from "./storage";

type DocumentStatsSettingsProps = {
  storage?: PluginStorage;
};

export function DocumentStatsSettings({ storage }: DocumentStatsSettingsProps) {
  const [options, setOptions] = useState<DocumentStatsOptions>(defaultDocumentStatsOptions);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;

    loadDocumentStatsOptions(storage)
      .then((storedOptions) => {
        if (!cancelled) setOptions(storedOptions);
      })
      .catch(() => {
        if (!cancelled) setSaveStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [storage]);

  const updateOptions = (nextOptions: DocumentStatsOptions) => {
    const normalizedOptions = normalizeDocumentStatsOptions(nextOptions);
    setOptions(normalizedOptions);
    setSaveStatus("idle");
    saveDocumentStatsOptions(storage, normalizedOptions)
      .then(() => setSaveStatus("saved"))
      .catch(() => setSaveStatus("failed"));
  };

  return (
    <SettingsSection
      label="Behavior"
      footer={
        saveStatus === "saved" ? (
          <span className="text-[12px] leading-5 font-[520] text-(--text-secondary)">Saved</span>
        ) : saveStatus === "failed" ? (
          <span className="text-[12px] leading-5 font-[520] text-(--text-heading)">Could not save settings</span>
        ) : null
      }
    >
      <SettingsRow
        title="Reading speed"
        description="Used to estimate reading time."
        action={
          <SettingsNumberInput
            label="Reading speed"
            min={50}
            max={1000}
            step={10}
            unit="words/min"
            value={options.readingSpeed}
            onValueChange={(readingSpeed) => updateOptions({ ...options, readingSpeed })}
          />
        }
      />
      <SettingsRow
        title="Code blocks"
        description="Include fenced code block content in word and character counts."
        action={
          <SettingsSwitch
            checked={options.countCodeBlocks}
            label="Count code blocks"
            onCheckedChange={(countCodeBlocks) => updateOptions({ ...options, countCodeBlocks })}
          />
        }
      />
      <SettingsRow
        title="Frontmatter"
        description="Include YAML frontmatter at the top of a document."
        action={
          <SettingsCheckbox
            checked={options.countFrontmatter}
            label="Count frontmatter"
            onCheckedChange={(countFrontmatter) => updateOptions({ ...options, countFrontmatter })}
          />
        }
      />
    </SettingsSection>
  );
}
