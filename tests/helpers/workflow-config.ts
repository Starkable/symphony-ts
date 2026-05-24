import {
  DEFAULT_CURSOR_COMMAND,
  DEFAULT_CURSOR_MODE,
  DEFAULT_CURSOR_OUTPUT_FORMAT,
  DEFAULT_CURSOR_REUSE_POLICY,
  DEFAULT_CURSOR_TURN_TIMEOUT_MS,
  DEFAULT_CURSOR_TURN_LOG_ENABLED,
  DEFAULT_CURSOR_TURN_LOG_INCLUDE_PROMPT,
  DEFAULT_CURSOR_TURN_LOG_MAX_BYTES,
  DEFAULT_CURSOR_TURN_LOG_WORKSPACE_ARTIFACT,
  DEFAULT_CURSOR_YOLO,
  DEFAULT_CURSOR_TRUST,
} from "../../src/config/defaults.js";
import type {
  ResolvedWorkflowConfig,
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
  yolo: DEFAULT_CURSOR_YOLO,
  trust: DEFAULT_CURSOR_TRUST,
  sandbox: null,
  outputFormat: DEFAULT_CURSOR_OUTPUT_FORMAT,
  reusePolicy: DEFAULT_CURSOR_REUSE_POLICY,
  turnTimeoutMs: DEFAULT_CURSOR_TURN_TIMEOUT_MS,
  turnLogEnabled: DEFAULT_CURSOR_TURN_LOG_ENABLED,
  turnLogMaxBytes: DEFAULT_CURSOR_TURN_LOG_MAX_BYTES,
  turnLogIncludePrompt: DEFAULT_CURSOR_TURN_LOG_INCLUDE_PROMPT,
  turnLogWorkspaceArtifact: DEFAULT_CURSOR_TURN_LOG_WORKSPACE_ARTIFACT,
};

export function withHarnessConfig(
  config: Omit<ResolvedWorkflowConfig, "harnesses"> & {
    harnesses?: Partial<WorkflowHarnessesConfig>;
  },
): ResolvedWorkflowConfig {
  const codex = config.codex;
  return {
    ...config,
    agent: {
      harness: "codex",
      ...config.agent,
    },
    harnesses: {
      codex,
      cursor: {
        ...DEFAULT_TEST_CURSOR_CONFIG,
        ...config.harnesses?.cursor,
      },
    },
    codex,
  };
}
