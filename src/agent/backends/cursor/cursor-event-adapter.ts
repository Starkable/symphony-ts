import type {
  HarnessAgentEvent,
  HarnessRuntimeEvent,
  HarnessRuntimeEventKind,
} from "../../harness/types.js";
import type { CursorCliRunResult } from "./cursor-cli-session.js";

export function createCursorHarnessEvent(input: {
  kind: HarnessRuntimeEventKind;
  timestamp?: string;
  message?: string;
  errorCode?: string;
  sessionId?: string | null;
  turnId?: string | null;
  nativeKind?: string;
  raw?: unknown;
}): HarnessRuntimeEvent {
  return {
    kind: input.kind,
    harness: "cursor",
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.nativeKind === undefined ? {} : { nativeKind: input.nativeKind }),
    ...(input.message === undefined ? {} : { message: input.message }),
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
    ...(input.raw === undefined ? {} : { raw: input.raw }),
  };
}

export function mapCursorCliResultToHarnessEvent(
  result: CursorCliRunResult,
  input: {
    turnNumber: number;
    chatId: string | null;
  },
): HarnessRuntimeEvent {
  if (result.timedOut) {
    return createCursorHarnessEvent({
      kind: "runtime_error",
      nativeKind: "turn_timeout",
      message: "Cursor CLI turn timed out",
      errorCode: "cursor_turn_timeout",
      sessionId: input.chatId,
      turnId: `turn-${input.turnNumber}`,
      raw: result,
    });
  }

  if (result.exitCode === 0) {
    return createCursorHarnessEvent({
      kind: "turn_completed",
      message: summarizeCursorOutput(result.stdout),
      sessionId: input.chatId,
      turnId: `turn-${input.turnNumber}`,
      raw: result,
    });
  }

  return createCursorHarnessEvent({
    kind: "turn_failed",
    nativeKind: `exit_${result.exitCode}`,
    message: summarizeCursorOutput(result.stderr || result.stdout),
    errorCode: `cursor_exit_${result.exitCode}`,
    sessionId: input.chatId,
    turnId: `turn-${input.turnNumber}`,
    raw: result,
  });
}

export function toCursorHarnessAgentEvent(
  event: HarnessRuntimeEvent,
  context: {
    issueId: string;
    issueIdentifier: string;
    attempt: number | null;
    workspacePath: string;
    turnCount: number;
  },
): HarnessAgentEvent {
  return {
    ...event,
    issueId: context.issueId,
    issueIdentifier: context.issueIdentifier,
    attempt: context.attempt,
    workspacePath: context.workspacePath,
    turnCount: context.turnCount,
  };
}

function summarizeCursorOutput(output: string): string {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return "cursor turn finished";
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.at(-1)?.trim() ?? trimmed;
}
