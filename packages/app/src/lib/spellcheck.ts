import { createAsyncCspellTrieSpellchecker, type Spellchecker } from "@markra/editor";
import type { AppLanguage } from "@markra/shared";
import { decodeTrie } from "cspell-trie-lib";
import {
  deleteNativeSpellcheckDictionary,
  getNativeSpellcheckDictionaryStatus,
  loadNativeSpellcheckDictionary,
  type NativeSpellcheckDictionaryManifest
} from "./tauri/spellcheck";
import { requestNativeWebResource } from "./tauri/web-resource";
import type { SpellcheckLanguage } from "./spellcheck-languages";

const dictionaryReleaseBaseUrl = "https://github.com/markrahq/markra-dictionaries/releases/download/spellcheck-v1";
const dictionaryReleaseManifestUrl = `${dictionaryReleaseBaseUrl}/markra-spellcheck.manifest.json`;

type SpellcheckDictionaryManifestKey = "de" | "en" | "es" | "fr" | "it" | "ptBR" | "ru";
export type SpellcheckDictionaryManifestSet = Record<SpellcheckDictionaryManifestKey, NativeSpellcheckDictionaryManifest>;

export const spellcheckDictionaryManifests: SpellcheckDictionaryManifestSet = {
  de: {
    id: "de-DE",
    sha256: "88c214f1cd474cfea22bb71f6e026afe220e43c9f53536aab93bcb54e89ef199",
    sizeBytes: 4_959_272,
    url: `${dictionaryReleaseBaseUrl}/de_DE-4.1.2.trie`,
    version: "4.1.2"
  },
  en: {
    id: "en-US",
    sha256: "45edd565d3ef05538312b066cf94c1365bc8f67662a71f88a0cb75cbf56ef1c6",
    sizeBytes: 670_078,
    url: `${dictionaryReleaseBaseUrl}/en_US-4.4.35.trie`,
    version: "4.4.35"
  },
  es: {
    id: "es-ES",
    sha256: "c34b8795b7b01451677dfc0d62d34a192a15468a0611df920517ff98e8a52ab1",
    sizeBytes: 767_719,
    url: `${dictionaryReleaseBaseUrl}/es_ES-3.0.8.trie`,
    version: "3.0.8"
  },
  fr: {
    id: "fr-FR",
    sha256: "e091aa6bb68539a71b3a87327181befadfccaa2f84fad3185b786c2512ac32c2",
    sizeBytes: 4_470_106,
    url: `${dictionaryReleaseBaseUrl}/fr_FR-2.3.2.trie`,
    version: "2.3.2"
  },
  it: {
    id: "it-IT",
    sha256: "6e0e9e805c3391a378276b71f8bfcdcd6e0c74d8631cdf9919566ef70b34f27d",
    sizeBytes: 1_468_664,
    url: `${dictionaryReleaseBaseUrl}/it_IT-3.1.6.trie`,
    version: "3.1.6"
  },
  ptBR: {
    id: "pt-BR",
    sha256: "006d09c6612a71436d90303ab7242849b219f4c1f4053c247b702d9d383a6a68",
    sizeBytes: 4_320_636,
    url: `${dictionaryReleaseBaseUrl}/pt_BR-2.4.2.trie`,
    version: "2.4.2"
  },
  ru: {
    id: "ru-RU",
    sha256: "4f3632ee7864ff4087fe75c1831b6a682c35e0880d96de11f54e9cf3c27f5cec",
    sizeBytes: 6_042_115,
    url: `${dictionaryReleaseBaseUrl}/ru_RU-2.3.2.trie`,
    version: "2.3.2"
  }
};

export const defaultSpellcheckDictionaryManifest = spellcheckDictionaryManifests.en;
let spellcheckDictionaryManifestCache: Promise<SpellcheckDictionaryManifestSet> | null = null;

export function spellcheckDictionaryManifestForLanguage(
  language: AppLanguage,
  manifests: SpellcheckDictionaryManifestSet = spellcheckDictionaryManifests
): NativeSpellcheckDictionaryManifest {
  return manifests[spellcheckDictionaryManifestKeyForLanguage(language)];
}

function spellcheckDictionaryManifestKeyForLanguage(language: AppLanguage): SpellcheckDictionaryManifestKey {
  switch (language) {
    case "de":
      return "de";
    case "es":
      return "es";
    case "fr":
      return "fr";
    case "it":
      return "it";
    case "pt-BR":
      return "ptBR";
    case "ru":
      return "ru";
    case "en":
    case "ja":
    case "ko":
    case "zh-CN":
    case "zh-TW":
      return "en";
  }
}

export function loadAppSpellcheckDictionaryManifests(): Promise<SpellcheckDictionaryManifestSet> {
  if (!spellcheckDictionaryManifestCache) {
    spellcheckDictionaryManifestCache = requestNativeWebResource({ url: dictionaryReleaseManifestUrl })
      .then((response) => {
        if (response.status < 200 || response.status >= 300) return spellcheckDictionaryManifests;

        return mergeRemoteSpellcheckDictionaryManifests(response.body);
      })
      .catch(() => spellcheckDictionaryManifests);
  }

  return spellcheckDictionaryManifestCache;
}

export function resetAppSpellcheckDictionaryManifestCacheForTests() {
  spellcheckDictionaryManifestCache = null;
}

function mergeRemoteSpellcheckDictionaryManifests(body: string): SpellcheckDictionaryManifestSet {
  const parsed = JSON.parse(body) as unknown;
  if (!isRecord(parsed)) return spellcheckDictionaryManifests;
  if (!isRecord(parsed.dictionaries)) return spellcheckDictionaryManifests;

  return {
    ...spellcheckDictionaryManifests,
    ...manifestOverrideForLanguage(parsed.dictionaries, "de", "de"),
    ...manifestOverrideForLanguage(parsed.dictionaries, "en", "en"),
    ...manifestOverrideForLanguage(parsed.dictionaries, "es", "es"),
    ...manifestOverrideForLanguage(parsed.dictionaries, "fr", "fr"),
    ...manifestOverrideForLanguage(parsed.dictionaries, "it", "it"),
    ...manifestOverrideForLanguage(parsed.dictionaries, "pt-BR", "ptBR"),
    ...manifestOverrideForLanguage(parsed.dictionaries, "ru", "ru")
  };
}

function manifestOverrideForLanguage(
  dictionaries: Record<string, unknown>,
  releaseLanguage: SpellcheckLanguage,
  manifestKey: SpellcheckDictionaryManifestKey
): Partial<SpellcheckDictionaryManifestSet> {
  const manifest = nativeManifestFromReleaseDictionary(dictionaries[releaseLanguage]);

  return manifest ? { [manifestKey]: manifest } : {};
}

function nativeManifestFromReleaseDictionary(value: unknown): NativeSpellcheckDictionaryManifest | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string") return null;
  if (typeof value.version !== "string") return null;
  if (typeof value.url !== "string") return null;
  if (typeof value.sha256 !== "string") return null;
  if (typeof value.size !== "number" || !Number.isFinite(value.size) || value.size <= 0) return null;

  return {
    id: value.id,
    version: value.version,
    url: value.url,
    sha256: value.sha256,
    sizeBytes: value.size
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createAppSpellchecker(
  manifest: NativeSpellcheckDictionaryManifest = defaultSpellcheckDictionaryManifest
): Spellchecker {
  return createAsyncCspellTrieSpellchecker(async () => {
    const dictionary = await loadNativeSpellcheckDictionary(manifest, { allowDownload: false });

    return decodeTrie(dictionary.contents);
  });
}

export function createAppSpellcheckerForLanguage(language: SpellcheckLanguage): Spellchecker {
  return createAsyncCspellTrieSpellchecker(async () => {
    const manifests = await loadAppSpellcheckDictionaryManifests();
    const dictionary = await loadNativeSpellcheckDictionary(
      spellcheckDictionaryManifestForLanguage(language, manifests),
      { allowDownload: false }
    );

    return decodeTrie(dictionary.contents);
  });
}

export type DownloadAppSpellcheckDictionaryOptions = {
  forceDownload?: boolean;
  manifest?: NativeSpellcheckDictionaryManifest;
};

export async function downloadAppSpellcheckDictionaryForLanguage(
  language: SpellcheckLanguage,
  options: DownloadAppSpellcheckDictionaryOptions = {}
) {
  return loadNativeSpellcheckDictionary(options.manifest ?? spellcheckDictionaryManifestForLanguage(language), {
    allowDownload: true,
    forceDownload: options.forceDownload ?? false
  });
}

export async function deleteAppSpellcheckDictionaryForLanguage(
  language: SpellcheckLanguage,
  manifest = spellcheckDictionaryManifestForLanguage(language)
) {
  return deleteNativeSpellcheckDictionary(manifest);
}

export async function getAppSpellcheckDictionaryStatusForLanguage(
  language: SpellcheckLanguage,
  manifest = spellcheckDictionaryManifestForLanguage(language)
) {
  return getNativeSpellcheckDictionaryStatus(manifest);
}

export const defaultAppSpellchecker = createAppSpellcheckerForLanguage("en");
