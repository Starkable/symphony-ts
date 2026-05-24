import type { Issue, LiveSession, RunAttempt, Workspace } from "../../domain/model.js";

export type HarnessKind = "codex" | "cursor";

export type HarnessRuntimeEventKind =
  | "session_started"
  | "startup_failed"
  | "turn_completed"
  | "turn_failed"
  | "turn_cancelled"
  | "turn_ended_with_error"
  | "turn_input_required"
  | "approval_auto_approved"
  | "unsupported_tool_call"
  | "notification"
  | "other_message"
  | "malformed"
  | "runtime_error"
  | "other";

export interface HarnessUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface HarnessRuntimeEvent {
  kind: HarnessRuntimeEventKind;
  harness: HarnessKind;
  timestamp: string;
  nativeKind?: string;
  runtimePid?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  usage?: HarnessUsage;
  rateLimits?: Record<string, unknown> | null;
  errorCode?: string;
  message?: string;
  toolName?: string | null;
  raw?: unknown;
}

export interface HarnessAgentEvent extends HarnessRuntimeEvent {
  issueId: string;
  issueIdentifier: string;
  attempt: number | null;
  workspacePath: string;
  turnCount: number;
}

export interface HarnessTurnOutcome {
  status: "completed" | "failed" | "cancelled";
  sessionId: string | null;
  threadId: string | null;
  turnId: string | null;
  usage: HarnessUsage | null;
  rateLimits: Record<string, unknown> | null;
  message: string | null;
  exitCode: number | null;
}

export interface HarnessRunInput {
  issue: Issue;
  attempt: number | null;
  signal?: AbortSignal;
}

export interface HarnessRunResult {
  issue: Issue;
  workspace: Workspace;
  runAttempt: RunAttempt;
  liveSession: LiveSession;
  turnsCompleted: number;
  lastTurn: HarnessTurnOutcome | null;
  rateLimits: Record<string, unknown> | null;
}
