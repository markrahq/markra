import { createNativeAiSdkFetch } from "./native-fetch";

describe("createNativeAiSdkFetch", () => {
  it("streams native chunks through a fetch Response body", async () => {
    const transport = vi.fn();
    const streamTransport = vi.fn(async (request, onChunk) => {
      expect(request).toEqual({
        body: JSON.stringify({ messages: [], stream: true }),
        headers: {
          authorization: "Bearer secret",
          "content-type": "application/json"
        },
        url: "https://example.test/v1/responses"
      });
      onChunk("data: first\n\n");
      onChunk("data: second\n\n");

      return { status: 200 };
    });
    const nativeFetch = createNativeAiSdkFetch({ streamTransport, transport });

    const response = await nativeFetch("https://example.test/v1/responses", {
      body: JSON.stringify({ messages: [], stream: true }),
      headers: {
        Authorization: "Bearer secret",
        "content-type": "application/json"
      },
      method: "POST"
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await expect(response.text()).resolves.toBe("data: first\n\ndata: second\n\n");
    expect(streamTransport).toHaveBeenCalledOnce();
    expect(transport).not.toHaveBeenCalled();
  });

  it("returns native stream errors as non-2xx fetch responses when no chunks were emitted", async () => {
    const streamTransport = vi.fn(async () => ({
      body: { error: { message: "Upstream service temporarily unavailable" } },
      status: 502
    }));
    const nativeFetch = createNativeAiSdkFetch({ streamTransport });

    const response = await nativeFetch("https://example.test/v1/responses", {
      body: JSON.stringify({ stream: true }),
      method: "POST"
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Upstream service temporarily unavailable" }
    });
  });

  it("errors the fetch response body when the native stream fails after chunks were emitted", async () => {
    const streamTransport = vi.fn(async (_request, onChunk) => {
      onChunk("data: partial\n\n");

      return {
        body: { error: { message: "Late upstream failure" } },
        status: 502
      };
    });
    const nativeFetch = createNativeAiSdkFetch({ streamTransport });

    const response = await nativeFetch("https://example.test/v1/responses", {
      body: JSON.stringify({ stream: true }),
      method: "POST"
    });

    expect(response.status).toBe(200);
    await expect(response.text()).rejects.toThrow("Late upstream failure");
  });

  it("uses the non-stream native transport for ordinary JSON requests", async () => {
    const transport = vi.fn(async () => ({
      body: { ok: true },
      status: 200
    }));
    const streamTransport = vi.fn();
    const nativeFetch = createNativeAiSdkFetch({ streamTransport, transport });

    const response = await nativeFetch("https://example.test/v1/chat/completions", {
      body: JSON.stringify({ messages: [], stream: false }),
      method: "POST"
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(transport).toHaveBeenCalledWith({
      body: JSON.stringify({ messages: [], stream: false }),
      headers: {},
      url: "https://example.test/v1/chat/completions"
    });
    expect(streamTransport).not.toHaveBeenCalled();
  });

  it.each([true, false])("ignores chunks arriving after the transport finishes (streamed: %s)", async (streamed) => {
    let emitChunk: (chunk: string) => unknown = () => undefined;
    const nativeFetch = createNativeAiSdkFetch({
      streamTransport: async (_request, onChunk) => {
        emitChunk = onChunk;
        if (streamed) onChunk("data: mock first\n\n");
        return { status: 200 };
      }
    });

    const response = await nativeFetch("https://example.test/v1/responses", {
      body: JSON.stringify({ stream: true }),
      method: "POST"
    });

    await expect(response.text()).resolves.toBe(streamed ? "data: mock first\n\n" : "");
    const lateWrite = emitChunk("data: mock late\n\n");
    Promise.resolve(lateWrite).catch(() => {});
    expect(lateWrite).toBeUndefined();
  });

  it("handles rejected writes immediately when the response reader cancels", async () => {
    let emitChunk: (chunk: string) => unknown = () => undefined;
    let finishTransport: (response: { status: number }) => unknown = () => undefined;
    const nativeFetch = createNativeAiSdkFetch({
      streamTransport: (_request, onChunk) => {
        emitChunk = onChunk;
        onChunk("data: mock first\n\n");
        return new Promise((resolve) => { finishTransport = resolve; });
      }
    });
    const response = await nativeFetch("https://example.test/v1/responses", {
      body: JSON.stringify({ stream: true }),
      method: "POST"
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel(new Error("Mock reader cancellation"));

    // Native event callbacks may ignore returned promises while the request is still running.
    emitChunk("data: mock cancelled write\n\n");
    await new Promise((resolve) => setTimeout(resolve, 0));
    finishTransport({ status: 200 });
    await expect(Promise.resolve(emitChunk("data: mock late\n\n"))).resolves.toBeUndefined();
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  it("rejects transport failures before any response chunks arrive", async () => {
    const error = new Error("Mock connection failure");
    const nativeFetch = createNativeAiSdkFetch({
      streamTransport: async () => { throw error; }
    });

    await expect(nativeFetch("https://example.test/v1/responses", {
      body: JSON.stringify({ stream: true }),
      method: "POST"
    })).rejects.toBe(error);
  });
});
