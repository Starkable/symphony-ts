import type { CodexClientEvent } from "../../../codex/app-server-client.js";
import type {
  HarnessAgentEvent,
  HarnessKind,
  HarnessRuntimeEvent,
  HarnessRuntimeEventKind,
} from "../../harness/types.js";
import type { AgentRunnerEvent } from "../../runner.js";

const CODEX_EVENT_KINDS = new Set<HarnessRuntimeEventKind>([
  "session_started",
  "startup_failed",
  "turn_completed",
  "turn_failed",
  "turn_cancelled",
  "turn_ended_with_error",
  "turn_input_required",
  "approval_auto_approved",
  "unsupported_tool_call",
  "notification",
  "other_message",
  "malformed",
]);

export function mapCodexEventToHarnessEvent(
  event: CodexClientEvent,
  harness: HarnessKind = "codex",
): HarnessRuntimeEvent {
  const kind = CODEX_EVENT_KINDS.has(event.event as HarnessRuntimeEventKind)
    ? (event.event as HarnessRuntimeEventKind)
    : "other";

  return {
    kind,
    harness,
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

export function mapAgentRunnerEventToHarnessAgentEvent(
  event: AgentRunnerEvent,
): HarnessAgentEvent {
  return {
    ...mapCodexEventToHarnessEvent(event, "codex"),
    issueId: event.issueId,
    issueIdentifier: event.issueIdentifier,
    attempt: event.attempt,
    workspacePath: event.workspacePath,
    turnCount: event.turnCount,
  };
}
