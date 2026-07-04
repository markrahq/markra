import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { configureAppRuntime, createDefaultAppRuntime, resetAppRuntimeForTests } from "../../runtime";
import { resetAppSpellcheckDictionaryManifestCacheForTests, spellcheckDictionaryManifests } from "../../lib/spellcheck";
import { spellcheckLanguageOptions } from "../../lib/spellcheck-languages";
import { translate } from "../../test/settings-components";
import { defaultEditorPreferences } from "../../lib/settings/app-settings";
import { SpellcheckSettings } from "./SpellcheckSettings";

describe("SpellcheckSettings", () => {
  afterEach(() => {
    resetAppSpellcheckDictionaryManifestCacheForTests();
    resetAppRuntimeForTests();
  });

  it("toggles custom spellcheck and downloads selected dictionaries from a dedicated settings section", async () => {
    const onUpdatePreferences = vi.fn();
    const loadSpellcheckDictionary = vi.fn(async () => ({
      contents: "#!/usr/bin/env cspell-trie reader\nTrieXv3\nbase=32\n# Data:\nabc\n",
      source: "download" as const
    }));
    const deleteSpellcheckDictionary = vi.fn(async () => undefined);
    const getSpellcheckDictionaryStatus = vi.fn(async () => ({ downloaded: false }));
    const remoteFrenchManifest = {
      id: "fr-FR",
      version: "9.9.9",
      url: "https://example.test/spellcheck/fr.trie",
      sha256: "f".repeat(64),
      sizeBytes: 12_345_678
    };
    const requestWebResource = vi.fn(async () => ({
      body: JSON.stringify({
        releaseTag: "spellcheck-test",
        dictionaries: {
          fr: {
            id: remoteFrenchManifest.id,
            version: remoteFrenchManifest.version,
            url: remoteFrenchManifest.url,
            sha256: remoteFrenchManifest.sha256,
            size: remoteFrenchManifest.sizeBytes,
            sourcePackage: "@example/dict-fr@9.9.9",
            license: "MIT"
          }
        }
      }),
      contentType: "application/json",
      finalUrl: "https://example.test/spellcheck/manifest.json",
      status: 200
    }));
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      spellcheck: {
        deleteSpellcheckDictionary,
        getSpellcheckDictionaryStatus,
        loadSpellcheckDictionary
      },
      webResource: {
        requestWebResource
      }
    });

    render(
      <SpellcheckSettings
        preferences={{
          ...defaultEditorPreferences,
          spellcheckEnabled: true
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    const spellcheckSwitch = screen.getByRole("switch", { name: "Check spelling" });

    expect(screen.getByRole("heading", { name: "Spellcheck" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Language pack downloads" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download all dictionaries" })).toBeInTheDocument();
    expect(spellcheckSwitch).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("French")).toBeInTheDocument();
    expect(screen.getByText(/4\.5 MB/)).toBeInTheDocument();
    expect(await screen.findByText(/12\.3 MB/)).toBeInTheDocument();
    expect(screen.getByText("German")).toBeInTheDocument();
    expect(screen.getByText("Spanish")).toBeInTheDocument();
    expect(screen.getByText("Portuguese (Brazil)")).toBeInTheDocument();
    expect(screen.getByText("Italian")).toBeInTheDocument();
    expect(screen.getByText("Russian")).toBeInTheDocument();

    fireEvent.click(spellcheckSwitch);

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...defaultEditorPreferences,
      spellcheckEnabled: false
    });

    const frenchDownloadButton = screen.getByRole("button", { name: "Download French dictionary" });
    expect(frenchDownloadButton).toHaveClass("border-transparent");
    expect(frenchDownloadButton).not.toHaveClass("border-(--border-default)");
    expect(screen.queryByRole("button", { name: "Redownload French dictionary" })).not.toBeInTheDocument();

    onUpdatePreferences.mockClear();

    fireEvent.click(frenchDownloadButton);

    await waitFor(() =>
      expect(loadSpellcheckDictionary).toHaveBeenCalledWith(remoteFrenchManifest, {
        allowDownload: true,
        forceDownload: false
      })
    );
    expect(onUpdatePreferences).toHaveBeenLastCalledWith({
      ...defaultEditorPreferences,
      spellcheckEnabled: true,
      spellcheckLanguage: "fr"
    });
    expect(await screen.findByRole("button", { name: "Redownload French dictionary" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Downloaded French dictionary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download French dictionary" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Redownload French dictionary" }));

    await waitFor(() =>
      expect(loadSpellcheckDictionary).toHaveBeenLastCalledWith(remoteFrenchManifest, {
        allowDownload: true,
        forceDownload: true
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete French dictionary" }));

    await waitFor(() => expect(deleteSpellcheckDictionary).toHaveBeenCalledWith(remoteFrenchManifest));
    expect(screen.getByRole("button", { name: "Download French dictionary" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Redownload French dictionary" })).not.toBeInTheDocument();

    loadSpellcheckDictionary.mockClear();
    onUpdatePreferences.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Download all dictionaries" }));

    await waitFor(() => expect(loadSpellcheckDictionary).toHaveBeenCalledTimes(spellcheckLanguageOptions.length));
    expect(loadSpellcheckDictionary).toHaveBeenCalledWith(spellcheckDictionaryManifests.en, {
      allowDownload: true,
      forceDownload: false
    });
    expect(loadSpellcheckDictionary).toHaveBeenCalledWith(spellcheckDictionaryManifests.ru, {
      allowDownload: true,
      forceDownload: false
    });
    expect(onUpdatePreferences).not.toHaveBeenCalled();
  });

  it("restores downloaded language pack status from the persistent dictionary cache", async () => {
    const onUpdatePreferences = vi.fn();
    const loadSpellcheckDictionary = vi.fn(async () => ({
      contents: "#!/usr/bin/env cspell-trie reader\nTrieXv3\nbase=32\n# Data:\nabc\n",
      source: "download" as const
    }));
    const remoteFrenchManifest = {
      id: "fr-FR",
      version: "9.9.9",
      url: "https://example.test/spellcheck/fr.trie",
      sha256: "f".repeat(64),
      sizeBytes: 12_345_678
    };
    const getSpellcheckDictionaryStatus = vi.fn(async (manifest) => ({
      downloaded: manifest.id === remoteFrenchManifest.id && manifest.sha256 === remoteFrenchManifest.sha256
    }));
    const requestWebResource = vi.fn(async () => ({
      body: JSON.stringify({
        releaseTag: "spellcheck-test",
        dictionaries: {
          fr: {
            id: remoteFrenchManifest.id,
            version: remoteFrenchManifest.version,
            url: remoteFrenchManifest.url,
            sha256: remoteFrenchManifest.sha256,
            size: remoteFrenchManifest.sizeBytes,
            sourcePackage: "@example/dict-fr@9.9.9",
            license: "MIT"
          }
        }
      }),
      contentType: "application/json",
      finalUrl: "https://example.test/spellcheck/manifest.json",
      status: 200
    }));
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      spellcheck: {
        ...createDefaultAppRuntime().spellcheck,
        getSpellcheckDictionaryStatus,
        loadSpellcheckDictionary
      },
      webResource: {
        requestWebResource
      }
    });

    render(
      <SpellcheckSettings
        preferences={{
          ...defaultEditorPreferences,
          spellcheckEnabled: true
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    expect(await screen.findByRole("button", { name: "Redownload French dictionary" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download French dictionary" })).not.toBeInTheDocument();
    expect(screen.getByText("Downloaded")).toBeInTheDocument();
    await waitFor(() => expect(getSpellcheckDictionaryStatus).toHaveBeenCalledWith(remoteFrenchManifest));
    expect(loadSpellcheckDictionary).not.toHaveBeenCalled();
  });

  it("shows and manages personal spellcheck whitelist words", () => {
    const onUpdatePreferences = vi.fn();
    const preferences = {
      ...defaultEditorPreferences,
      spellcheckEnabled: true,
      spellcheckIgnoredWords: ["markraterm", "customterm"]
    };

    render(
      <SpellcheckSettings preferences={preferences} translate={translate} onUpdatePreferences={onUpdatePreferences} />
    );

    expect(screen.getByRole("heading", { name: "Personal whitelist" })).toBeInTheDocument();
    expect(screen.getByText("2 words")).toBeInTheDocument();
    expect(screen.getByText("markraterm")).toBeInTheDocument();
    expect(screen.getByText("customterm")).toBeInTheDocument();
    const whitelistWords = screen.getByRole("list", { name: "Personal whitelist words" });
    expect(whitelistWords).toHaveClass("max-h-32", "overflow-y-auto", "flex-wrap");
    expect(within(whitelistWords).getAllByRole("listitem")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Remove markraterm" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      spellcheckIgnoredWords: ["customterm"]
    });

    onUpdatePreferences.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      spellcheckIgnoredWords: []
    });
  });

  it("adds personal spellcheck whitelist words from settings", () => {
    const onUpdatePreferences = vi.fn();
    const preferences = {
      ...defaultEditorPreferences,
      spellcheckEnabled: true,
      spellcheckIgnoredWords: ["markraterm"]
    };

    render(
      <SpellcheckSettings preferences={preferences} translate={translate} onUpdatePreferences={onUpdatePreferences} />
    );

    const whitelistWords = screen.getByRole("list", { name: "Personal whitelist words" });
    const input = within(whitelistWords).getByRole<HTMLInputElement>("textbox", { name: "Whitelist word" });
    const addButton = within(whitelistWords).getByRole("button", { name: "Add to whitelist" });
    expect(input.closest("form")).toHaveClass("w-28", "flex-none");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("spellcheck", "false");

    expect(addButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "  CustomTerm  " } });
    fireEvent.click(addButton);

    expect(onUpdatePreferences).toHaveBeenCalledWith({
      ...preferences,
      spellcheckIgnoredWords: ["markraterm", "customterm"]
    });
    expect(input).toHaveValue("");

    onUpdatePreferences.mockClear();

    fireEvent.change(input, { target: { value: "MARKRATERM" } });

    expect(addButton).toBeDisabled();
    expect(onUpdatePreferences).not.toHaveBeenCalled();
  });

  it("shows an empty personal whitelist state", () => {
    render(
      <SpellcheckSettings
        preferences={{
          ...defaultEditorPreferences,
          spellcheckEnabled: true,
          spellcheckIgnoredWords: []
        }}
        translate={translate}
        onUpdatePreferences={vi.fn()}
      />
    );

    expect(screen.getByText("No words added")).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Personal whitelist words" })).getByRole("textbox", {
        name: "Whitelist word"
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
  });

  it("does not let stale cache checks override later dictionary deletion", async () => {
    const onUpdatePreferences = vi.fn();
    const deleteSpellcheckDictionary = vi.fn(async () => undefined);
    let resolveFrenchStatus: (status: { downloaded: boolean }) => void = () => {};
    const frenchStatus = new Promise<{ downloaded: boolean }>((resolve) => {
      resolveFrenchStatus = resolve;
    });
    const getSpellcheckDictionaryStatus = vi.fn((manifest) => {
      if (manifest.id === spellcheckDictionaryManifests.fr.id) return frenchStatus;

      return Promise.resolve({ downloaded: false });
    });
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      spellcheck: {
        ...createDefaultAppRuntime().spellcheck,
        deleteSpellcheckDictionary,
        getSpellcheckDictionaryStatus
      }
    });

    render(
      <SpellcheckSettings
        preferences={{
          ...defaultEditorPreferences,
          spellcheckEnabled: true
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    await waitFor(() => expect(getSpellcheckDictionaryStatus).toHaveBeenCalledWith(spellcheckDictionaryManifests.fr));
    fireEvent.click(screen.getByRole("button", { name: "Delete French dictionary" }));

    await waitFor(() => expect(deleteSpellcheckDictionary).toHaveBeenCalledWith(spellcheckDictionaryManifests.fr));
    expect(screen.getByRole("button", { name: "Download French dictionary" })).toBeInTheDocument();

    await act(async () => {
      resolveFrenchStatus({ downloaded: true });
      await frenchStatus;
    });

    expect(screen.getByRole("button", { name: "Download French dictionary" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Redownload French dictionary" })).not.toBeInTheDocument();
  });

  it("does not let status checks from late manifest refreshes override a completed dictionary download", async () => {
    const onUpdatePreferences = vi.fn();
    const loadSpellcheckDictionary = vi.fn(async () => ({
      contents: "#!/usr/bin/env cspell-trie reader\nTrieXv3\nbase=32\n# Data:\nabc\n",
      source: "download" as const
    }));
    const remoteFrenchManifest = {
      id: "fr-FR",
      version: "9.9.9",
      url: "https://example.test/spellcheck/fr.trie",
      sha256: "f".repeat(64),
      sizeBytes: 12_345_678
    };
    let resolveRemoteManifest: (response: {
      body: string;
      contentType: string;
      finalUrl: string;
      status: number;
    }) => void = () => {};
    const remoteManifestResponse = new Promise<{
      body: string;
      contentType: string;
      finalUrl: string;
      status: number;
    }>((resolve) => {
      resolveRemoteManifest = resolve;
    });
    const getSpellcheckDictionaryStatus = vi.fn(async () => ({ downloaded: false }));
    const requestWebResource = vi.fn(() => remoteManifestResponse);
    configureAppRuntime({
      ...createDefaultAppRuntime(),
      spellcheck: {
        ...createDefaultAppRuntime().spellcheck,
        getSpellcheckDictionaryStatus,
        loadSpellcheckDictionary
      },
      webResource: {
        requestWebResource
      }
    });

    render(
      <SpellcheckSettings
        preferences={{
          ...defaultEditorPreferences,
          spellcheckEnabled: true
        }}
        translate={translate}
        onUpdatePreferences={onUpdatePreferences}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Download French dictionary" }));

    await waitFor(() => expect(loadSpellcheckDictionary).toHaveBeenCalledWith(spellcheckDictionaryManifests.fr, {
      allowDownload: true,
      forceDownload: false
    }));
    expect(await screen.findByRole("button", { name: "Redownload French dictionary" })).toBeInTheDocument();

    await act(async () => {
      resolveRemoteManifest({
        body: JSON.stringify({
          releaseTag: "spellcheck-test",
          dictionaries: {
            fr: {
              id: remoteFrenchManifest.id,
              version: remoteFrenchManifest.version,
              url: remoteFrenchManifest.url,
              sha256: remoteFrenchManifest.sha256,
              size: remoteFrenchManifest.sizeBytes,
              sourcePackage: "@example/dict-fr@9.9.9",
              license: "MIT"
            }
          }
        }),
        contentType: "application/json",
        finalUrl: "https://example.test/spellcheck/manifest.json",
        status: 200
      });
      await remoteManifestResponse;
    });

    await waitFor(() => expect(getSpellcheckDictionaryStatus).toHaveBeenCalledWith(remoteFrenchManifest));
    expect(await screen.findByText(/12\.3 MB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redownload French dictionary" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download French dictionary" })).not.toBeInTheDocument();
  });
});
