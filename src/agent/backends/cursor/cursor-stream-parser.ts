import type { HarnessRuntimeEvent, HarnessUsage } from "../../harness/types.js";
import { createCursorHarnessEvent } from "./cursor-event-adapter.js";

export interface CursorStreamParserState {
  sessionId: string | null;
  thinkingBuffer: string;
  usage: HarnessUsage | null;
  terminalEvent: HarnessRuntimeEvent | null;
}

export interface CursorStreamParserCallbacks {
  onEvent: (event: HarnessRuntimeEvent) => void;
  onSessionId?: (sessionId: string) => void;
}

export function createCursorStreamParser(
  callbacks: CursorStreamParserCallbacks,
): {
  handleLine: (line: string) => void;
  getState: () => CursorStreamParserState;
} {
  const state: CursorStreamParserState = {
    sessionId: null,
    thinkingBuffer: "",
    usage: null,
    terminalEvent: null,
  };

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (trimmed === "") {
      return;
    }

    let raw: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return;
      }
      raw = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    handleCursorEvent(raw, state, callbacks);
  };

  return {
    handleLine,
    getState: () => ({ ...state }),
  };
}

function handleCursorEvent(
  raw: Record<string, unknown>,
  state: CursorStreamParserState,
  callbacks: CursorStreamParserCallbacks,
): void {
  const eventType = typeof raw.type === "string" ? raw.type : "";

  switch (eventType) {
    case "system":
      handleSystem(raw, state, callbacks);
      break;
    case "thinking":
      handleThinking(raw, state, callbacks);
      break;
    case "assistant":
      handleAssistant(raw, callbacks);
      break;
    case "tool_call":
      handleToolCall(raw, callbacks);
      break;
    case "interaction_query":
      break;
    case "result":
      handleResult(raw, state, callbacks);
      break;
    default:
      break;
  }
}

function handleSystem(
  raw: Record<string, unknown>,
  state: CursorStreamParserState,
  callbacks: CursorStreamParserCallbacks,
): void {
  const sessionId = readString(raw.session_id);
  if (sessionId !== null) {
    state.sessionId = sessionId;
    callbacks.onSessionId?.(sessionId);
  }

  const model = readString(raw.model) ?? "cursor";
  callbacks.onEvent(
    createCursorHarnessEvent({
      kind: "notification",
      nativeKind: "system_init",
      message: `Cursor session init (${model})`,
      sessionId: state.sessionId,
    }),
  );
}

function handleThinking(
  raw: Record<string, unknown>,
  state: CursorStreamParserState,
  callbacks: CursorStreamParserCallbacks,
): void {
  const subtype = readString(raw.subtype);
  if (subtype === "delta") {
    const text = readString(raw.text);
    if (text !== null) {
      state.thinkingBuffer += text;
    }
    return;
  }

  const thinking = state.thinkingBuffer.trim();
  state.thinkingBuffer = "";
  if (thinking.length === 0) {
    return;
  }

  callbacks.onEvent(
    createCursorHarnessEvent({
      kind: "notification",
      nativeKind: "thinking",
      message: thinking,
      sessionId: state.sessionId,
    }),
  );
}

function handleAssistant(
  raw: Record<string, unknown>,
  callbacks: CursorStreamParserCallbacks,
): void {
  const message = raw.message;
  if (!message || typeof message !== "object") {
    return;
  }

  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) {
    return;
  }

  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (entry.type === "text" && typeof entry.text === "string") {
      const text = entry.text.trim();
      if (text.length > 0) {
        parts.push(text);
      }
    }
  }

  if (parts.length === 0) {
    return;
  }

  const sessionId = readString(raw.session_id);
  callbacks.onEvent(
    createCursorHarnessEvent({
      kind: "other_message",
      nativeKind: "assistant",
      message: parts.join("\n"),
      sessionId,
    }),
  );
}

function handleToolCall(
  raw: Record<string, unknown>,
  callbacks: CursorStreamParserCallbacks,
): void {
  const subtype = readString(raw.subtype);
  const toolCall = raw.tool_call;
  if (!toolCall || typeof toolCall !== "object") {
    return;
  }

  const [toolName, toolInput] = extractToolInfo(
    toolCall as Record<string, unknown>,
  );
  if (toolName === "") {
    return;
  }

  const sessionId = readString(raw.session_id);
  if (subtype === "started") {
    callbacks.onEvent(
      createCursorHarnessEvent({
        kind: "other_message",
        nativeKind: "tool_call_started",
        message:
          toolInput.length > 0
            ? `Tool ${toolName}: ${toolInput}`
            : `Tool ${toolName}`,
        toolName,
        sessionId,
      }),
    );
    return;
  }

  if (subtype === "completed") {
    callbacks.onEvent(
      createCursorHarnessEvent({
        kind: "notification",
        nativeKind: "tool_call_completed",
        message: `Tool ${toolName} completed`,
        toolName,
        sessionId,
      }),
    );
  }
}

function handleResult(
  raw: Record<string, unknown>,
  state: CursorStreamParserState,
  callbacks: CursorStreamParserCallbacks,
): void {
  const sessionId = readString(raw.session_id);
  if (sessionId !== null) {
    state.sessionId = sessionId;
    callbacks.onSessionId?.(sessionId);
  }

  const usage = parseUsage(raw.usage);
  if (usage !== null) {
    state.usage = usage;
  }

  const resultText = readString(raw.result) ?? "";
  const isError = raw.is_error === true;
  const subtype = readString(raw.subtype);

  const event = createCursorHarnessEvent({
    kind: isError ? "turn_failed" : "turn_completed",
    nativeKind: subtype ?? "result",
    message:
      resultText.trim().length > 0 ? resultText.trim() : "cursor turn finished",
    sessionId: state.sessionId,
    ...(usage === null ? {} : { usage }),
    ...(isError ? { errorCode: "cursor_result_error" } : {}),
    raw,
  });

  state.terminalEvent = event;
  callbacks.onEvent(event);
}

function extractToolInfo(toolCall: Record<string, unknown>): [string, string] {
  const toolTypes: Array<{ key: string; name: string }> = [
    { key: "shellToolCall", name: "Bash" },
    { key: "readToolCall", name: "Read" },
    { key: "editToolCall", name: "Edit" },
    { key: "writeToolCall", name: "Write" },
    { key: "listToolCall", name: "List" },
    { key: "searchToolCall", name: "Search" },
    { key: "grepToolCall", name: "Grep" },
    { key: "globToolCall", name: "Glob" },
    { key: "webFetchToolCall", name: "WebFetch" },
  ];

  for (const toolType of toolTypes) {
    const call = toolCall[toolType.key];
    if (!call || typeof call !== "object") {
      continue;
    }
    return [
      toolType.name,
      extractToolInput(toolType.name, call as Record<string, unknown>),
    ];
  }

  const description = readString(toolCall.description);
  if (description !== null) {
    return ["Tool", description];
  }

  return ["", ""];
}

function extractToolInput(
  toolName: string,
  call: Record<string, unknown>,
): string {
  const args = call.args;
  if (!args || typeof args !== "object") {
    return readString(call.description) ?? "";
  }

  const record = args as Record<string, unknown>;
  switch (toolName) {
    case "Bash":
      return readString(record.command) ?? "";
    case "Read":
      return readString(record.path) ?? "";
    case "Edit":
    case "Write":
      return readString(record.path) ?? readString(record.filePath) ?? "";
    case "Grep":
      return readString(record.pattern) ?? "";
    case "Glob":
      return readString(record.pattern) ?? "";
    default:
      return readString(call.description) ?? "";
  }
}

function parseUsage(value: unknown): HarnessUsage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const inputTokens = readNumber(record.inputTokens);
  const outputTokens = readNumber(record.outputTokens);
  if (inputTokens === null && outputTokens === null) {
    return null;
  }

  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
  };
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return null;
}

export function buildInteractionQueryApproval(input: {
  queryId: number;
  queryType: string;
}): string {
  const responseKey = `${input.queryType.replace(/Query$/, "")}Response`;
  const payload = {
    type: "interaction_query",
    subtype: "response",
    query_type: input.queryType,
    response: {
      id: input.queryId,
      [responseKey]: { approved: {} },
    },
  };
  return `${JSON.stringify(payload)}\n`;
}

export function parseInteractionQueryRequest(
  raw: Record<string, unknown>,
): { queryId: number; queryType: string } | null {
  if (readString(raw.type) !== "interaction_query") {
    return null;
  }
  if (readString(raw.subtype) !== "request") {
    return null;
  }

  const queryType = readString(raw.query_type);
  if (queryType === null) {
    return null;
  }

  const query = raw.query;
  if (!query || typeof query !== "object") {
    return null;
  }

  const idValue = (query as Record<string, unknown>).id;
  const queryId =
    typeof idValue === "number" && Number.isFinite(idValue)
      ? Math.trunc(idValue)
      : null;
  if (queryId === null) {
    return null;
  }

  return { queryId, queryType };
}
