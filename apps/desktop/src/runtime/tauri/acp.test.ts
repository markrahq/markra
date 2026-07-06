import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  listenNativeAcpAgentMessages,
  startNativeAcpAgent,
  stopNativeAcpAgent,
  writeNativeAcpAgentMessage
} from "./acp";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn()
}));

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);

describe("native ACP runtime", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedListen.mockReset();
  });

  it("starts an ACP agent subprocess with normalized command configuration", async () => {
    mockedInvoke.mockResolvedValue({ connectionId: "acp-1" });

    await expect(startNativeAcpAgent({
      args: ["--experimental-acp"],
      command: "gemini",
      cwd: "/mock-vault",
      env: [{ name: "ACP_ENV", value: "test" }]
    })).resolves.toEqual({ connectionId: "acp-1" });

    expect(mockedInvoke).toHaveBeenCalledWith("start_acp_agent", {
      config: {
        args: ["--experimental-acp"],
        command: "gemini",
        cwd: "/mock-vault",
        env: [{ name: "ACP_ENV", value: "test" }]
      }
    });
  });

  it("writes JSON-RPC messages to the running ACP agent", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await writeNativeAcpAgentMessage("acp-1", {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {}
    });

    expect(mockedInvoke).toHaveBeenCalledWith("write_acp_agent_message", {
      connectionId: "acp-1",
      message: "{\"id\":1,\"jsonrpc\":\"2.0\",\"method\":\"initialize\",\"params\":{}}"
    });
  });

  it("listens for ACP agent stdout messages", async () => {
    const cleanup = vi.fn();
    const handler = vi.fn();
    mockedListen.mockResolvedValue(cleanup);

    const stopListening = await listenNativeAcpAgentMessages(handler);

    expect(mockedListen).toHaveBeenCalledWith("markra://acp-agent-message", expect.any(Function));
    const eventHandler = mockedListen.mock.calls[0]?.[1];
    eventHandler?.({
      payload: {
        connectionId: "acp-1",
        message: "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}",
        type: "message"
      }
    } as Parameters<Parameters<typeof listen>[1]>[0]);
    expect(handler).toHaveBeenCalledWith({
      connectionId: "acp-1",
      message: "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}",
      type: "message"
    });
    await Promise.resolve(stopListening());
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("stops an ACP agent subprocess", async () => {
    mockedInvoke.mockResolvedValue(undefined);

    await stopNativeAcpAgent("acp-1");

    expect(mockedInvoke).toHaveBeenCalledWith("stop_acp_agent", {
      connectionId: "acp-1"
    });
  });
});
