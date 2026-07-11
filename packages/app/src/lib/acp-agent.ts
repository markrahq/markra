import {
  AcpClient,
  type AcpAuthMethod,
  type AcpContentBlock,
  type AcpFileSystem,
  type AcpInitializeResponse,
  type AcpJsonRpcMessage,
  type AcpPermissions,
  type AcpPermissionRequest,
  type AcpPermissionRequestOutcome,
  type AcpSessionNewResponse,
  type AcpSessionUpdate,
  buildInlineAiMessages,
  extractAcpModelConfig,
  type AiDiffResult,
  type AiEditIntent,
  type AiSelectionContext,
  type DocumentAiChatImage,
  type DocumentAiHistoryMessage,
  type InlineAiAgentTarget,
  isAcpAuthRequiredError,
  normalizeInlineAiReplacement,
  safeAcpPermissionOutcome
} from "@markra/ai";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { getAppRuntime, type RuntimeCleanup } from "../runtime";
import type { AcpAgentSettings } from "./settings/app-settings";

export type AcpDocumentAgentRunOptions = {
  documentContent: string;
  documentPath: string | null;
  history: DocumentAiHistoryMessage[];
  images?: DocumentAiChatImage[];
  onEvent?: (event: AgentEvent) => unknown;
  onModelState?: (state: AcpAgentModelState) => unknown;
  onPermissionRequest?: (
    request: AcpPermissionRequest,
    context: AcpDocumentAgentPermissionContext
  ) => Promise<AcpPermissionRequestOutcome> | AcpPermissionRequestOutcome;
  onPreviewResult?: (result: AiDiffResult, previewId?: string) => unknown;
  onTextDelta: (text: string) => unknown;
  prompt: string;
  readWorkspaceFile?: (path: string) => Promise<string>;
  selectedModelId?: string | null;
  selection?: AiSelectionContext | null;
  settings: AcpAgentSettings;
  signal?: AbortSignal;
  workspaceKey: string | null;
};

export type AcpInlineAiAgentRunOptions = {
  documentContent: string;
  documentPath: string | null;
  intent?: AiEditIntent;
  onTextDelta?: (text: string) => unknown;
  prompt: string;
  selectedModelId?: string | null;
  settings: AcpAgentSettings;
  signal?: AbortSignal;
  target: InlineAiAgentTarget;
  translationTargetLanguage?: string;
  workspaceKey: string | null;
};

export type AcpDocumentAgentPermissionContext = {
  details: AcpToolDetails;
  safeOutcome: AcpPermissionRequestOutcome;
  toolCallId: string;
};

export type AcpAgentModelOption = {
  description?: string;
  id: string;
  name: string;
};

export type AcpAgentModelState = {
  configId: string;
  models: AcpAgentModelOption[];
  selectedModelId: string | null;
};

export async function runAcpDocumentAgent({
  documentContent,
  documentPath,
  history,
  images = [],
  onEvent,
  onModelState,
  onPermissionRequest,
  onPreviewResult,
  onTextDelta,
  prompt,
  readWorkspaceFile,
  selectedModelId,
  selection = null,
  settings,
  signal,
  workspaceKey
}: AcpDocumentAgentRunOptions) {
  const cwd = resolveAcpAgentCwd(settings, documentPath, workspaceKey);
  const workspaceRoot = resolveAcpWorkspaceRoot(documentPath, workspaceKey);
  throwIfAcpRunAborted(signal);
  let preparedPreview = false;
  let permissionRequestCount = 0;
  let writePreviewCount = 0;

  const { agentFailure, client } = await createAcpRuntimeClient({
    cwd,
    fileSystem: {
      readTextFile: ({ path }) => {
        const resolvedPath = resolveAcpRequestedPath(path, cwd);
        if (documentPath && samePath(resolvedPath, documentPath)) return documentContent;
        if (!workspaceRoot || !isPathInside(workspaceRoot, resolvedPath)) {
          throw new Error("ACP filesystem reads are only available inside the current workspace.");
        }
        if (readWorkspaceFile) return readWorkspaceFile(resolvedPath);

        throw new Error("ACP filesystem reads are only available for the current document.");
      },
      writeTextFile: ({ content, path }) => {
        const resolvedPath = resolveAcpRequestedPath(path, cwd);
        const result = currentDocumentWritePreview({
          content,
          documentContent,
          documentPath,
          path: resolvedPath
        });
        if (!result) return;

        preparedPreview = true;
        writePreviewCount += 1;
        onPreviewResult?.(result, `acp-write:${resolvedPath}:${writePreviewCount}`);
      }
    },
    permissions: {
      requestPermission: async (request) => {
        permissionRequestCount += 1;
        const toolCallId = `acp-permission-${permissionRequestCount}`;
        const safeOutcome = safeAcpPermissionOutcome(request.options);
        const startSummary = onPermissionRequest
          ? "Waiting for user permission."
          : acpPermissionOutcomeSummary(safeOutcome, request.options, "Markra");
        const startDetails = acpPermissionDetails(request, startSummary, "pending");

        onEvent?.({
          args: startDetails,
          toolCallId,
          toolName: "acp.permission",
          type: "tool_execution_start"
        });

        const outcome = onPermissionRequest
          ? await onPermissionRequest(request, {
              details: startDetails,
              safeOutcome,
              toolCallId
            })
          : safeOutcome;
        const actor = onPermissionRequest ? "user" : "Markra";
        const endSummary = acpPermissionOutcomeSummary(outcome, request.options, actor);
        const endDetails = acpPermissionDetails(request, endSummary, outcome.outcome);

        onEvent?.({
          isError: !acpPermissionOutcomeIsAllowed(outcome, request.options),
          result: {
            content: [
              {
                text: endDetails.summary,
                type: "text"
              }
            ],
            details: endDetails
          },
          toolCallId,
          toolName: "acp.permission",
          type: "tool_execution_end"
        });

        return outcome;
      }
    },
    settings
  });
  let sessionId: string | null = null;
  let stopAbortListening: (() => unknown) | null = null;
  let content = "";
  const toolSnapshots = new Map<string, AcpToolSnapshot>();
  const unsubscribe = client.subscribe((update) => {
    const modelState = acpModelStateFromConfigOptions(update.configOptions);
    if (modelState) onModelState?.(modelState);

    for (const event of agentEventsFromAcpSessionUpdate(update, toolSnapshots)) {
      onEvent?.(event);
    }

    const text = textFromAcpSessionUpdate(update);
    if (!text) return;

    content += text;
    onTextDelta(content);
  });
  const cancelRun = () => {
    agentFailure.fail(acpRunCancelledError());
    const cancelSession = sessionId
      ? Promise.resolve(client.cancel(sessionId)).catch(() => {})
      : Promise.resolve(undefined);
    cancelSession
      .then(() => client.dispose())
      .catch(() => {
        client.dispose().catch(() => {});
      });
  };
  if (signal) {
    if (signal.aborted) {
      cancelRun();
    } else {
      signal.addEventListener("abort", cancelRun, { once: true });
      stopAbortListening = () => signal.removeEventListener("abort", cancelRun);
    }
  }

  try {
    const initializeResponse = await agentFailure.race(client.initialize({ name: "markra", title: "Markra" }));
    const session = await createAcpSession({
      agentFailure,
      client,
      cwd,
      initializeResponse,
      onEvent
    });
    sessionId = session.sessionId;
    throwIfAcpRunAborted(signal);
    await configureAcpSelectedModel({ agentFailure, client, onModelState, selectedModelId, session });

    throwIfAcpRunAborted(signal);
    await agentFailure.race(client.prompt({
      prompt: createAcpPromptBlocks({ documentContent, documentPath, history, images, prompt, selection }),
      sessionId: session.sessionId
    }));

    return {
      content: preparedPreview ? "" : content,
      finishReason: "stop" as const,
      preparedPreview,
      stopReasonCode: undefined
    };
  } finally {
    stopAbortListening?.();
    unsubscribe();
    await client.dispose().catch(() => {});
  }
}

export async function runAcpInlineAiAgent({
  documentContent,
  documentPath,
  intent = "custom",
  onTextDelta,
  prompt,
  selectedModelId,
  settings,
  signal,
  target,
  translationTargetLanguage,
  workspaceKey
}: AcpInlineAiAgentRunOptions) {
  const cwd = resolveAcpAgentCwd(settings, documentPath, workspaceKey);
  throwIfAcpRunAborted(signal);
  // Inline ACP returns text for Markra's existing preview flow; it should not write files directly.
  const fileSystem: AcpFileSystem | undefined = documentPath
    ? {
        readTextFile: ({ path }) => {
          const resolvedPath = resolveAcpRequestedPath(path, cwd);
          if (samePath(resolvedPath, documentPath)) return documentContent;

          throw new Error("ACP inline filesystem reads are only available for the current document.");
        }
      }
    : undefined;
  const { agentFailure, client } = await createAcpRuntimeClient({
    cwd,
    fileSystem,
    settings
  });
  let sessionId: string | null = null;
  let stopAbortListening: (() => unknown) | null = null;
  let content = "";
  const unsubscribe = client.subscribe((update) => {
    const text = textFromAcpSessionUpdate(update);
    if (!text) return;

    content += text;
    onTextDelta?.(content);
  });
  const cancelRun = () => {
    agentFailure.fail(acpRunCancelledError());
    const cancelSession = sessionId
      ? Promise.resolve(client.cancel(sessionId)).catch(() => {})
      : Promise.resolve(undefined);
    cancelSession
      .then(() => client.dispose())
      .catch(() => {
        client.dispose().catch(() => {});
      });
  };
  if (signal) {
    if (signal.aborted) {
      cancelRun();
    } else {
      signal.addEventListener("abort", cancelRun, { once: true });
      stopAbortListening = () => signal.removeEventListener("abort", cancelRun);
    }
  }

  try {
    const initializeResponse = await agentFailure.race(client.initialize({ name: "markra", title: "Markra" }));
    const session = await createAcpSession({
      agentFailure,
      client,
      cwd,
      initializeResponse
    });
    sessionId = session.sessionId;
    throwIfAcpRunAborted(signal);
    await configureAcpSelectedModel({ agentFailure, client, selectedModelId, session });

    throwIfAcpRunAborted(signal);
    await agentFailure.race(client.prompt({
      prompt: createAcpInlinePromptBlocks({
        documentContent,
        intent,
        prompt,
        target,
        translationTargetLanguage
      }),
      sessionId: session.sessionId
    }));

    return {
      content: normalizeInlineAiReplacement(content, {
        preserveLeadingWhitespace: target.type === "insert"
      }),
      finishReason: "stop" as const
    };
  } finally {
    stopAbortListening?.();
    unsubscribe();
    await client.dispose().catch(() => {});
  }
}

function acpModelStateFromConfigOptions(configOptions: unknown): AcpAgentModelState | null {
  const config = extractAcpModelConfig(configOptions);
  if (!config) return null;

  return {
    configId: config.configId,
    models: config.models,
    selectedModelId: config.selectedModelId
  };
}

function hasAcpModel(state: AcpAgentModelState, modelId: string) {
  return state.models.some((model) => model.id === modelId);
}

type AcpAgentFailureSignal = ReturnType<typeof createAcpAgentFailureSignal>;

async function createAcpRuntimeClient({
  cwd,
  fileSystem,
  permissions,
  settings
}: {
  cwd: string;
  fileSystem?: AcpFileSystem;
  permissions?: AcpPermissions;
  settings: AcpAgentSettings;
}) {
  const runtime = getAppRuntime();
  const connection = await runtime.acp.startAgent({
    args: parseAcpAgentArgs(settings.args),
    command: settings.command,
    cwd,
    env: []
  });
  let stopListening: RuntimeCleanup | null = null;
  const agentFailure = createAcpAgentFailureSignal();
  const stderrMessages: string[] = [];
  const transportHandlers = new Set<(message: AcpJsonRpcMessage) => unknown>();

  try {
    stopListening = await runtime.acp.listenAgentMessages((event) => {
      if (event.connectionId !== connection.connectionId) return;
      if (event.type === "stderr") {
        appendAcpStderrMessage(stderrMessages, event.message);
        return;
      }
      if (event.type === "exit") {
        agentFailure.fail(acpAgentExitedError(event.message, stderrMessages));
        return;
      }
      if (event.type !== "message") return;

      const message = parseAcpJsonRpcMessage(event.message);
      if (!message) return;

      transportHandlers.forEach((handler) => handler(message));
    });
  } catch (error) {
    await runtime.acp.stopAgent(connection.connectionId).catch(() => {});
    throw error;
  }

  const client = new AcpClient({
    fileSystem,
    permissions,
    transport: {
      close: async () => {
        if (stopListening) {
          await Promise.resolve(stopListening());
          stopListening = null;
        }
        await runtime.acp.stopAgent(connection.connectionId);
      },
      onMessage: (handler) => {
        transportHandlers.add(handler);

        return () => {
          transportHandlers.delete(handler);
        };
      },
      send: (message) => runtime.acp.writeAgentMessage(connection.connectionId, message)
    }
  });

  return { agentFailure, client };
}

async function configureAcpSelectedModel({
  agentFailure,
  client,
  onModelState,
  selectedModelId,
  session
}: {
  agentFailure: AcpAgentFailureSignal;
  client: AcpClient;
  onModelState?: (state: AcpAgentModelState) => unknown;
  selectedModelId?: string | null;
  session: AcpSessionNewResponse;
}) {
  let modelState = acpModelStateFromConfigOptions(session.configOptions);
  if (modelState) {
    onModelState?.(modelState);
  }

  if (!selectedModelId || !modelState || modelState.selectedModelId === selectedModelId || !hasAcpModel(modelState, selectedModelId)) {
    return;
  }

  const response = await agentFailure.race(client.setSessionConfigOption({
    configId: modelState.configId,
    sessionId: session.sessionId,
    value: selectedModelId
  }));
  modelState = acpModelStateFromConfigOptions(response.configOptions) ?? {
    ...modelState,
    selectedModelId
  };
  onModelState?.(modelState);
}

async function createAcpSession({
  agentFailure,
  client,
  cwd,
  initializeResponse,
  onEvent
}: {
  agentFailure: AcpAgentFailureSignal;
  client: AcpClient;
  cwd: string;
  initializeResponse: AcpInitializeResponse;
  onEvent?: (event: AgentEvent) => unknown;
}): Promise<AcpSessionNewResponse> {
  try {
    return await agentFailure.race(client.createSession({ cwd }));
  } catch (error) {
    if (!isAcpAuthRequiredError(error)) throw error;
  }

  const authMethod = firstAcpAuthMethod(initializeResponse.authMethods);
  if (!authMethod) {
    throw new Error("ACP agent requires authentication, but did not advertise an authentication method.");
  }

  await authenticateAcpAgent({ agentFailure, authMethod, client, onEvent });

  return agentFailure.race(client.createSession({ cwd }));
}

async function authenticateAcpAgent({
  agentFailure,
  authMethod,
  client,
  onEvent
}: {
  agentFailure: AcpAgentFailureSignal;
  authMethod: AcpAuthMethod;
  client: AcpClient;
  onEvent?: (event: AgentEvent) => unknown;
}) {
  const toolCallId = "acp-authentication";
  const startDetails = acpAuthenticationDetails(
    authMethod,
    authMethod.description?.trim() || "Authentication required."
  );
  onEvent?.({
    args: startDetails,
    toolCallId,
    toolName: "acp.authentication",
    type: "tool_execution_start"
  });

  try {
    await agentFailure.race(client.authenticate(authMethod.id));
  } catch (error) {
    const message = caughtErrorMessage(error, "Authentication failed.");
    const errorDetails = acpAuthenticationDetails(authMethod, message);
    onEvent?.({
      isError: true,
      result: {
        content: [{ text: message, type: "text" }],
        details: errorDetails
      },
      toolCallId,
      toolName: "acp.authentication",
      type: "tool_execution_end"
    });
    throw error;
  }

  const completedDetails = acpAuthenticationDetails(authMethod, "Authentication completed.");
  onEvent?.({
    isError: false,
    result: {
      details: completedDetails
    },
    toolCallId,
    toolName: "acp.authentication",
    type: "tool_execution_end"
  });
}

function firstAcpAuthMethod(authMethods: unknown): AcpAuthMethod | null {
  if (!Array.isArray(authMethods)) return null;

  for (const value of authMethods) {
    const method = acpAuthMethod(value);
    if (method) return method;
  }

  return null;
}

function acpAuthMethod(value: unknown): AcpAuthMethod | null {
  if (!isRecord(value)) return null;

  const id = stringValue(value.id);
  const name = stringValue(value.name);
  const description = typeof value.description === "string" && value.description.trim()
    ? value.description.trim()
    : undefined;
  if (!id || !name) return null;

  return {
    ...(description ? { description } : {}),
    id,
    name
  };
}

function acpAuthenticationDetails(authMethod: AcpAuthMethod, summary: string): AcpToolDetails {
  return {
    kind: "auth",
    summary,
    title: `Authenticate ACP agent: ${authMethod.name}`
  };
}

function caughtErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();

  return fallback;
}

type AcpToolSnapshot = {
  details: AcpToolDetails;
  toolName: string;
};

export type AcpToolDetails = {
  command?: string;
  cwd?: string;
  kind?: string;
  path?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  status?: string;
  summary?: string;
  title?: string;
};

function agentEventsFromAcpSessionUpdate(update: AcpSessionUpdate, toolSnapshots: Map<string, AcpToolSnapshot>) {
  const toolEvent = agentEventFromAcpToolUpdate(update, toolSnapshots);
  if (toolEvent) return [toolEvent];

  const statusEvent = agentEventFromAcpStatusUpdate(update);
  return statusEvent ? [statusEvent] : [];
}

function agentEventFromAcpToolUpdate(update: AcpSessionUpdate, toolSnapshots: Map<string, AcpToolSnapshot>): AgentEvent | null {
  if (update.type !== "tool_call" && update.type !== "tool_call_update") return null;

  const toolCallId = stringValue(update.toolCallId);
  if (!toolCallId) return null;

  const previousSnapshot = toolSnapshots.get(toolCallId);
  const details = {
    ...(previousSnapshot?.details ?? {}),
    ...acpToolDetailsFromUpdate(update)
  };
  const kind = details.kind ?? previousSnapshot?.details.kind ?? "other";
  const toolName = previousSnapshot?.toolName ?? acpToolName(kind);
  toolSnapshots.set(toolCallId, { details, toolName });

  const status = details.status;
  if (status === "completed" || status === "failed") {
    return {
      isError: status === "failed",
      result: acpToolResult(details, status),
      toolCallId,
      toolName,
      type: "tool_execution_end"
    };
  }

  return {
    args: details,
    toolCallId,
    toolName,
    type: "tool_execution_start"
  };
}

function agentEventFromAcpStatusUpdate(update: AcpSessionUpdate): AgentEvent | null {
  const title = acpStatusTitle(update);
  if (!title) return null;

  return {
    isError: false,
    result: {
      details: {
        status: update.type,
        summary: acpStatusSummary(update),
        title
      }
    },
    toolCallId: `acp-status:${update.sessionId}:${update.type}`,
    toolName: "acp.status",
    type: "tool_execution_end"
  };
}

function acpToolName(kind: string) {
  return `acp.${kind}`;
}

function acpToolResult(details: AcpToolDetails, status: string) {
  const content = status === "failed"
    ? [
        {
          text: acpToolErrorText(details),
          type: "text"
        }
      ]
    : [];

  return {
    content,
    details
  };
}

function acpToolErrorText(details: AcpToolDetails) {
  const rawOutput = recordValue(details.rawOutput);
  const message =
    stringValue(rawOutput?.message) ??
    stringValue(rawOutput?.error) ??
    stringValue(rawOutput?.formatted_output) ??
    stringValue(details.summary);

  return message ?? `${details.title ?? "ACP tool"} failed.`;
}

function acpToolDetailsFromUpdate(update: AcpSessionUpdate): AcpToolDetails {
  const details: AcpToolDetails = {};
  const title = stringValue(update.title);
  const kind = stringValue(update.kind);
  const status = stringValue(update.status);
  const path = acpToolPath(update);
  const rawInput = update.rawInput;
  const rawInputRecord = recordValue(rawInput);
  const command = stringValue(rawInputRecord?.command);
  const cwd = stringValue(rawInputRecord?.cwd);
  const rawOutput = update.rawOutput;
  const summary = acpToolSummary(update);

  if (title) details.title = title;
  if (kind) details.kind = kind;
  if (status) details.status = status;
  if (path) details.path = path;
  if (command) details.command = command;
  if (cwd) details.cwd = cwd;
  if (summary) details.summary = summary;
  if ("rawInput" in update) details.rawInput = rawInput;
  if ("rawOutput" in update) details.rawOutput = rawOutput;

  return details;
}

function acpToolPath(update: AcpSessionUpdate) {
  const locationPath = Array.isArray(update.locations)
    ? update.locations
        .map((location) => stringValue(recordValue(location)?.path))
        .find(Boolean)
    : undefined;
  if (locationPath) return locationPath;

  return stringValue(recordValue(update.rawInput)?.path);
}

function acpToolSummary(update: AcpSessionUpdate) {
  const rawOutputSummary = acpRawOutputSummary(update.rawOutput);
  if (rawOutputSummary) return rawOutputSummary;

  if (Array.isArray(update.content)) {
    const firstText = update.content
      .map((content) => stringValue(recordValue(content)?.text))
      .find(Boolean);
    if (firstText) return firstText;
  }

  return undefined;
}

function acpRawOutputSummary(rawOutput: unknown) {
  const output = recordValue(rawOutput);
  if (!output) return undefined;

  return (
    stringValue(output.formatted_output) ??
    stringValue(output.output) ??
    stringValue(output.result) ??
    stringValue(output.error) ??
    stringValue(output.message)
  );
}

function acpStatusTitle(update: AcpSessionUpdate) {
  if (update.type === "session_info_update") return stringValue(update.title);

  if (update.type === "current_mode_update") {
    const modeId = stringValue(update.currentModeId);
    return modeId ? `ACP mode: ${modeId}` : null;
  }

  if (update.type === "plan" || update.type === "plan_update") {
    return acpPlanStepCount(update) > 0 ? "ACP plan updated" : null;
  }

  if (update.type === "plan_removed") return "ACP plan removed";

  return null;
}

function acpStatusSummary(update: AcpSessionUpdate) {
  if (update.type !== "plan" && update.type !== "plan_update") return update.type;

  const stepCount = acpPlanStepCount(update);
  if (stepCount === 0) return update.type;

  const unit = stepCount === 1 ? "step" : "steps";
  return `${stepCount} ${unit}`;
}

function acpPlanStepCount(update: AcpSessionUpdate) {
  if (Array.isArray(update.entries)) return update.entries.length;

  const plan = recordValue(update.plan);
  if (Array.isArray(plan?.entries)) return plan.entries.length;

  return 0;
}

function acpPermissionDetails(request: AcpPermissionRequest, summary: string, status: string): AcpToolDetails {
  const toolCall = recordValue(request.toolCall);
  const toolTitle = stringValue(toolCall?.title) ?? stringValue(toolCall?.name);
  const kind = stringValue(toolCall?.kind);
  const path = stringValue(toolCall?.path);

  return {
    ...(kind ? { kind } : {}),
    ...(path ? { path } : {}),
    rawInput: request.toolCall,
    status,
    summary,
    title: toolTitle ? `Permission requested: ${toolTitle}` : "Permission requested"
  };
}

function acpPermissionOutcomeSummary(
  outcome: AcpPermissionRequestOutcome,
  options: AcpPermissionRequest["options"],
  actor: "Markra" | "user"
) {
  if (outcome.outcome === "cancelled") return `Permission cancelled by ${actor}.`;

  return acpPermissionOutcomeIsAllowed(outcome, options)
    ? `Permission allowed by ${actor}.`
    : `Permission rejected by ${actor}.`;
}

function acpPermissionOutcomeIsAllowed(
  outcome: AcpPermissionRequestOutcome,
  options: AcpPermissionRequest["options"]
) {
  if (outcome.outcome !== "selected") return false;

  const selectedOption = options.find((option) => option.optionId === outcome.optionId);
  return selectedOption?.kind === "allow_once" || selectedOption?.kind === "allow_always";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function createAcpAgentFailureSignal() {
  let rejectFailure: ((error: Error) => unknown) | null = null;
  const failure = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  failure.catch(() => {});

  return {
    fail(error: Error) {
      rejectFailure?.(error);
      rejectFailure = null;
    },
    race<T>(promise: Promise<T>) {
      return Promise.race([promise, failure]);
    }
  };
}

function appendAcpStderrMessage(messages: string[], message: string) {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) return;

  messages.push(normalizedMessage);
  if (messages.length > 12) messages.shift();
}

function acpAgentExitedError(message: string, stderrMessages: string[]) {
  const exitMessage = message.trim();
  const stderr = stderrMessages.join("\n").trim();
  const details = [stderr, exitMessage].filter(Boolean).join("\n");

  return new Error(details ? `ACP agent exited before completing the request:\n${details}` : "ACP agent exited before completing the request.");
}

export function parseAcpAgentArgs(input: string) {
  const args: string[] = [];
  let currentArg = "";
  let quote: "\"" | "'" | null = null;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      currentArg += char;
      escaping = false;
      continue;
    }

    if (quote) {
      if (char === "\\" && quote === "\"") {
        escaping = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }

      currentArg += char;
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (currentArg) {
        args.push(currentArg);
        currentArg = "";
      }
      continue;
    }

    currentArg += char;
  }

  if (currentArg) args.push(currentArg);
  return args;
}

export function resolveAcpAgentCwd(settings: AcpAgentSettings, documentPath: string | null, workspaceKey: string | null) {
  if (settings.cwd) return settings.cwd;
  if (documentPath && workspaceKey && samePath(documentPath, workspaceKey)) {
    return parentPath(documentPath) ?? ".";
  }

  return workspaceKey ?? parentPath(documentPath) ?? ".";
}

function resolveAcpWorkspaceRoot(documentPath: string | null, workspaceKey: string | null) {
  if (documentPath && workspaceKey && samePath(documentPath, workspaceKey)) {
    return parentPath(documentPath);
  }

  return workspaceKey ?? parentPath(documentPath);
}

function resolveAcpRequestedPath(path: string, cwd: string) {
  const requestedPath = pathFromFileUri(path) ?? path;
  const normalizedPath = normalizePathSeparators(requestedPath).trim();
  if (!normalizedPath) return normalizedPath;
  if (isAbsolutePath(normalizedPath)) return normalizePathSegments(normalizedPath);

  return normalizePathSegments(joinPath(cwd, normalizedPath));
}

function pathFromFileUri(path: string) {
  if (!path.startsWith("file://")) return null;

  try {
    return decodeURIComponent(new URL(path).pathname);
  } catch {
    return null;
  }
}

function isPathInside(root: string, path: string) {
  const normalizedRoot = normalizePathForComparison(root);
  const normalizedPath = normalizePathForComparison(path);
  if (!normalizedRoot || !normalizedPath) return false;

  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function isAbsolutePath(path: string) {
  return path.startsWith("/") || path.startsWith("//") || /^[A-Za-z]:\//.test(path);
}

function joinPath(basePath: string, relativePath: string) {
  if (!basePath || basePath === ".") return relativePath;

  return `${basePath.replace(/[\\/]+$/, "")}/${relativePath}`;
}

function normalizePathSegments(path: string) {
  const normalizedPath = normalizePathSeparators(path);
  const drivePrefix = normalizedPath.match(/^([A-Za-z]:)(?:\/|$)/)?.[1] ?? "";
  const isAbsolute = normalizedPath.startsWith("/");
  const pathWithoutPrefix = drivePrefix
    ? normalizedPath.slice(drivePrefix.length)
    : normalizedPath;
  const segments: string[] = [];

  for (const segment of pathWithoutPrefix.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      const previousSegment = segments.at(-1);
      if (previousSegment && previousSegment !== "..") {
        segments.pop();
      } else if (!isAbsolute && !drivePrefix) {
        segments.push(segment);
      }
      continue;
    }

    segments.push(segment);
  }

  const prefix = drivePrefix
    ? `${drivePrefix}/`
    : isAbsolute
      ? "/"
      : "";
  return `${prefix}${segments.join("/")}`.replace(/\/+$/, "") || prefix || ".";
}

function currentDocumentWritePreview({
  content,
  documentContent,
  documentPath,
  path
}: {
  content: string;
  documentContent: string;
  documentPath: string | null;
  path: string;
}): AiDiffResult | null {
  if (!documentPath || !samePath(path, documentPath)) {
    throw new Error("ACP filesystem writes are only available for the current document preview.");
  }
  if (content === documentContent) return null;

  return {
    from: 0,
    original: documentContent,
    replacement: content,
    target: {
      kind: "document",
      title: fileNameFromPath(documentPath)
    },
    to: documentContent.length,
    type: "replace"
  };
}

function samePath(firstPath: string, secondPath: string) {
  return normalizePathForComparison(firstPath) === normalizePathForComparison(secondPath);
}

function normalizePathForComparison(path: string) {
  const normalizedPath = normalizePathSegments(path);
  return /^[A-Za-z]:\//.test(normalizedPath)
    ? normalizedPath.toLowerCase()
    : normalizedPath;
}

function normalizePathSeparators(path: string) {
  return path.replace(/\\/g, "/");
}

function parentPath(path: string | null) {
  const normalizedPath = path?.trim();
  if (!normalizedPath) return null;

  const separatorIndex = Math.max(normalizedPath.lastIndexOf("/"), normalizedPath.lastIndexOf("\\"));
  if (separatorIndex > 0) return normalizedPath.slice(0, separatorIndex);
  if (separatorIndex === 0) return normalizedPath.slice(0, 1);

  return null;
}

function fileNameFromPath(path: string) {
  const normalizedPath = normalizePathSeparators(path).replace(/\/+$/, "");
  const separatorIndex = normalizedPath.lastIndexOf("/");

  return separatorIndex >= 0 ? normalizedPath.slice(separatorIndex + 1) : normalizedPath;
}

function createAcpPromptBlocks({
  documentContent,
  documentPath,
  history,
  images = [],
  prompt,
  selection
}: Pick<AcpDocumentAgentRunOptions, "documentContent" | "documentPath" | "history" | "images" | "prompt" | "selection">): AcpContentBlock[] {
  const blocks: AcpContentBlock[] = [];

  if (history.length > 0) {
    blocks.push({
      text: "Conversation so far:",
      type: "text"
    });
    history.forEach((message) => {
      const text = `${message.role}: ${message.text}`.trim();
      if (text) {
        blocks.push({ text, type: "text" });
      }
      blocks.push(...(message.images ?? []).map(acpImageResourceBlock));
    });
  }

  blocks.push({
    resource: {
      mimeType: "text/markdown",
      text: documentContent,
      uri: documentPath ? `file://${documentPath}` : "markra://current-document"
    },
    type: "resource"
  });
  const editorContext = formatAcpEditorContextText(selection);
  if (editorContext) {
    blocks.push({
      text: editorContext,
      type: "text"
    });
  }
  blocks.push({
    text: `User request:\n${prompt.trim() || (images.length > 0 ? "Attached images" : "")}`,
    type: "text"
  });
  blocks.push(...images.map(acpImageResourceBlock));

  return blocks;
}

function acpImageResourceBlock(image: DocumentAiChatImage): AcpContentBlock {
  return {
    resource: {
      blob: base64DataFromDataUrl(image.dataUrl),
      mimeType: image.mimeType,
      uri: `markra://chat-attachment/${image.id}`
    },
    type: "resource"
  };
}

function base64DataFromDataUrl(dataUrl: string) {
  const marker = ";base64,";
  const markerIndex = dataUrl.indexOf(marker);

  return markerIndex >= 0 ? dataUrl.slice(markerIndex + marker.length) : dataUrl;
}

function createAcpInlinePromptBlocks({
  documentContent,
  intent,
  prompt,
  target,
  translationTargetLanguage
}: Pick<AcpInlineAiAgentRunOptions, "documentContent" | "intent" | "prompt" | "target" | "translationTargetLanguage">): AcpContentBlock[] {
  const targetContext = nearbyTargetContext(documentContent, target.from, target.to, {
    direction: target.type === "insert" || intent === "continue" ? "before" : "around"
  });
  const messages = buildInlineAiMessages({
    documentContent: "",
    intent,
    prompt,
    suggestionContext: target.suggestionContext,
    targetContext,
    targetScope: target.scope,
    targetText: target.promptText,
    targetType: target.type,
    translationTargetLanguage
  });
  const systemPrompt = messages.find((message) => message.role === "system")?.content ?? "";
  const userPrompt = messages
    .filter((message) => message.role !== "system")
    .map((message) => message.content)
    .join("\n\n");
  const targetRange = acpInlineTargetRange(target);

  return [
    {
      text: [
        "Markra inline edit task:",
        systemPrompt,
        targetRange ? `Target range:\n${targetRange}` : null,
        userPrompt
      ].filter(Boolean).join("\n\n"),
      type: "text"
    }
  ];
}

function formatAcpEditorContextText(selection: AiSelectionContext | null | undefined) {
  if (!selection || !selection.text.trim()) return null;

  const source = selection.source ?? "selection";
  const snapshotLabel = source === "block" ? "Current block snapshot:" : "Current selection snapshot:";
  const textLabel = source === "block" ? "Block text:" : "Selected text:";

  return [
    "Markra editor context:",
    snapshotLabel,
    `Range: ${selection.from}-${selection.to}`,
    `Cursor: ${selection.cursor ?? selection.to}`,
    `Source: ${source}`,
    "",
    `${textLabel}\n${selection.text}`
  ].join("\n");
}

function acpInlineTargetRange(target: InlineAiAgentTarget) {
  if (typeof target.from !== "number" || typeof target.to !== "number") return null;

  return `${target.from}-${target.to}`;
}

const maxTargetContextChars = 1_600;

function nearbyTargetContext(
  documentContent: string,
  from: number | undefined,
  to: number | undefined,
  {
    direction = "around"
  }: {
    direction?: "around" | "before";
  } = {}
) {
  if (typeof from !== "number" || typeof to !== "number") return null;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || to < from) return null;

  const targetFrom = clampPosition(from, documentContent.length);
  const targetTo = clampPosition(to, documentContent.length);
  const beforeChars = direction === "before" ? maxTargetContextChars : Math.floor(maxTargetContextChars / 2);
  const afterChars = direction === "before" ? 0 : Math.floor(maxTargetContextChars / 2);

  const contextStart = Math.max(0, targetFrom - beforeChars);
  const contextEnd = Math.min(documentContent.length, targetTo + afterChars);
  const lineStart = documentContent.lastIndexOf("\n", Math.max(0, contextStart - 1)) + 1;
  const nextLineBreak = documentContent.indexOf("\n", contextEnd);
  const lineEnd = nextLineBreak === -1 ? documentContent.length : nextLineBreak;
  const excerpt = documentContent.slice(lineStart, lineEnd).trim();

  if (!excerpt) return null;
  if (excerpt.length <= maxTargetContextChars) return excerpt;

  return compactTargetContext(excerpt, targetFrom - lineStart, targetTo - lineStart);
}

function compactTargetContext(excerpt: string, targetFrom: number, targetTo: number) {
  const targetText = excerpt.slice(targetFrom, targetTo);
  const sideLength = Math.max(0, Math.floor((maxTargetContextChars - targetText.length) / 2) - 8);
  const start = Math.max(0, targetFrom - sideLength);
  const end = Math.min(excerpt.length, targetTo + sideLength);
  const prefix = start > 0 ? "[...]\n" : "";
  const suffix = end < excerpt.length ? "\n[...]" : "";

  return `${prefix}${excerpt.slice(start, end).trim()}${suffix}`;
}

function clampPosition(position: number, documentLength: number) {
  return Math.min(Math.max(position, 0), documentLength);
}

function parseAcpJsonRpcMessage(message: string): AcpJsonRpcMessage | null {
  try {
    const parsed = JSON.parse(message);
    if (!isRecord(parsed)) return null;
    if (parsed.jsonrpc !== "2.0") return null;

    return parsed as AcpJsonRpcMessage;
  } catch {
    return null;
  }
}

function textFromAcpSessionUpdate(update: { type: string } & Record<string, unknown>): string {
  if (update.type !== "agent_message_chunk") return "";

  return textFromAcpContent(update.content);
}

function textFromAcpContent(content: unknown): string {
  if (Array.isArray(content)) return content.map((item) => textFromAcpContent(item)).join("");
  if (!isRecord(content)) return "";
  if (content.type !== "text") return "";

  return typeof content.text === "string" ? content.text : "";
}

function throwIfAcpRunAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return;

  throw acpRunCancelledError();
}

function acpRunCancelledError() {
  return new Error("ACP agent request was cancelled.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
