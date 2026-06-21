export interface WorkflowHooksConfig {
  afterCreate: string | null;
  beforeRun: string | null;
  afterRun: string | null;
  beforeRemove: string | null;
  timeoutMs: number;
}

export interface WorkflowTrackerOAuthConfig {
  accessToken: string | null;
  accessTokenSecret: string | null;
  rsaPrivateKeyPath: string | null;
  consumerKey: string;
  validateOnDispatch: boolean;
}

export interface WorkflowTrackerConfig {
  kind: string | null;
  endpoint: string;
  apiKey: string | null;
  projectSlug: string | null;
  activeStates: string[];
  terminalStates: string[];
  /** Optional Jira issuetype names, e.g. 产品需求 (aligned with pms-opt-skill). */
  issueTypes: string[];
  /** When true, append status not in ("草稿", "审核中") to candidate JQL. */
  excludeDraftStatus: boolean;
  /** Optional assignee login names for PMS JQL `assignee in (...)`. */
  assignees: string[];
  /** JQL 名 → 展示名；PMS tracker 用于 dispatch/reconcile。 */
  stateAliases: Readonly<Record<string, readonly string[]>>;
  /** Present when `kind` is `pms`; null for Linear. */
  oauth: WorkflowTrackerOAuthConfig | null;
}

export interface WorkflowPollingConfig {
  intervalMs: number;
}

export interface WorkflowWorkspaceConfig {
  root: string;
}

export type AgentHarnessKind = "codex" | "cursor";

export type CursorReusePolicy = "per_issue" | "fresh_each_run";

/** Unattended Symphony runs Cursor CLI in force mode only. */
export type CursorHarnessMode = "force";

export interface WorkflowAgentConfig {
  harness: AgentHarnessKind;
  maxConcurrentAgents: number;
  maxTurns: number;
  maxRetryBackoffMs: number;
  maxConcurrentAgentsByState: Readonly<Record<string, number>>;
}

export interface WorkflowCodexConfig {
  command: string;
  approvalPolicy: unknown;
  threadSandbox: unknown;
  turnSandboxPolicy: unknown;
  turnTimeoutMs: number;
  readTimeoutMs: number;
  stallTimeoutMs: number;
}

export interface WorkflowCursorHarnessConfig {
  command: string;
  mode: CursorHarnessMode;
  /** Optional CLI model id (from `agent models`); omitted when null. */
  model: string | null;
  /** Experimental; passed as `--sandbox` when set. */
  sandbox: unknown;
  reusePolicy: CursorReusePolicy;
  turnTimeoutMs: number;
  /** Emit structured per-turn logs (cursor_turn_start / cursor_turn_finished). */
  turnLogEnabled: boolean;
  /** Max UTF-8 bytes per stdout/stderr/thinking field in structured logs. */
  turnLogMaxBytes: number;
  /** Include full prompt (after `--`) in structured logs (default redacts). */
  turnLogIncludePrompt: boolean;
  /** Write full turn output to workspace .symphony/cursor-turn-N.log. */
  turnLogWorkspaceArtifact: boolean;
}

export interface WorkflowHarnessesConfig {
  codex: WorkflowCodexConfig;
  cursor: WorkflowCursorHarnessConfig;
}

export interface WorkflowServerConfig {
  port: number | null;
}

export interface WorkflowObservabilityConfig {
  dashboardEnabled: boolean;
  refreshMs: number;
  renderIntervalMs: number;
}

export interface WorkflowArtifactStoreConfig {
  enabled: boolean;
  root: string | null;
  hydrateOnCreate: boolean;
}

export interface WorkflowPhaseConfig {
  id: string;
  handler: string;
  produces: string;
  requiresPass: boolean;
}

/** V1.2 artifact-driven workflow table from WORKFLOW front matter. */
export interface SymphonyWorkflowConfig {
  version: string | null;
  changeRefStrategy: string | null;
  phases: WorkflowPhaseConfig[];
}

export interface ResolvedWorkflowConfig {
  workflowPath: string;
  promptTemplate: string;
  tracker: WorkflowTrackerConfig;
  polling: WorkflowPollingConfig;
  workspace: WorkflowWorkspaceConfig;
  hooks: WorkflowHooksConfig;
  agent: WorkflowAgentConfig;
  harnesses: WorkflowHarnessesConfig;
  /** @deprecated Use `harnesses.codex`; kept for backward-compatible call sites. */
  codex: WorkflowCodexConfig;
  server: WorkflowServerConfig;
  observability: WorkflowObservabilityConfig;
  artifactStore: WorkflowArtifactStoreConfig;
  /** V1.2 workflow.phases table; null when absent (legacy prompt-only mode). */
  workflow: SymphonyWorkflowConfig | null;
}

export interface DispatchValidationFailure {
  code: string;
  message: string;
}

export type DispatchValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: DispatchValidationFailure;
    };

export interface WorkflowSnapshot {
  definition: {
    workflowPath: string;
    config: Record<string, unknown>;
    promptTemplate: string;
  };
  config: ResolvedWorkflowConfig;
  dispatchValidation: DispatchValidationResult;
  loadedAt: string;
}

export type WorkflowReloadReason = "manual" | "filesystem_event";

export type WorkflowReloadResult =
  | {
      ok: true;
      reason: WorkflowReloadReason;
      previousSnapshot: WorkflowSnapshot;
      snapshot: WorkflowSnapshot;
    }
  | {
      ok: false;
      reason: WorkflowReloadReason;
      currentSnapshot: WorkflowSnapshot;
      error: unknown;
    };
