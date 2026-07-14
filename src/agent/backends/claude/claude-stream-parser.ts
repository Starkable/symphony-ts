import type { HarnessRuntimeEvent, HarnessUsage } from "../../harness/types.js";
import { createClaudeHarnessEvent } from "./claude-event-adapter.js";

export interface ClaudeStreamParserState {
  sessionId: string | null;
  usage: HarnessUsage | null;
  terminalEvent: HarnessRuntimeEvent | null;
}

export interface ClaudeStreamParserCallbacks {
  onEvent: (event: HarnessRuntimeEvent) => void;
  onSessionId?: (sessionId: string) => void;
}

/**
 * Minimal Claude stream-json parser (system / assistant / result / content_block tool_use).
 * Schema may evolve; keep parsing defensive.
 */
export function createClaudeStreamParser(
  callbacks: ClaudeStreamParserCallbacks,
): {
  handleLine: (line: string) => void;
  getState: () => ClaudeStreamParserState;
} {
  const state: ClaudeStreamParserState = {
    sessionId: null,
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

    handleClaudeEvent(raw, state, callbacks);
  };

  return {
    handleLine,
    getState: () => ({ ...state }),
  };
}

function handleClaudeEvent(
  raw: Record<string, unknown>,
  state: ClaudeStreamParserState,
  callbacks: ClaudeStreamParserCallbacks,
): void {
  const eventType = typeof raw.type === "string" ? raw.type : "";

  switch (eventType) {
    case "system":
      handleSystem(raw, state, callbacks);
      break;
    case "assistant":
      handleAssistant(raw, state, callbacks);
      break;
    case "result":
      handleResult(raw, state, callbacks);
      break;
    case "content_block_start":
    case "tool_use":
      handleToolHint(raw, state, callbacks);
      break;
    default:
      break;
  }
}

function handleSystem(
  raw: Record<string, unknown>,
  state: ClaudeStreamParserState,
  callbacks: ClaudeStreamParserCallbacks,
): void {
  const sessionId =
    readString(raw.session_id) ?? readString(raw.sessionId);
  if (sessionId !== null) {
    state.sessionId = sessionId;
    callbacks.onSessionId?.(sessionId);
  }

  const subtype = readString(raw.subtype) ?? "system";
  callbacks.onEvent(
    createClaudeHarnessEvent({
      kind: "notification",
      nativeKind: subtype,
      message: `Claude session ${subtype}`,
      sessionId: state.sessionId,
    }),
  );
}

function handleAssistant(
  raw: Record<string, unknown>,
  state: ClaudeStreamParserState,
  callbacks: ClaudeStreamParserCallbacks,
): void {
  const sessionId =
    readString(raw.session_id) ?? readString(raw.sessionId) ?? state.sessionId;
  if (sessionId !== null && state.sessionId === null) {
    state.sessionId = sessionId;
    callbacks.onSessionId?.(sessionId);
  }

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
    if (entry.type === "tool_use") {
      const toolName = readString(entry.name) ?? "tool";
      callbacks.onEvent(
        createClaudeHarnessEvent({
          kind: "other_message",
          nativeKind: "tool_use",
          message: `Tool ${toolName}`,
          toolName,
          sessionId: state.sessionId,
        }),
      );
    }
  }

  if (parts.length === 0) {
    return;
  }

  callbacks.onEvent(
    createClaudeHarnessEvent({
      kind: "other_message",
      nativeKind: "assistant",
      message: parts.join("\n"),
      sessionId: state.sessionId,
    }),
  );
}

function handleToolHint(
  raw: Record<string, unknown>,
  state: ClaudeStreamParserState,
  callbacks: ClaudeStreamParserCallbacks,
): void {
  const contentBlock = raw.content_block;
  if (contentBlock && typeof contentBlock === "object") {
    const block = contentBlock as Record<string, unknown>;
    if (block.type === "tool_use") {
      const toolName = readString(block.name) ?? "tool";
      callbacks.onEvent(
        createClaudeHarnessEvent({
          kind: "other_message",
          nativeKind: "tool_use",
          message: `Tool ${toolName}`,
          toolName,
          sessionId: state.sessionId,
        }),
      );
    }
  }
}

function handleResult(
  raw: Record<string, unknown>,
  state: ClaudeStreamParserState,
  callbacks: ClaudeStreamParserCallbacks,
): void {
  const sessionId =
    readString(raw.session_id) ?? readString(raw.sessionId);
  if (sessionId !== null) {
    state.sessionId = sessionId;
    callbacks.onSessionId?.(sessionId);
  }

  const usage = parseUsage(raw.usage);
  if (usage !== null) {
    state.usage = usage;
  }

  const resultText = readString(raw.result) ?? "";
  const isError = raw.is_error === true || raw.isError === true;
  const subtype = readString(raw.subtype);

  const event = createClaudeHarnessEvent({
    kind: isError ? "turn_failed" : "turn_completed",
    nativeKind: subtype ?? "result",
    message:
      resultText.trim().length > 0 ? resultText.trim() : "claude turn finished",
    sessionId: state.sessionId,
    ...(usage === null ? {} : { usage }),
    ...(isError ? { errorCode: "claude_result_error" } : {}),
    raw,
  });

  state.terminalEvent = event;
  callbacks.onEvent(event);
}

function parseUsage(value: unknown): HarnessUsage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const inputTokens =
    readNumber(record.input_tokens) ?? readNumber(record.inputTokens);
  const outputTokens =
    readNumber(record.output_tokens) ?? readNumber(record.outputTokens);
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
