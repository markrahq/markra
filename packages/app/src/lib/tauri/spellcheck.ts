import { getAppRuntime } from "../../runtime";

export type NativeSpellcheckDictionaryManifest = {
  id: string;
  sha256: string;
  sizeBytes: number;
  url: string;
  version: string;
};

export type NativeSpellcheckDictionary = {
  contents: string;
  source: "cache" | "download";
};

export type NativeSpellcheckDictionaryStatus = {
  downloaded: boolean;
};

export type NativeSpellcheckDictionaryLoadOptions = {
  allowDownload?: boolean;
  forceDownload?: boolean;
};

export function deleteNativeSpellcheckDictionary(manifest: NativeSpellcheckDictionaryManifest) {
  return getAppRuntime().spellcheck.deleteSpellcheckDictionary(manifest);
}

export function getNativeSpellcheckDictionaryStatus(manifest: NativeSpellcheckDictionaryManifest) {
  return getAppRuntime().spellcheck.getSpellcheckDictionaryStatus(manifest);
}

export function loadNativeSpellcheckDictionary(
  manifest: NativeSpellcheckDictionaryManifest,
  options: NativeSpellcheckDictionaryLoadOptions = {}
) {
  return getAppRuntime().spellcheck.loadSpellcheckDictionary(manifest, options);
}
