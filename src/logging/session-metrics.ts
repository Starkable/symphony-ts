import type { CodexClientEvent } from "../codex/app-server-client.js";
import type { HarnessRuntimeEvent } from "../agent/harness/types.js";
import type {
  LiveSession,
  OrchestratorState,
  RunningEntry,
} from "../domain/model.js";

const SESSION_EVENT_MESSAGES: Partial<
  Record<CodexClientEvent["event"], string>
> = Object.freeze({
  session_started: "session started",
  startup_failed: "startup failed",
  turn_completed: "turn completed",
  turn_failed: "turn failed",
  turn_cancelled: "turn cancelled",
  turn_ended_with_error: "turn ended with error",
  turn_input_required: "operator input required",
  approval_auto_approved: "approval auto approved",
  unsupported_tool_call: "unsupported tool call",
  notification: "notification",
  other_message: "other message",
  malformed: "malformed event",
});

export interface SessionTelemetryUpdateResult {
  inputTokensDelta: number;
  outputTokensDelta: number;
  totalTokensDelta: number;
  rateLimitsUpdated: boolean;
}

export function applyCodexEventToSession(
  session: LiveSession,
  event: CodexClientEvent,
): SessionTelemetryUpdateResult {
  return applyHarnessEventToSession(
    session,
    codexClientEventToHarnessRuntimeEvent(event),
  );
}

export function applyCodexEventToOrchestratorState(
  state: OrchestratorState,
  runningEntry: RunningEntry,
  event: CodexClientEvent,
): SessionTelemetryUpdateResult {
  return applyHarnessEventToOrchestratorState(
    state,
    runningEntry,
    codexClientEventToHarnessRuntimeEvent(event),
  );
}

export function applyHarnessEventToSession(
  session: LiveSession,
  event: HarnessRuntimeEvent,
): SessionTelemetryUpdateResult {
  if (event.sessionId !== undefined) {
    session.sessionId = event.sessionId;
  }
  if (event.threadId !== undefined) {
    session.threadId = event.threadId;
  }
  if (event.turnId !== undefined) {
    session.turnId = event.turnId;
  }
  session.codexAppServerPid = event.runtimePid ?? null;
  session.lastCodexEvent = event.kind;
  session.lastCodexTimestamp = event.timestamp;
  session.lastCodexMessage = summarizeHarnessEvent(event);

  if (event.kind === "session_started") {
    session.turnCount += 1;
  }

  if (event.usage === undefined) {
    return {
      inputTokensDelta: 0,
      outputTokensDelta: 0,
      totalTokensDelta: 0,
      rateLimitsUpdated: event.rateLimits !== undefined,
    };
  }

  const inputTokens = normalizeAbsoluteCounter(event.usage.inputTokens);
  const outputTokens = normalizeAbsoluteCounter(event.usage.outputTokens);
  const totalTokens = normalizeAbsoluteCounter(event.usage.totalTokens);

  const inputTokensDelta = computeCounterDelta(
    session.lastReportedInputTokens,
    inputTokens,
  );
  const outputTokensDelta = computeCounterDelta(
    session.lastReportedOutputTokens,
    outputTokens,
  );
  const totalTokensDelta = computeCounterDelta(
    session.lastReportedTotalTokens,
    totalTokens,
  );

  session.codexInputTokens = inputTokens;
  session.codexOutputTokens = outputTokens;
  session.codexTotalTokens = totalTokens;
  session.lastReportedInputTokens = inputTokens;
  session.lastReportedOutputTokens = outputTokens;
  session.lastReportedTotalTokens = totalTokens;

  return {
    inputTokensDelta,
    outputTokensDelta,
    totalTokensDelta,
    rateLimitsUpdated: event.rateLimits !== undefined,
  };
}

export function applyHarnessEventToOrchestratorState(
  state: OrchestratorState,
  runningEntry: RunningEntry,
  event: HarnessRuntimeEvent,
): SessionTelemetryUpdateResult {
  const result = applyHarnessEventToSession(runningEntry, event);

  state.codexTotals.inputTokens += result.inputTokensDelta;
  state.codexTotals.outputTokens += result.outputTokensDelta;
  state.codexTotals.totalTokens += result.totalTokensDelta;

  if (event.rateLimits !== undefined) {
    state.codexRateLimits = event.rateLimits;
  }

  return result;
}

export function addEndedSessionRuntime(
  state: OrchestratorState,
  startedAt: string,
  endedAt = new Date(),
): number {
  const startedAtMs = Date.parse(startedAt);
  const endedAtMs = endedAt.getTime();
  if (!Number.isFinite(startedAtMs) || endedAtMs < startedAtMs) {
    return state.codexTotals.secondsRunning;
  }

  const seconds = roundSeconds((endedAtMs - startedAtMs) / 1000);
  state.codexTotals.secondsRunning = roundSeconds(
    state.codexTotals.secondsRunning + seconds,
  );
  return state.codexTotals.secondsRunning;
}

export function getAggregateSecondsRunning(
  state: OrchestratorState,
  now = new Date(),
): number {
  const nowMs = now.getTime();
  let total = state.codexTotals.secondsRunning;

  for (const runningEntry of Object.values(state.running)) {
    const startedAtMs = Date.parse(runningEntry.startedAt);
    if (!Number.isFinite(startedAtMs) || nowMs < startedAtMs) {
      continue;
    }

    total += (nowMs - startedAtMs) / 1000;
  }

  return roundSeconds(total);
}

export function summarizeHarnessEvent(event: HarnessRuntimeEvent): string {
  if (event.message !== undefined && event.message.trim().length > 0) {
    return event.message.trim();
  }

  if (
    event.kind === "unsupported_tool_call" &&
    event.toolName !== undefined &&
    event.toolName !== null &&
    event.toolName.trim().length > 0
  ) {
    return `unsupported tool call: ${event.toolName.trim()}`;
  }

  const fallback =
    SESSION_EVENT_MESSAGES[event.kind as CodexClientEvent["event"]];
  return fallback ?? event.kind;
}

export function codexClientEventToHarnessRuntimeEvent(
  event: CodexClientEvent,
): HarnessRuntimeEvent {
  return {
    kind: event.event,
    harness: "codex",
    timestamp: event.timestamp,
    nativeKind: event.event,
    runtimePid: event.codexAppServerPid,
    ...(event.sessionId === undefined ? {} : { sessionId: event.sessionId }),
    ...(event.threadId === undefined ? {} : { threadId: event.threadId }),
    ...(event.turnId === undefined ? {} : { turnId: event.turnId }),
    ...(event.usage === undefined ? {} : { usage: event.usage }),
    ...(event.rateLimits === undefined ? {} : { rateLimits: event.rateLimits }),
    ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
    ...(event.message === undefined ? {} : { message: event.message }),
    ...(event.toolName === undefined ? {} : { toolName: event.toolName }),
    ...(event.raw === undefined ? {} : { raw: event.raw }),
  };
}

export function summarizeCodexEvent(event: CodexClientEvent): string {
  return summarizeHarnessEvent(codexClientEventToHarnessRuntimeEvent(event));
}

function computeCounterDelta(previous: number, next: number): number {
  if (!Number.isFinite(previous)) {
    return next;
  }
  return Math.max(0, next - previous);
}

function normalizeAbsoluteCounter(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
