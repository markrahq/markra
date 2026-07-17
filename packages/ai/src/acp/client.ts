import { isRecord } from "@markra/shared";

export type AcpRequestId = number | string;

export type AcpJsonRpcRequestMessage = {
  id: AcpRequestId;
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type AcpJsonRpcNotificationMessage = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type AcpJsonRpcSuccessMessage = {
  id: AcpRequestId;
  jsonrpc: "2.0";
  result: unknown;
};

export type AcpJsonRpcErrorMessage = {
  error: {
    code: number;
    data?: unknown;
    message: string;
  };
  id: AcpRequestId | null;
  jsonrpc: "2.0";
};

export type AcpJsonRpcMessage =
  | AcpJsonRpcErrorMessage
  | AcpJsonRpcNotificationMessage
  | AcpJsonRpcRequestMessage
  | AcpJsonRpcSuccessMessage;

export type AcpContentBlock =
  | {
      text: string;
      type: "text";
    }
  | {
      resource: {
        blob?: string;
        mimeType?: string;
        text?: string;
        uri: string;
      };
      type: "resource";
    }
  | {
      description?: string;
      mimeType?: string;
      name: string;
      size?: number;
      title?: string;
      type: "resource_link";
      uri: string;
    };

export type AcpClientInfo = {
  name: string;
  title?: string;
  version: string;
};

export type AcpClientTransport = {
  close?: () => Promise<unknown> | unknown;
  onMessage: (handler: (message: AcpJsonRpcMessage) => unknown) => () => unknown;
  send: (message: AcpJsonRpcMessage) => Promise<unknown> | unknown;
};

export type AcpFileReadRequest = {
  limit?: number;
  line?: number;
  path: string;
  sessionId: string;
};

export type AcpFileWriteRequest = {
  content: string;
  path: string;
  sessionId: string;
};

export type AcpFileSystem = {
  readTextFile?: (request: AcpFileReadRequest) => Promise<string> | string;
  writeTextFile?: (request: AcpFileWriteRequest) => Promise<unknown> | unknown;
};

export type AcpPermissionOptionKind = "allow_once" | "allow_always" | "reject_once" | "reject_always";

export type AcpPermissionOption = {
  kind: AcpPermissionOptionKind;
  name: string;
  optionId: string;
};

export type AcpPermissionRequest = {
  options: AcpPermissionOption[];
  sessionId: string;
  toolCall: unknown;
};

export type AcpPermissionRequestOutcome =
  | {
      optionId: string;
      outcome: "selected";
    }
  | {
      outcome: "cancelled";
    };

export type AcpPermissions = {
  requestPermission?: (request: AcpPermissionRequest) => Promise<AcpPermissionRequestOutcome> | AcpPermissionRequestOutcome;
};

export type AcpSessionUpdate = {
  sessionId: string;
  type: string;
} & Record<string, unknown>;

export type AcpSessionConfigSelectOption = {
  description?: string | null;
  name: string;
  value: string;
};

export type AcpSessionConfigSelectGroup = {
  group: string;
  name: string;
  options: AcpSessionConfigSelectOption[];
};

export type AcpSessionConfigOption = {
  category?: string;
  currentValue: string;
  id: string;
  name?: string;
  options: Array<AcpSessionConfigSelectOption | AcpSessionConfigSelectGroup>;
  type: "select";
};

export type AcpSessionConfigResponse = {
  configOptions: AcpSessionConfigOption[];
};

export type AcpSessionNewResponse = {
  configOptions?: AcpSessionConfigOption[] | null;
  sessionId: string;
};

export type AcpModelConfig = {
  configId: string;
  models: Array<{
    description?: string;
    id: string;
    name: string;
  }>;
  selectedModelId: string | null;
};

export type AcpAuthMethod = {
  description?: string | null;
  id: string;
  name: string;
};

export type AcpInitializeResponse = {
  agentCapabilities?: unknown;
  authMethods?: AcpAuthMethod[] | null;
  protocolVersion?: number;
};

export type AcpClientOptions = {
  fileSystem?: AcpFileSystem;
  permissions?: AcpPermissions;
  transport: AcpClientTransport;
};

type PendingRequest = {
  reject: (error: Error) => unknown;
  resolve: (result: unknown) => unknown;
};

const jsonRpcVersion = "2.0";
const methodNotFoundCode = -32601;
const invalidParamsCode = -32602;
const internalErrorCode = -32603;
const authRequiredCode = -32000;

export class AcpResponseError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(error: AcpJsonRpcErrorMessage["error"]) {
    super(jsonRpcErrorMessage(error));
    this.name = "AcpResponseError";
    this.code = error.code;
    this.data = error.data;
  }
}

export function isAcpAuthRequiredError(error: unknown) {
  return error instanceof AcpResponseError &&
    error.code === authRequiredCode &&
    error.message.toLowerCase().includes("authentication required");
}

export class AcpClient {
  private disposed = false;
  private nextRequestId = 1;
  private readonly pendingRequests = new Map<AcpRequestId, PendingRequest>();
  private readonly subscribers = new Set<(update: AcpSessionUpdate) => unknown>();
  private readonly unsubscribeTransport: () => unknown;
  private readonly fileSystem: AcpFileSystem | undefined;
  private readonly permissions: AcpPermissions | undefined;
  private readonly transport: AcpClientTransport;

  constructor({ fileSystem, permissions, transport }: AcpClientOptions) {
    this.fileSystem = fileSystem;
    this.permissions = permissions;
    this.transport = transport;
    this.unsubscribeTransport = transport.onMessage((message) => this.handleMessage(message));
  }

  initialize(clientInfo: AcpClientInfo) {
    return this.request("initialize", {
      clientCapabilities: {
        fs: {
          readTextFile: Boolean(this.fileSystem?.readTextFile),
          writeTextFile: Boolean(this.fileSystem?.writeTextFile)
        },
        terminal: false
      },
      clientInfo,
      protocolVersion: 1
    }) as Promise<AcpInitializeResponse>;
  }

  createSession({
    cwd,
    mcpServers = []
  }: {
    cwd: string;
    mcpServers?: unknown[];
  }) {
    return this.request("session/new", {
      cwd,
      mcpServers
    }) as Promise<AcpSessionNewResponse>;
  }

  setSessionConfigOption({
    configId,
    sessionId,
    value
  }: {
    configId: string;
    sessionId: string;
    value: string;
  }) {
    return this.request("session/set_config_option", {
      configId,
      sessionId,
      value
    }) as Promise<AcpSessionConfigResponse>;
  }

  authenticate(methodId: string) {
    return this.request("authenticate", { methodId }) as Promise<Record<string, unknown>>;
  }

  prompt({
    prompt,
    sessionId
  }: {
    prompt: AcpContentBlock[];
    sessionId: string;
  }) {
    return this.request("session/prompt", {
      prompt,
      sessionId
    }) as Promise<{ stopReason: string }>;
  }

  cancel(sessionId: string) {
    return this.notify("session/cancel", { sessionId });
  }

  subscribe(handler: (update: AcpSessionUpdate) => unknown) {
    this.subscribers.add(handler);

    return () => {
      this.subscribers.delete(handler);
    };
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeTransport();
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("ACP client disposed before the request completed."));
    }
    this.pendingRequests.clear();
    await this.transport.close?.();
  }

  private request(method: string, params?: unknown) {
    if (this.disposed) {
      return Promise.reject(new Error("ACP client disposed before the request started."));
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const message: AcpJsonRpcRequestMessage = {
      id,
      jsonrpc: jsonRpcVersion,
      method,
      ...(params !== undefined ? { params } : {})
    };
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { reject, resolve });
    });

    try {
      Promise.resolve(this.transport.send(message)).catch((error: unknown) => {
        this.rejectPendingRequest(id, error);
      });
    } catch (error) {
      this.rejectPendingRequest(id, error);
    }

    return promise;
  }

  private notify(method: string, params?: unknown) {
    if (this.disposed) return Promise.resolve(undefined);

    const message: AcpJsonRpcNotificationMessage = {
      jsonrpc: jsonRpcVersion,
      method,
      ...(params !== undefined ? { params } : {})
    };

    return this.transport.send(message);
  }

  private handleMessage(message: AcpJsonRpcMessage) {
    if (this.disposed) return;

    if (isJsonRpcResponse(message)) {
      this.resolveResponse(message);
      return;
    }

    if (isJsonRpcRequest(message)) {
      this.handlePeerRequest(message).catch((error: unknown) => {
        Promise.resolve(this.respondError(message.id, internalErrorCode, errorMessage(error))).catch(() => {});
      });
      return;
    }

    this.handleNotification(message);
  }

  private resolveResponse(message: AcpJsonRpcSuccessMessage | AcpJsonRpcErrorMessage) {
    if (message.id === null) return;

    const pending = this.pendingRequests.get(message.id);
    if (!pending) return;

    this.pendingRequests.delete(message.id);
    if ("error" in message) {
      pending.reject(new AcpResponseError(message.error));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectPendingRequest(id: AcpRequestId, error: unknown) {
    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    this.pendingRequests.delete(id);
    pending.reject(new Error(errorMessage(error)));
  }

  private handleNotification(message: AcpJsonRpcNotificationMessage) {
    if (message.method !== "session/update") return;
    if (!isRecord(message.params)) return;
    const sessionId = stringValue(message.params.sessionId);
    const update = isRecord(message.params.update) ? message.params.update : null;
    const type = stringValue(update?.sessionUpdate);
    if (!sessionId || !type || !update) return;

    const normalizedUpdate: AcpSessionUpdate = {
      ...withoutKey(update, "sessionUpdate"),
      sessionId,
      type
    };
    this.subscribers.forEach((handler) => handler(normalizedUpdate));
  }

  private async handlePeerRequest(message: AcpJsonRpcRequestMessage) {
    if (message.method === "fs/read_text_file") {
      await this.handleReadTextFile(message);
      return;
    }

    if (message.method === "fs/write_text_file") {
      await this.handleWriteTextFile(message);
      return;
    }

    if (message.method === "session/request_permission") {
      await this.handleRequestPermission(message);
      return;
    }

    await this.respondError(message.id, methodNotFoundCode, `ACP client method is not supported: ${message.method}`);
  }

  private async handleReadTextFile(message: AcpJsonRpcRequestMessage) {
    if (!this.fileSystem?.readTextFile) {
      await this.respondError(message.id, methodNotFoundCode, "ACP filesystem reads are not configured.");
      return;
    }

    const params = readFileParams(message.params);
    if (!params) {
      await this.respondError(message.id, invalidParamsCode, "Invalid fs/read_text_file parameters.");
      return;
    }

    const content = await this.fileSystem.readTextFile(params);
    await this.respond(message.id, {
      content: textLineWindow(content, params)
    });
  }

  private async handleWriteTextFile(message: AcpJsonRpcRequestMessage) {
    if (!this.fileSystem?.writeTextFile) {
      await this.respondError(message.id, methodNotFoundCode, "ACP filesystem writes are not configured.");
      return;
    }

    const params = writeFileParams(message.params);
    if (!params) {
      await this.respondError(message.id, invalidParamsCode, "Invalid fs/write_text_file parameters.");
      return;
    }

    await this.fileSystem.writeTextFile(params);
    await this.respond(message.id, null);
  }

  private async handleRequestPermission(message: AcpJsonRpcRequestMessage) {
    const params = permissionRequestParams(message.params);
    if (!params) {
      await this.respondError(message.id, invalidParamsCode, "Invalid session/request_permission parameters.");
      return;
    }

    const requestedOutcome = await this.permissions?.requestPermission?.(params);
    const outcome = normalizePermissionOutcome(requestedOutcome, params.options) ?? safeAcpPermissionOutcome(params.options);
    await this.respond(message.id, { outcome });
  }

  private respond(id: AcpRequestId, result: unknown) {
    if (this.disposed) return Promise.resolve(undefined);

    return this.transport.send({
      id,
      jsonrpc: jsonRpcVersion,
      result
    });
  }

  private respondError(id: AcpRequestId, code: number, message: string) {
    if (this.disposed) return Promise.resolve(undefined);

    return this.transport.send({
      error: {
        code,
        message
      },
      id,
      jsonrpc: jsonRpcVersion
    });
  }
}

function isJsonRpcResponse(message: AcpJsonRpcMessage): message is AcpJsonRpcErrorMessage | AcpJsonRpcSuccessMessage {
  return "id" in message && ("result" in message || "error" in message);
}

function jsonRpcErrorMessage(error: AcpJsonRpcErrorMessage["error"]) {
  const details = jsonRpcErrorDetails(error.data);
  if (!details || details === error.message) return error.message;

  return `${error.message}: ${details}`;
}

function jsonRpcErrorDetails(data: unknown) {
  if (typeof data === "string") return data.trim();
  if (!isRecord(data)) return "";

  const details = data.details;
  if (typeof details === "string") return details.trim();

  const message = data.message;
  return typeof message === "string" ? message.trim() : "";
}

function isJsonRpcRequest(message: AcpJsonRpcMessage): message is AcpJsonRpcRequestMessage {
  return "id" in message && "method" in message;
}

function readFileParams(params: unknown): AcpFileReadRequest | null {
  if (!isRecord(params)) return null;
  const path = stringValue(params.path);
  const sessionId = stringValue(params.sessionId);
  if (!path || !sessionId) return null;

  return {
    path,
    sessionId,
    ...(integerValue(params.line) ? { line: integerValue(params.line) } : {}),
    ...(integerValue(params.limit) ? { limit: integerValue(params.limit) } : {})
  };
}

function writeFileParams(params: unknown): AcpFileWriteRequest | null {
  if (!isRecord(params)) return null;
  const path = stringValue(params.path);
  const sessionId = stringValue(params.sessionId);
  if (!path || !sessionId || typeof params.content !== "string") return null;

  return {
    content: params.content,
    path,
    sessionId
  };
}

function permissionRequestParams(params: unknown): AcpPermissionRequest | null {
  if (!isRecord(params)) return null;

  const sessionId = stringValue(params.sessionId);
  const options = Array.isArray(params.options)
    ? params.options
      .map((option) => permissionOption(option))
      .filter((option): option is AcpPermissionOption => Boolean(option))
    : [];
  if (!sessionId || options.length === 0) return null;

  return {
    options,
    sessionId,
    toolCall: params.toolCall
  };
}

function permissionOption(value: unknown): AcpPermissionOption | null {
  if (!isRecord(value)) return null;

  const kind = permissionOptionKind(value.kind);
  const name = stringValue(value.name);
  const optionId = stringValue(value.optionId);
  if (!kind || !name || !optionId) return null;

  return { kind, name, optionId };
}

function permissionOptionKind(value: unknown): AcpPermissionOptionKind | null {
  if (
    value === "allow_once" ||
    value === "allow_always" ||
    value === "reject_once" ||
    value === "reject_always"
  ) {
    return value;
  }

  return null;
}

function normalizePermissionOutcome(
  outcome: AcpPermissionRequestOutcome | undefined,
  options: AcpPermissionOption[]
): AcpPermissionRequestOutcome | null {
  if (!outcome) return null;
  if (outcome.outcome === "cancelled") return outcome;
  if (outcome.outcome === "selected" && options.some((option) => option.optionId === outcome.optionId)) return outcome;

  return null;
}

export function safeAcpPermissionOutcome(options: AcpPermissionOption[]): AcpPermissionRequestOutcome {
  const rejectOption =
    options.find((option) => option.kind === "reject_once") ??
    options.find((option) => option.kind === "reject_always");
  if (rejectOption) {
    return {
      optionId: rejectOption.optionId,
      outcome: "selected"
    };
  }

  return { outcome: "cancelled" };
}

function textLineWindow(content: string, request: Pick<AcpFileReadRequest, "limit" | "line">) {
  const startLine = request.line;
  const limit = request.limit;
  if (!startLine && !limit) return content;

  const lines = content.split("\n");
  const startIndex = startLine ? Math.max(0, startLine - 1) : 0;
  const endIndex = limit && limit > 0 ? startIndex + limit : undefined;

  return lines.slice(startIndex, endIndex).join("\n");
}

function integerValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function withoutKey(record: Record<string, unknown>, key: string) {
  const next: Record<string, unknown> = {};
  for (const [entryKey, value] of Object.entries(record)) {
    if (entryKey !== key) next[entryKey] = value;
  }

  return next;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function extractAcpModelConfig(configOptions: unknown): AcpModelConfig | null {
  if (!Array.isArray(configOptions)) return null;

  for (const option of configOptions) {
    const normalizedOption = normalizeSessionConfigOption(option);
    if (!normalizedOption || normalizedOption.category !== "model") continue;

    return {
      configId: normalizedOption.id,
      models: flattenConfigOptions(normalizedOption.options),
      selectedModelId: normalizedOption.currentValue || null
    };
  }

  return null;
}

function normalizeSessionConfigOption(value: unknown): AcpSessionConfigOption | null {
  if (!isRecord(value)) return null;
  if (value.type !== "select") return null;
  const id = stringValue(value.id);
  const currentValue = stringValue(value.currentValue);
  const options = normalizeSessionConfigOptions(value.options);
  if (!id || !currentValue || !options) return null;

  return {
    category: stringValue(value.category),
    currentValue,
    id,
    name: stringValue(value.name),
    options,
    type: "select"
  };
}

function normalizeSessionConfigOptions(value: unknown) {
  if (!Array.isArray(value)) return null;
  const options = value
    .map((entry) => normalizeSessionConfigOptionEntry(entry))
    .filter((entry): entry is AcpSessionConfigSelectOption | AcpSessionConfigSelectGroup => Boolean(entry));

  return options.length > 0 ? options : null;
}

function normalizeSessionConfigOptionEntry(value: unknown): AcpSessionConfigSelectOption | AcpSessionConfigSelectGroup | null {
  if (!isRecord(value)) return null;
  const group = stringValue(value.group);
  const groupName = stringValue(value.name);

  if (group && Array.isArray(value.options) && groupName) {
    const options = value.options
      .map((entry) => normalizeSessionConfigSelectOption(entry))
      .filter((entry): entry is AcpSessionConfigSelectOption => Boolean(entry));

    return options.length > 0
      ? {
          group,
          name: groupName,
          options
        }
      : null;
  }

  return normalizeSessionConfigSelectOption(value);
}

function normalizeSessionConfigSelectOption(value: unknown): AcpSessionConfigSelectOption | null {
  if (!isRecord(value)) return null;
  const name = stringValue(value.name);
  const optionValue = stringValue(value.value);
  if (!name || !optionValue) return null;

  return {
    description: typeof value.description === "string" ? value.description : undefined,
    name,
    value: optionValue
  };
}

function flattenConfigOptions(options: AcpSessionConfigOption["options"]): AcpModelConfig["models"] {
  return options.flatMap((option) => {
    if ("options" in option) {
      return option.options.map((entry) => ({
        description: entry.description ?? undefined,
        id: entry.value,
        name: entry.name
      }));
    }

    return [{
      description: option.description ?? undefined,
      id: option.value,
      name: option.name
    }];
  });
}
