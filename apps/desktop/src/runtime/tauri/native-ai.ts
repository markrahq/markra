import { Channel } from "@tauri-apps/api/core";
import { invokeNative } from "./invoke";
import { networkSettingsForNativeRequest, type NativeNetworkSettings } from "./network";

export type NativeAiHttpRequest = {
  headers: Record<string, string>;
  method: "GET";
  network?: NativeNetworkSettings;
  url: string;
};

export type NativeAiChatRequest = {
  body: string;
  headers: Record<string, string>;
  network?: NativeNetworkSettings;
  url: string;
};

export type NativeAiHttpResponse = {
  body: unknown;
  status: number;
};

export type NativeAiStreamResponse = {
  body?: unknown;
  status: number;
};

type NativeAiChatStreamEvent =
  | {
      chunk: string;
      type: "chunk";
    }
  | {
      status: number;
      type: "done";
    };

export function requestNativeAiJson(request: NativeAiHttpRequest): Promise<NativeAiHttpResponse> {
  return networkSettingsForNativeRequest().then((network) =>
    invokeNative<NativeAiHttpResponse>("request_ai_provider_json", {
      request: network ? { ...request, network } : request
    })
  );
}

export function requestNativeChat(request: NativeAiChatRequest): Promise<NativeAiHttpResponse> {
  return networkSettingsForNativeRequest().then((network) =>
    invokeNative<NativeAiHttpResponse>("request_native_chat", {
      request: network ? { ...request, network } : request
    })
  );
}

export async function requestNativeChatStream(
  request: NativeAiChatRequest,
  onChunk: (chunk: string) => unknown
): Promise<NativeAiStreamResponse> {
  const onEvent = new Channel<NativeAiChatStreamEvent>((event) => {
    if (event.type === "chunk") {
      onChunk(event.chunk);
    }
  });
  const network = await networkSettingsForNativeRequest();
  const response = await invokeNative<NativeAiStreamResponse>("request_native_chat_stream", {
    onEvent,
    request: network ? { ...request, network } : request
  });

  return response;
}
