import { Channel, invoke } from "@tauri-apps/api/core";
import { getStoredNetworkSettings } from "@markra/app/settings";
import {
  requestNativeAiJson,
  requestNativeChat,
  requestNativeChatStream,
  type NativeAiStreamResponse
} from "./native-ai";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: vi.fn().mockImplementation(function Channel(callback: unknown) {
    return { callback };
  }),
  invoke: vi.fn()
}));

vi.mock("@markra/app/settings", () => ({
  getStoredNetworkSettings: vi.fn()
}));

const mockedInvoke = vi.mocked(invoke);
const mockedChannel = vi.mocked(Channel);
const mockedGetStoredNetworkSettings = vi.mocked(getStoredNetworkSettings);

const network = {
  bypassLocalAddresses: true,
  proxyEnabled: true,
  proxyUrl: "socks5://127.0.0.1:1080"
};

const streamRequest = {
  body: JSON.stringify({ stream: true }),
  headers: {},
  url: "https://api.example.test/v1/chat/completions"
};

function deferred<T>() {
  let resolve!: (value: T) => unknown;
  let reject!: (error: unknown) => unknown;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function emitStreamEvent(event: { chunk: string; type: "chunk" } | { status: number; type: "done" }) {
  mockedChannel.mock.calls.at(-1)![0]!(event);
}

function flushStreamEvents() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("native AI runtime", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedChannel.mockClear();
    mockedGetStoredNetworkSettings.mockReset();
    mockedGetStoredNetworkSettings.mockResolvedValue(network);
  });

  it("passes app network proxy settings to provider JSON requests", async () => {
    mockedInvoke.mockResolvedValue({ body: { data: [] }, status: 200 });

    await requestNativeAiJson({
      headers: { authorization: "Bearer test" },
      method: "GET",
      url: "https://api.example.test/v1/models"
    });

    expect(mockedInvoke).toHaveBeenCalledWith("request_ai_provider_json", {
      request: {
        headers: { authorization: "Bearer test" },
        method: "GET",
        network,
        url: "https://api.example.test/v1/models"
      }
    });
  });

  it("passes app network proxy settings to chat requests", async () => {
    mockedInvoke.mockResolvedValue({ body: { ok: true }, status: 200 });

    await requestNativeChat({
      body: "{}",
      headers: { "content-type": "application/json" },
      url: "https://api.example.test/v1/chat/completions"
    });

    expect(mockedInvoke).toHaveBeenCalledWith("request_native_chat", {
      request: {
        body: "{}",
        headers: { "content-type": "application/json" },
        network,
        url: "https://api.example.test/v1/chat/completions"
      }
    });
  });

  it("passes app network proxy settings to streaming chat requests", async () => {
    mockedInvoke.mockImplementation(async () => {
      emitStreamEvent({ status: 200, type: "done" });
      return { status: 200 };
    });

    await requestNativeChatStream({
      body: "{\"stream\":true}",
      headers: {},
      url: "https://api.example.test/v1/chat/completions"
    }, vi.fn());

    expect(mockedInvoke).toHaveBeenCalledWith("request_native_chat_stream", {
      onEvent: expect.anything(),
      request: {
        body: "{\"stream\":true}",
        headers: {},
        network,
        url: "https://api.example.test/v1/chat/completions"
      }
    });
  });

  it("waits for delayed chunks and the channel done event after the native command returns", async () => {
    mockedInvoke.mockResolvedValue({ status: 200 });
    const onChunk = vi.fn();
    const settled = vi.fn();
    const result = requestNativeChatStream(streamRequest, onChunk).then(settled);
    await flushStreamEvents();

    expect(settled).not.toHaveBeenCalled();
    emitStreamEvent({ chunk: "mock first", type: "chunk" });
    emitStreamEvent({ chunk: "mock last", type: "chunk" });
    emitStreamEvent({ status: 200, type: "done" });
    await result;

    expect(onChunk.mock.calls).toEqual([["mock first"], ["mock last"]]);
    expect(settled).toHaveBeenCalledWith({ status: 200 });
  });

  it("waits for the native command when the channel finishes first", async () => {
    const command = deferred<NativeAiStreamResponse>();
    mockedInvoke.mockReturnValue(command.promise);
    const settled = vi.fn();
    const result = requestNativeChatStream(streamRequest, vi.fn()).then(settled);
    await flushStreamEvents();

    emitStreamEvent({ status: 200, type: "done" });
    await flushStreamEvents();
    expect(settled).not.toHaveBeenCalled();

    command.resolve({ status: 200 });
    await result;
    expect(settled).toHaveBeenCalledWith({ status: 200 });
  });

  it("preserves the final response chunk when it arrives after the native command returns", async () => {
    const command = deferred<NativeAiStreamResponse>();
    mockedInvoke.mockReturnValue(command.promise);
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();
    const body = new Response(stream.readable).text();
    const result = requestNativeChatStream(streamRequest, (chunk) => writer.write(encoder.encode(chunk)))
      .then(() => writer.close());
    await flushStreamEvents();

    emitStreamEvent({ chunk: "mock first ", type: "chunk" });
    command.resolve({ status: 200 });
    await flushStreamEvents();
    emitStreamEvent({ chunk: "mock last", type: "chunk" });
    emitStreamEvent({ status: 200, type: "done" });

    await result;
    await expect(body).resolves.toBe("mock first mock last");
  });

  it("waits for asynchronous chunk consumers before completing the stream", async () => {
    mockedInvoke.mockResolvedValue({ status: 200 });
    const consumed = deferred<unknown>();
    const settled = vi.fn();
    const result = requestNativeChatStream(streamRequest, () => consumed.promise).then(settled);
    await flushStreamEvents();

    emitStreamEvent({ chunk: "mock chunk", type: "chunk" });
    emitStreamEvent({ status: 200, type: "done" });
    await flushStreamEvents();
    expect(settled).not.toHaveBeenCalled();

    consumed.resolve(undefined);
    await result;
    expect(settled).toHaveBeenCalledWith({ status: 200 });
  });

  it("returns HTTP errors without waiting for a channel done event", async () => {
    const response = { body: { error: "Mock upstream failure" }, status: 502 };
    mockedInvoke.mockResolvedValue(response);

    await expect(requestNativeChatStream(streamRequest, vi.fn())).resolves.toEqual(response);
  });

  it("rejects native failures and stops delivering later channel events", async () => {
    const error = new Error("Mock native failure");
    mockedInvoke.mockRejectedValue(error);
    const onChunk = vi.fn();

    await expect(requestNativeChatStream(streamRequest, onChunk)).rejects.toBe(error);
    emitStreamEvent({ chunk: "mock late chunk", type: "chunk" });
    expect(onChunk).not.toHaveBeenCalled();
  });

  it.each(["sync", "async"])("propagates %s chunk consumer failures before the native command finishes", async (mode) => {
    const error = new Error("Mock chunk failure");
    const command = deferred<NativeAiStreamResponse>();
    mockedInvoke.mockReturnValue(command.promise);
    const onChunk = vi.fn(() => {
      if (mode === "sync") throw error;
      return Promise.reject(error);
    });
    const rejected = vi.fn();
    const result = requestNativeChatStream(streamRequest, onChunk).catch(rejected);
    await flushStreamEvents();

    expect(() => emitStreamEvent({ chunk: "mock chunk", type: "chunk" })).not.toThrow();
    await flushStreamEvents();
    expect(rejected).toHaveBeenCalledWith(error);
    emitStreamEvent({ chunk: "mock late chunk", type: "chunk" });
    expect(onChunk).toHaveBeenCalledTimes(1);

    command.resolve({ status: 200 });
    await result;
  });
});
