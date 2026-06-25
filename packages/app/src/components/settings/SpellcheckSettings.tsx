import { AlertTriangle, Check, Download, LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button, IconButton } from "@markra/ui";
import type { EditorPreferences } from "../../lib/settings/app-settings";
import { normalizeSpellcheckIgnoredWords } from "../../lib/settings/app-settings";
import {
  deleteAppSpellcheckDictionaryForLanguage,
  downloadAppSpellcheckDictionaryForLanguage,
  getAppSpellcheckDictionaryStatusForLanguage,
  loadAppSpellcheckDictionaryManifests,
  spellcheckDictionaryManifests,
  spellcheckDictionaryManifestForLanguage
} from "../../lib/spellcheck";
import { spellcheckLanguageOptions, type SpellcheckLanguage } from "../../lib/spellcheck-languages";
import { SettingsRow, SettingsSection, SettingsSwitch } from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

type DictionaryDownloadStatus = "deleted" | "deleting" | "downloaded" | "downloading" | "failed" | "idle";

export function SpellcheckSettings({
  preferences,
  translate,
  onUpdatePreferences
}: {
  preferences: EditorPreferences;
  translate: SettingsTranslate;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
}) {
  const [downloadStatuses, setDownloadStatuses] = useState<Partial<Record<SpellcheckLanguage, DictionaryDownloadStatus>>>({});
  const [dictionaryManifests, setDictionaryManifests] = useState(spellcheckDictionaryManifests);
  const [allDownloading, setAllDownloading] = useState(false);
  const [whitelistWordInput, setWhitelistWordInput] = useState("");
  const interactionVersionRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    loadAppSpellcheckDictionaryManifests()
      .then((manifests) => {
        if (mounted) setDictionaryManifests(manifests);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const statusCheckVersion = interactionVersionRef.current;

    Promise.all(
      spellcheckLanguageOptions.map(async (language) => {
        try {
          const status = await getAppSpellcheckDictionaryStatusForLanguage(
            language.code,
            spellcheckDictionaryManifestForLanguage(language.code, dictionaryManifests)
          );

          return [language.code, status.downloaded ? "downloaded" : "idle"] as const;
        } catch {
          return [language.code, null] as const;
        }
      })
    ).then((results) => {
      if (!mounted) return;
      if (interactionVersionRef.current !== statusCheckVersion) return;
      setDownloadStatuses((statuses) => {
        const next = { ...statuses };

        for (const [language, status] of results) {
          if (status === null) continue;
          if (next[language] && next[language] !== "idle") continue;
          next[language] = status;
        }

        return next;
      });
    }).catch(() => {});

    return () => {
      mounted = false;
    };
  }, [dictionaryManifests]);

  async function handleDownload(language: SpellcheckLanguage, options: { forceDownload?: boolean } = {}) {
    interactionVersionRef.current += 1;
    setDownloadStatuses((statuses) => ({ ...statuses, [language]: "downloading" }));

    try {
      await downloadAppSpellcheckDictionaryForLanguage(language, {
        ...options,
        manifest: spellcheckDictionaryManifestForLanguage(language, dictionaryManifests)
      });
      setDownloadStatuses((statuses) => ({ ...statuses, [language]: "downloaded" }));
      onUpdatePreferences({
        ...preferences,
        spellcheckLanguage: language
      });
    } catch {
      setDownloadStatuses((statuses) => ({ ...statuses, [language]: "failed" }));
    }
  }

  async function handleDownloadAll() {
    interactionVersionRef.current += 1;
    setAllDownloading(true);
    setDownloadStatuses((statuses) => ({
      ...statuses,
      ...Object.fromEntries(spellcheckLanguageOptions.map((language) => [language.code, "downloading"]))
    }));

    const results = await Promise.all(
      spellcheckLanguageOptions.map(async (language) => {
        try {
          await downloadAppSpellcheckDictionaryForLanguage(language.code, {
            manifest: spellcheckDictionaryManifestForLanguage(language.code, dictionaryManifests)
          });
          return [language.code, "downloaded"] as const;
        } catch {
          return [language.code, "failed"] as const;
        }
      })
    );

    setDownloadStatuses((statuses) => ({
      ...statuses,
      ...Object.fromEntries(results)
    }));
    setAllDownloading(false);
  }

  async function handleDelete(language: SpellcheckLanguage) {
    interactionVersionRef.current += 1;
    setDownloadStatuses((statuses) => ({ ...statuses, [language]: "deleting" }));

    try {
      await deleteAppSpellcheckDictionaryForLanguage(
        language,
        spellcheckDictionaryManifestForLanguage(language, dictionaryManifests)
      );
      setDownloadStatuses((statuses) => ({ ...statuses, [language]: "deleted" }));
    } catch {
      setDownloadStatuses((statuses) => ({ ...statuses, [language]: "failed" }));
    }
  }

  function handleRemoveIgnoredWord(word: string) {
    onUpdatePreferences({
      ...preferences,
      spellcheckIgnoredWords: preferences.spellcheckIgnoredWords.filter((ignoredWord) => ignoredWord !== word)
    });
  }

  function handleClearIgnoredWords() {
    onUpdatePreferences({
      ...preferences,
      spellcheckIgnoredWords: []
    });
  }

  function handleAddIgnoredWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAddIgnoredWord) return;

    onUpdatePreferences({
      ...preferences,
      spellcheckIgnoredWords: normalizeSpellcheckIgnoredWords([...preferences.spellcheckIgnoredWords, whitelistWordInput])
    });
    setWhitelistWordInput("");
  }

  function downloadButtonText(status: DictionaryDownloadStatus) {
    if (status === "downloading") return translate("settings.editor.spellcheckDownloading");
    if (status === "downloaded") return translate("settings.editor.spellcheckDownloaded");
    if (status === "failed") return translate("settings.editor.spellcheckRetryDownload");

    return translate("settings.editor.spellcheckDownload");
  }

  function downloadIcon(status: DictionaryDownloadStatus) {
    if (status === "downloading") return <LoaderCircle className="animate-spin" size={13} aria-hidden="true" />;
    if (status === "downloaded") return <Check size={13} aria-hidden="true" />;
    if (status === "failed") return <AlertTriangle size={13} aria-hidden="true" />;

    return <Download size={13} aria-hidden="true" />;
  }

  const downloadAllLabel = allDownloading
    ? translate("settings.editor.spellcheckDownloading")
    : translate("settings.editor.spellcheckDownloadAll");
  const ignoredWords = preferences.spellcheckIgnoredWords;
  const normalizedWhitelistWordInput = whitelistWordInput.trim().toLocaleLowerCase();
  const canAddIgnoredWord =
    normalizedWhitelistWordInput.length > 0 && !ignoredWords.includes(normalizedWhitelistWordInput);
  const ignoredWordCountLabel =
    ignoredWords.length === 1
      ? `1 ${translate("settings.editor.spellcheckWhitelistWordCountSingular")}`
      : `${ignoredWords.length} ${translate("settings.editor.spellcheckWhitelistWordCountPlural")}`;

  return (
    <SettingsSection label={translate("settings.categories.spellcheck")}>
      <SettingsRow
        title={translate("settings.editor.spellcheck")}
        description={translate("settings.editor.spellcheckDescription")}
        action={
          <SettingsSwitch
            checked={preferences.spellcheckEnabled}
            label={translate("settings.editor.spellcheck")}
            onChange={() =>
              onUpdatePreferences({
                ...preferences,
                spellcheckEnabled: !preferences.spellcheckEnabled
              })
            }
          />
        }
      />
      <div className="py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h4 className="m-0 text-[12px] leading-5 font-bold tracking-normal text-(--text-secondary)">
              {translate("settings.editor.spellcheckWhitelist")}
            </h4>
            {ignoredWords.length > 0 ? (
              <span className="text-[11px] leading-4 font-[560] text-(--text-secondary)">
                {ignoredWordCountLabel}
              </span>
            ) : null}
          </div>
          {ignoredWords.length > 0 ? (
            <Button
              className="h-7 px-2"
              size="sm"
              variant="ghost"
              aria-label={translate("settings.editor.spellcheckWhitelistClear")}
              onClick={handleClearIgnoredWords}
            >
              {translate("settings.editor.spellcheckWhitelistClear")}
            </Button>
          ) : null}
        </div>
        {ignoredWords.length === 0 ? (
          <p className="m-0 mt-1 text-[11px] leading-4 font-[450] text-(--text-secondary)">
            {translate("settings.editor.spellcheckWhitelistEmpty")}
          </p>
        ) : null}
        <div
          className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-(--border-default) bg-(--bg-secondary) p-2"
          role="list"
          aria-label={translate("settings.editor.spellcheckWhitelistWords")}
        >
          {ignoredWords.map((word) => {
            const removeLabel = `${translate("settings.editor.spellcheckWhitelistRemove")} ${word}`;

            return (
              <div
                key={word}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-(--border-default) bg-(--bg-primary) py-0.5 pr-0.5 pl-2 text-(--text-heading)"
                role="listitem"
              >
                <span className="max-w-48 truncate text-[12px] leading-5 font-[560]">{word}</span>
                <IconButton
                  label={removeLabel}
                  size="icon-xs"
                  tooltip={removeLabel}
                  variant="ghost"
                  onClick={() => handleRemoveIgnoredWord(word)}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </IconButton>
              </div>
            );
          })}
          <form
            className="inline-flex w-28 max-w-full flex-none items-center gap-1 rounded-full border border-(--border-default) bg-(--bg-primary) py-0.5 pr-0.5 pl-2"
            role="listitem"
            onSubmit={handleAddIgnoredWord}
          >
            <input
              className="h-6 min-w-0 flex-1 bg-transparent px-1 text-[12px] leading-5 font-[560] text-(--text-heading) placeholder:text-(--text-secondary) focus-visible:outline-none"
              type="text"
              aria-label={translate("settings.editor.spellcheckWhitelistInput")}
              value={whitelistWordInput}
              placeholder={translate("settings.editor.spellcheckWhitelistInputPlaceholder")}
              onChange={(event) => setWhitelistWordInput(event.currentTarget.value)}
            />
            <IconButton
              disabled={!canAddIgnoredWord}
              label={translate("settings.editor.spellcheckWhitelistAddLabel")}
              size="icon-xs"
              tooltip={translate("settings.editor.spellcheckWhitelistAddLabel")}
              type="submit"
              variant="ghost"
            >
              <Plus size={13} aria-hidden="true" />
            </IconButton>
          </form>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h4 className="m-0 text-[12px] leading-5 font-bold tracking-normal text-(--text-secondary)">
          {translate("settings.editor.spellcheckLanguagePacks")}
        </h4>
        <Button
          className="h-7 gap-1.5 px-2"
          disabled={allDownloading}
          size="sm"
          variant="ghost"
          aria-label={translate("settings.editor.spellcheckDownloadAllLabel")}
          onClick={handleDownloadAll}
        >
          {allDownloading ? (
            <LoaderCircle className="animate-spin" size={13} aria-hidden="true" />
          ) : (
            <Download size={13} aria-hidden="true" />
          )}
          {downloadAllLabel}
        </Button>
      </div>
      <div className="mt-1 divide-y divide-(--border-default)">
        {spellcheckLanguageOptions.map((language) => {
          const status = downloadStatuses[language.code] ?? "idle";
          const disabled = status === "deleting" || status === "downloading";
          const showRedownload = status === "downloaded";
          const downloadLabel = `${downloadButtonText(status)} ${language.label} dictionary`;
          const redownloadLabel = `${translate("settings.editor.spellcheckRedownload")} ${language.label} dictionary`;
          const actionLabel = showRedownload ? redownloadLabel : downloadLabel;
          const deleteLabel = `${translate("settings.editor.spellcheckDelete")} ${language.label} dictionary`;
          const manifest = spellcheckDictionaryManifestForLanguage(language.code, dictionaryManifests);

          return (
            <div
              key={language.code}
              className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-baseline gap-2">
                  <p className="m-0 truncate text-[13px] leading-5 font-[650] text-(--text-heading)">
                    {language.label}
                  </p>
                  {status === "downloaded" ? (
                    <span className="text-[11px] leading-4 font-[560] text-(--text-secondary)">
                      {translate("settings.editor.spellcheckDownloaded")}
                    </span>
                  ) : null}
                </div>
                <p className="m-0 text-[11px] leading-4 font-[450] text-(--text-secondary)">
                  v{manifest.version} · {formatDictionarySize(manifest.sizeBytes)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <IconButton
                  disabled={disabled}
                  label={actionLabel}
                  size="icon-xs"
                  tooltip={actionLabel}
                  variant="ghost"
                  onClick={() => handleDownload(language.code, showRedownload ? { forceDownload: true } : {})}
                >
                  {showRedownload ? <RefreshCw size={13} aria-hidden="true" /> : downloadIcon(status)}
                </IconButton>
                <IconButton
                  disabled={disabled}
                  label={deleteLabel}
                  size="icon-xs"
                  tooltip={deleteLabel}
                  variant="ghost"
                  onClick={() => handleDelete(language.code)}
                >
                  {status === "deleting" ? (
                    <LoaderCircle className="animate-spin" size={13} aria-hidden="true" />
                  ) : (
                    <Trash2 size={13} aria-hidden="true" />
                  )}
                </IconButton>
              </div>
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
}

function formatDictionarySize(sizeBytes: number) {
  if (sizeBytes < 1_000_000) return `${Math.round(sizeBytes / 1_000)} KB`;

  return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
}
