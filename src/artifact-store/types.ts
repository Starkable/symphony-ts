export const V1_BUSINESS_PHASES = [
  "clarify",
  "proposal_review",
  "plan",
  "execute",
  "verify",
  "archive",
] as const;

export type V1BusinessPhase = (typeof V1_BUSINESS_PHASES)[number];

export type V1TerminalPhase = "done" | "failed";

export type V1PhaseId = V1BusinessPhase | V1TerminalPhase;

export type PhaseStatus = "pending" | "in_progress" | "completed" | "failed";

export type GateResult = "pass" | "fail" | "pending";

export interface WorkflowGate {
  id: string;
  result: GateResult;
  at: string | null;
}

export interface WorkflowArtifactEntry {
  name: string;
  display_name?: string;
  type: string;
  path: string;
  size_bytes: number | null;
  summary: string | null;
  updated_at: string | null;
}

export interface WorkflowPhaseEntry {
  id: V1BusinessPhase;
  label: string;
  status: PhaseStatus;
  gate: WorkflowGate | null;
  artifacts: WorkflowArtifactEntry[];
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowRuntimeSummary {
  status: "running" | "retry_queued" | "archived" | "idle";
  turn_count: number | null;
  last_message: string | null;
  last_event: string | null;
  last_event_at: string | null;
}

export type WorkflowArchivedReason = "pms_terminal_cleanup";

export interface WorkflowMeta {
  issue_identifier: string;
  issue_id: string | null;
  change_ref: string;
  mode: string;
  title: string | null;
  priority: string | null;
  terminal_phase: V1TerminalPhase | null;
  archived_reason?: WorkflowArchivedReason | null;
  created_at: string | null;
  updated_at: string;
}

export interface WorkflowManifest {
  issue_identifier: string;
  change_ref: string;
  mode: string;
  current_phase: V1PhaseId;
  updated_at: string;
  phases: WorkflowPhaseEntry[];
  runtime: WorkflowRuntimeSummary;
}

export interface WorkflowSummary {
  issue_identifier: string;
  title: string | null;
  current_phase: V1PhaseId;
  phase_progress: {
    completed: number;
    total: number;
  };
  runtime: WorkflowRuntimeSummary;
  started_at: string | null;
  updated_at: string;
  artifact_count: number;
  priority: string | null;
  terminal_phase: V1TerminalPhase | null;
  archived_reason?: WorkflowArchivedReason | null;
}

export interface WorkflowDetail extends WorkflowMeta {
  manifest: WorkflowManifest;
}

export const PHASE_LABELS: Record<V1BusinessPhase, string> = {
  clarify: "需求澄清",
  plan: "方案规划",
  proposal_review: "提案评审",
  execute: "执行实现",
  verify: "验证",
  archive: "归档",
};
