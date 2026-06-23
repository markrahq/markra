import { invoke } from "@tauri-apps/api/core";
import type {
  NativeSpellcheckDictionary,
  NativeSpellcheckDictionaryLoadOptions,
  NativeSpellcheckDictionaryManifest,
  NativeSpellcheckDictionaryStatus
} from "@markra/app/runtime";
import { networkSettingsForNativeRequest } from "./network";

export async function deleteNativeSpellcheckDictionary(
  manifest: NativeSpellcheckDictionaryManifest
): Promise<unknown> {
  return invoke("delete_spellcheck_dictionary", {
    request: manifest
  });
}

export async function getNativeSpellcheckDictionaryStatus(
  manifest: NativeSpellcheckDictionaryManifest
): Promise<NativeSpellcheckDictionaryStatus> {
  return invoke("get_spellcheck_dictionary_status", {
    request: manifest
  });
}

export async function loadNativeSpellcheckDictionary(
  manifest: NativeSpellcheckDictionaryManifest,
  options: NativeSpellcheckDictionaryLoadOptions = {}
): Promise<NativeSpellcheckDictionary> {
  const network = await networkSettingsForNativeRequest();
  const request = {
    ...manifest,
    allowDownload: options.allowDownload ?? true,
    forceDownload: options.forceDownload ?? false,
    ...(network ? { network } : {})
  };

  return invoke<NativeSpellcheckDictionary>("load_spellcheck_dictionary", {
    request
  });
}
