import { invoke } from "@tauri-apps/api/core";
import { listenNativeEvent } from "./events";

const acpAgentMessageEvent = "markra://acp-agent-message";

export type NativeAcpAgentEnvVariable = {
  name: string;
  value: string;
};

export type NativeAcpAgentStartConfig = {
  args?: string[];
  command: string;
  cwd?: string | null;
  env?: NativeAcpAgentEnvVariable[];
};

export type NativeAcpAgentConnection = {
  connectionId: string;
};

export type NativeAcpAgentMessageEvent = {
  connectionId: string;
  message: string;
  type: "exit" | "message" | "stderr";
};

export function startNativeAcpAgent(config: NativeAcpAgentStartConfig) {
  return invoke<NativeAcpAgentConnection>("start_acp_agent", {
    config: {
      args: config.args ?? [],
      command: config.command,
      cwd: config.cwd ?? null,
      env: config.env ?? []
    }
  });
}

export function writeNativeAcpAgentMessage(connectionId: string, message: unknown) {
  return invoke("write_acp_agent_message", {
    connectionId,
    message: JSON.stringify(message)
  });
}

export function stopNativeAcpAgent(connectionId: string) {
  return invoke("stop_acp_agent", {
    connectionId
  });
}

export function listenNativeAcpAgentMessages(handler: (event: NativeAcpAgentMessageEvent) => unknown) {
  return listenNativeEvent<NativeAcpAgentMessageEvent>(acpAgentMessageEvent, (event) => {
    handler(event.payload);
  });
}
