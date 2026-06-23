import { createTrieRootFromList, serializeTrie } from "cspell-trie-lib";
import type { AppLanguage } from "@markra/shared";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../runtime";
import {
  createAppSpellcheckerForLanguage,
  createAppSpellchecker,
  defaultSpellcheckDictionaryManifest,
  deleteAppSpellcheckDictionaryForLanguage,
  downloadAppSpellcheckDictionaryForLanguage,
  getAppSpellcheckDictionaryStatusForLanguage,
  loadAppSpellcheckDictionaryManifests,
  resetAppSpellcheckDictionaryManifestCacheForTests,
  spellcheckDictionaryManifestForLanguage,
  spellcheckDictionaryManifests
} from "./spellcheck";

function trieSourceFromWords(words: readonly string[]) {
  const trie = createTrieRootFromList(words);

  return Array.from(serializeTrie(trie)).join("\n");
}

describe("app spellcheck", () => {
  afterEach(() => {
    resetAppSpellcheckDictionaryManifestCacheForTests();
    resetAppRuntimeForTests();
  });

  it("loads dictionary metadata from the remote spellcheck manifest", async () => {
    const requestWebResource = vi.fn(async () => ({
      body: JSON.stringify({
        releaseTag: "spellcheck-test",
        dictionaries: {
          fr: {
            id: "fr-FR",
            version: "9.9.9",
            url: "https://example.test/releases/spellcheck-test/fr.trie",
            sha256: "f".repeat(64),
            size: 12_345_678,
            sourcePackage: "@example/dict-fr@9.9.9",
            license: "MIT"
          }
        }
      }),
      contentType: "application/json",
      finalUrl: "https://example.test/releases/spellcheck-test/manifest.json",
      status: 200
    }));
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      webResource: {
        requestWebResource
      }
    });

    const manifests = await loadAppSpellcheckDictionaryManifests();

    expect(requestWebResource).toHaveBeenCalledWith({
      url: "https://github.com/markrahq/markra-dictionaries/releases/download/spellcheck-v1/markra-spellcheck.manifest.json"
    });
    expect(manifests.fr).toEqual({
      id: "fr-FR",
      version: "9.9.9",
      url: "https://example.test/releases/spellcheck-test/fr.trie",
      sha256: "f".repeat(64),
      sizeBytes: 12_345_678
    });
    expect(manifests.en).toBe(spellcheckDictionaryManifests.en);
  });

  it("falls back to bundled dictionary metadata when the remote manifest fails", async () => {
    const requestWebResource = vi.fn(async () => {
      throw new Error("offline");
    });
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      webResource: {
        requestWebResource
      }
    });

    await expect(loadAppSpellcheckDictionaryManifests()).resolves.toEqual(spellcheckDictionaryManifests);
  });

  it("loads the default dictionary through the app runtime manifest", async () => {
    const loadSpellcheckDictionary = vi.fn(async () => ({
      contents: trieSourceFromWords(["a", "and", "document", "environment", "mentions", "this"]),
      source: "download" as const
    }));
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      spellcheck: {
        ...createDefaultAppRuntime().spellcheck,
        loadSpellcheckDictionary
      }
    });

    const spellchecker = createAppSpellchecker();

    expect(spellchecker.isReady?.()).toBe(false);

    await spellchecker.load?.();

    expect(loadSpellcheckDictionary).toHaveBeenCalledWith(defaultSpellcheckDictionaryManifest, { allowDownload: false });
    expect(spellchecker.check("environment")).toBe(true);
    expect(spellchecker.check("acommodate")).toBe(false);
  });

  it.each([
    ["en", "en-US", "en_US-4.4.35.trie"],
    ["fr", "fr-FR", "fr_FR-2.3.2.trie"],
    ["de", "de-DE", "de_DE-4.1.2.trie"],
    ["es", "es-ES", "es_ES-3.0.8.trie"],
    ["pt-BR", "pt-BR", "pt_BR-2.4.2.trie"],
    ["it", "it-IT", "it_IT-3.1.6.trie"],
    ["ru", "ru-RU", "ru_RU-2.3.2.trie"]
  ] satisfies Array<[AppLanguage, string, string]>)(
    "maps %s to the %s spellcheck dictionary",
    (language, id, filename) => {
      const manifest = spellcheckDictionaryManifestForLanguage(language);

      expect(manifest.id).toBe(id);
      expect(manifest.url).toBe(
        `https://github.com/markrahq/markra-dictionaries/releases/download/spellcheck-v1/${filename}`
      );
    }
  );

  it("falls back to the English dictionary for app languages without a supported word dictionary", () => {
    expect(spellcheckDictionaryManifestForLanguage("zh-CN")).toBe(spellcheckDictionaryManifests.en);
    expect(spellcheckDictionaryManifestForLanguage("zh-TW")).toBe(spellcheckDictionaryManifests.en);
    expect(spellcheckDictionaryManifestForLanguage("ja")).toBe(spellcheckDictionaryManifests.en);
    expect(spellcheckDictionaryManifestForLanguage("ko")).toBe(spellcheckDictionaryManifests.en);
  });

  it("loads the cached dictionary selected for the spelling language", async () => {
    const loadSpellcheckDictionary = vi.fn(async () => ({
      contents: trieSourceFromWords(["a", "bonjour"]),
      source: "download" as const
    }));
    const requestWebResource = vi.fn(async () => ({
      body: JSON.stringify({
        releaseTag: "spellcheck-test",
        dictionaries: {
          fr: {
            id: "fr-FR",
            version: "9.9.9",
            url: "https://example.test/releases/spellcheck-test/fr.trie",
            sha256: "f".repeat(64),
            size: 12_345_678,
            sourcePackage: "@example/dict-fr@9.9.9",
            license: "MIT"
          }
        }
      }),
      contentType: "application/json",
      finalUrl: "https://example.test/releases/spellcheck-test/manifest.json",
      status: 200
    }));
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      spellcheck: {
        ...createDefaultAppRuntime().spellcheck,
        loadSpellcheckDictionary
      },
      webResource: {
        requestWebResource
      }
    });

    const spellchecker = createAppSpellcheckerForLanguage("fr");
    await spellchecker.load?.();

    expect(loadSpellcheckDictionary).toHaveBeenCalledWith({
      id: "fr-FR",
      version: "9.9.9",
      url: "https://example.test/releases/spellcheck-test/fr.trie",
      sha256: "f".repeat(64),
      sizeBytes: 12_345_678
    }, { allowDownload: false });
    expect(spellchecker.check("bonjour")).toBe(true);
    expect(spellchecker.check("bonjoru")).toBe(false);
  });

  it("downloads a dictionary selected from spellcheck settings", async () => {
    const loadSpellcheckDictionary = vi.fn(async () => ({
      contents: trieSourceFromWords(["a", "bonjour"]),
      source: "download" as const
    }));
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      spellcheck: {
        ...createDefaultAppRuntime().spellcheck,
        loadSpellcheckDictionary
      }
    });

    await downloadAppSpellcheckDictionaryForLanguage("fr");

    expect(loadSpellcheckDictionary).toHaveBeenCalledWith(spellcheckDictionaryManifests.fr, {
      allowDownload: true,
      forceDownload: false
    });
  });

  it("force downloads a dictionary selected from spellcheck settings", async () => {
    const loadSpellcheckDictionary = vi.fn(async () => ({
      contents: trieSourceFromWords(["a", "bonjour"]),
      source: "download" as const
    }));
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      spellcheck: {
        ...createDefaultAppRuntime().spellcheck,
        loadSpellcheckDictionary
      }
    });

    await downloadAppSpellcheckDictionaryForLanguage("fr", { forceDownload: true });

    expect(loadSpellcheckDictionary).toHaveBeenCalledWith(spellcheckDictionaryManifests.fr, {
      allowDownload: true,
      forceDownload: true
    });
  });

  it("deletes a dictionary selected from spellcheck settings", async () => {
    const deleteSpellcheckDictionary = vi.fn(async () => undefined);
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      spellcheck: {
        ...createDefaultAppRuntime().spellcheck,
        deleteSpellcheckDictionary
      }
    });

    await deleteAppSpellcheckDictionaryForLanguage("fr");

    expect(deleteSpellcheckDictionary).toHaveBeenCalledWith(spellcheckDictionaryManifests.fr);
  });

  it("checks whether a selected dictionary is already cached", async () => {
    const getSpellcheckDictionaryStatus = vi.fn(async () => ({ downloaded: true }));
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      spellcheck: {
        ...createDefaultAppRuntime().spellcheck,
        getSpellcheckDictionaryStatus
      }
    });

    await expect(getAppSpellcheckDictionaryStatusForLanguage("fr")).resolves.toEqual({ downloaded: true });

    expect(getSpellcheckDictionaryStatus).toHaveBeenCalledWith(spellcheckDictionaryManifests.fr);
  });
});
