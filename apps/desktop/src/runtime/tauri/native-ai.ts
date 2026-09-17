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
  const network = await networkSettingsForNativeRequest();
  const pendingChunks: Promise<unknown>[] = [];
  let acceptingChunks = true;
  let finishChannel!: () => unknown;
  let rejectChannel!: (error: unknown) => unknown;
  const channelDone = new Promise<unknown>((resolve, reject) => {
    finishChannel = () => resolve(undefined);
    rejectChannel = reject;
  });
  const failChannel = (error: unknown) => {
    acceptingChunks = false;
    rejectChannel(error);
  };
  const onEvent = new Channel<NativeAiChatStreamEvent>((event) => {
    if (!acceptingChunks) return;
    if (event.type === "done") {
      acceptingChunks = false;
      Promise.all(pendingChunks).then(finishChannel, failChannel);
      return;
    }

    try {
      const pendingChunk = Promise.resolve(onChunk(event.chunk));
      pendingChunks.push(pendingChunk);
      pendingChunk.catch(failChannel);
    } catch (error) {
      failChannel(error);
    }
  });

  try {
    // The command can return before larger channel payloads arrive; done is ordered after every chunk.
    const [response] = await Promise.all([
      invokeNative<NativeAiStreamResponse>("request_native_chat_stream", {
        onEvent,
        request: network ? { ...request, network } : request
      }).then((response) => {
        // HTTP errors return a body without sending channel events.
        if (response.status < 200 || response.status >= 300) finishChannel();
        return response;
      }),
      channelDone
    ]);

    return response;
  } finally {
    acceptingChunks = false;
  }
}
