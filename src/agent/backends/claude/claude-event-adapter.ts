import type {
  HarnessAgentEvent,
  HarnessRuntimeEvent,
  HarnessRuntimeEventKind,
  HarnessUsage,
} from "../../harness/types.js";
import type { ClaudeCliRunResult } from "./claude-cli-session.js";

export function createClaudeHarnessEvent(input: {
  kind: HarnessRuntimeEventKind;
  timestamp?: string;
  message?: string;
  errorCode?: string;
  sessionId?: string | null;
  turnId?: string | null;
  nativeKind?: string;
  toolName?: string | null;
  usage?: HarnessUsage;
  raw?: unknown;
}): HarnessRuntimeEvent {
  return {
    kind: input.kind,
    harness: "claude",
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.nativeKind === undefined ? {} : { nativeKind: input.nativeKind }),
    ...(input.message === undefined ? {} : { message: input.message }),
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    ...(input.turnId === undefined ? {} : { turnId: input.turnId }),
    ...(input.toolName === undefined ? {} : { toolName: input.toolName }),
    ...(input.usage === undefined ? {} : { usage: input.usage }),
    ...(input.raw === undefined ? {} : { raw: input.raw }),
  };
}

export function mapClaudeCliResultToHarnessEvent(
  result: ClaudeCliRunResult,
  input: {
    turnNumber: number;
    sessionId: string | null;
  },
): HarnessRuntimeEvent {
  if (result.terminalEvent !== null) {
    return {
      ...result.terminalEvent,
      sessionId:
        result.terminalEvent.sessionId ?? result.sessionId ?? input.sessionId,
      turnId: result.terminalEvent.turnId ?? `turn-${input.turnNumber}`,
    };
  }

  if (result.timedOut) {
    return createClaudeHarnessEvent({
      kind: "runtime_error",
      nativeKind: "turn_timeout",
      message: "Claude CLI turn timed out",
      errorCode: "claude_turn_timeout",
      sessionId: result.sessionId ?? input.sessionId,
      turnId: `turn-${input.turnNumber}`,
      raw: result,
    });
  }

  if (result.exitCode === 0) {
    return createClaudeHarnessEvent({
      kind: "turn_completed",
      message: "claude turn finished",
      sessionId: result.sessionId ?? input.sessionId,
      turnId: `turn-${input.turnNumber}`,
      raw: result,
    });
  }

  return createClaudeHarnessEvent({
    kind: "turn_failed",
    nativeKind: `exit_${result.exitCode}`,
    message: summarizeClaudeOutput(result.stderr || result.stdout),
    errorCode: `claude_exit_${result.exitCode}`,
    sessionId: result.sessionId ?? input.sessionId,
    turnId: `turn-${input.turnNumber}`,
    raw: result,
  });
}

export function toClaudeHarnessAgentEvent(
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

function summarizeClaudeOutput(output: string): string {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return "claude turn finished";
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.at(-1)?.trim() ?? trimmed;
}
