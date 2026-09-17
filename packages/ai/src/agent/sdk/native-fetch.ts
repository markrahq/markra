import type {
  ChatCompletionStreamTransport,
  ChatCompletionTransport,
  NativeAiChatRequest,
  NativeAiHttpResponse
} from "../chat-completion";

type NativeAiSdkFetchOptions = {
  streamTransport?: ChatCompletionStreamTransport;
  transport?: ChatCompletionTransport;
};

export type AiSdkFetch = (input: Request | URL | string, init?: RequestInit) => Promise<Response>;

export function createNativeAiSdkFetch({ streamTransport, transport }: NativeAiSdkFetchOptions): AiSdkFetch {
  return async (input, init) => {
    const request = await nativeRequestFromFetch(input, init);

    if (requestUsesStreaming(request)) {
      if (!streamTransport) throw new Error("AI chat stream transport is not configured.");

      return streamNativeResponse(request, streamTransport);
    }

    if (!transport) throw new Error("AI chat transport is not configured.");

    return jsonResponseFromNative(await transport(request));
  };
}

async function nativeRequestFromFetch(input: Request | URL | string, init: RequestInit | undefined): Promise<NativeAiChatRequest> {
  const sourceRequest = input instanceof Request ? input : null;
  const headers = new Headers(sourceRequest?.headers);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return {
    body: await readFetchBody(init?.body ?? (sourceRequest ? sourceRequest.clone().text() : undefined)),
    headers: Object.fromEntries(headers.entries()),
    url: sourceRequest?.url ?? input.toString()
  };
}

async function readFetchBody(body: BodyInit | Promise<string> | null | undefined) {
  if (body === null || body === undefined) return "";
  if (typeof body === "string") return body;
  if (body instanceof Promise) return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Blob) return body.text();

  const textDecoder = new TextDecoder();
  if (body instanceof ArrayBuffer) return textDecoder.decode(body);
  if (ArrayBuffer.isView(body)) return textDecoder.decode(body);

  throw new Error("AI SDK native fetch only supports text request bodies.");
}

function requestUsesStreaming(request: NativeAiChatRequest) {
  if (request.url.includes(":streamGenerateContent")) return true;

  try {
    const parsed = JSON.parse(request.body) as unknown;
    return typeof parsed === "object" && parsed !== null && "stream" in parsed && parsed.stream === true;
  } catch {
    return false;
  }
}

function jsonResponseFromNative(response: NativeAiHttpResponse) {
  return new Response(response.body === undefined || response.body === null ? null : JSON.stringify(response.body), {
    headers: {
      "content-type": "application/json"
    },
    status: response.status
  });
}

function streamNativeResponse(request: NativeAiChatRequest, streamTransport: ChatCompletionStreamTransport) {
  const textEncoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const response = new Response(stream.readable, {
    headers: {
      "content-type": "text/event-stream"
    },
    status: 200
  });
  let responseSettled = false;
  let streamFinished = false;

  return new Promise<Response>((resolve, reject) => {
    const failStream = (error: unknown) => {
      streamFinished = true;
      if (!responseSettled) {
        responseSettled = true;
        reject(error);
      }

      // The response body carries the error; cleanup may race with reader cancellation.
      writer.abort(error).catch(() => {});
    };
    const settleWithStream = () => {
      if (responseSettled) return;
      responseSettled = true;
      resolve(response);
    };

    streamTransport(request, (chunk) => {
      if (streamFinished) return;
      settleWithStream();
      const pendingWrite = writer.write(textEncoder.encode(chunk));
      // Event-based transports may ignore this promise, so handle write failures immediately.
      pendingWrite.catch(failStream);

      return pendingWrite;
    })
      .then((nativeResponse) => {
        if (streamFinished) return;
        streamFinished = true;
        if (!responseSettled) {
          const jsonResponse = jsonResponseFromNative({ body: nativeResponse.body ?? null, status: nativeResponse.status });
          responseSettled = true;
          resolve(jsonResponse);
          return writer.close();
        }

        if (nativeResponse.status < 200 || nativeResponse.status >= 300) {
          throw new Error(readNativeResponseError({ body: nativeResponse.body ?? null, status: nativeResponse.status }));
        }

        // close() drains all queued writes before ending the readable side.
        return writer.close();
      })
      .catch(failStream);
  });
}

function readNativeResponseError(response: NativeAiHttpResponse) {
  const body = response.body;
  if (isPlainRecord(body)) {
    if (typeof body.message === "string") return body.message;
    if (isPlainRecord(body.error) && typeof body.error.message === "string") return body.error.message;
    if (typeof body.error === "string") return body.error;
  }

  return `Request failed with HTTP ${response.status}.`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
