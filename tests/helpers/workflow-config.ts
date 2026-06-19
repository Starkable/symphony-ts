import {
  DEFAULT_CURSOR_COMMAND,
  DEFAULT_CURSOR_MODE,
  DEFAULT_CURSOR_MODEL,
  DEFAULT_CURSOR_REUSE_POLICY,
  DEFAULT_CURSOR_TURN_TIMEOUT_MS,
  DEFAULT_CURSOR_TURN_LOG_ENABLED,
  DEFAULT_CURSOR_TURN_LOG_INCLUDE_PROMPT,
  DEFAULT_CURSOR_TURN_LOG_MAX_BYTES,
  DEFAULT_CURSOR_TURN_LOG_WORKSPACE_ARTIFACT,
} from "../../src/config/defaults.js";
import type {
  AgentHarnessKind,
  ResolvedWorkflowConfig,
  SymphonyWorkflowConfig,
  WorkflowAgentConfig,
  WorkflowCodexConfig,
  WorkflowHarnessesConfig,
} from "../../src/config/types.js";

export const DEFAULT_TEST_CODEX_CONFIG: WorkflowCodexConfig = {
  command: "codex-app-server",
  approvalPolicy: "never",
  threadSandbox: null,
  turnSandboxPolicy: null,
  turnTimeoutMs: 120_000,
  readTimeoutMs: 5_000,
  stallTimeoutMs: 60_000,
};

export const DEFAULT_TEST_CURSOR_CONFIG: WorkflowHarnessesConfig["cursor"] = {
  command: DEFAULT_CURSOR_COMMAND,
  mode: DEFAULT_CURSOR_MODE,
  model: DEFAULT_CURSOR_MODEL,
  sandbox: null,
  reusePolicy: DEFAULT_CURSOR_REUSE_POLICY,
  turnTimeoutMs: DEFAULT_CURSOR_TURN_TIMEOUT_MS,
  turnLogEnabled: DEFAULT_CURSOR_TURN_LOG_ENABLED,
  turnLogMaxBytes: DEFAULT_CURSOR_TURN_LOG_MAX_BYTES,
  turnLogIncludePrompt: DEFAULT_CURSOR_TURN_LOG_INCLUDE_PROMPT,
  turnLogWorkspaceArtifact: DEFAULT_CURSOR_TURN_LOG_WORKSPACE_ARTIFACT,
};

export function withHarnessConfig(
  config: Omit<ResolvedWorkflowConfig, "harnesses" | "agent" | "workflow"> & {
    agent: Omit<WorkflowAgentConfig, "harness"> & {
      harness?: AgentHarnessKind;
    };
    harnesses?: Partial<WorkflowHarnessesConfig>;
    workflow?: SymphonyWorkflowConfig | null;
  },
): ResolvedWorkflowConfig {
  const codex = config.codex;
  return {
    ...config,
    agent: {
      ...config.agent,
      harness: config.agent.harness ?? "codex",
    },
    harnesses: {
      codex,
      cursor: {
        ...DEFAULT_TEST_CURSOR_CONFIG,
        ...config.harnesses?.cursor,
      },
    },
    codex,
    workflow: config.workflow ?? null,
  };
}
