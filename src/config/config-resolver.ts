import { homedir } from "node:os";
import { isAbsolute, normalize, resolve, sep } from "node:path";

import type { WorkflowDefinition } from "../domain/model.js";
import { normalizeIssueState } from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";
import {
  DEFAULT_ACTIVE_STATES,
  DEFAULT_CODEX_COMMAND,
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
  DEFAULT_HOOK_TIMEOUT_MS,
  DEFAULT_LINEAR_ENDPOINT,
  DEFAULT_LINEAR_NETWORK_TIMEOUT_MS,
  DEFAULT_LINEAR_PAGE_SIZE,
  DEFAULT_MAX_CONCURRENT_AGENTS,
  DEFAULT_MAX_CONCURRENT_AGENTS_BY_STATE,
  DEFAULT_MAX_RETRY_BACKOFF_MS,
  DEFAULT_MAX_TURNS,
  DEFAULT_OBSERVABILITY_ENABLED,
  DEFAULT_OBSERVABILITY_REFRESH_MS,
  DEFAULT_OBSERVABILITY_RENDER_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_STALL_TIMEOUT_MS,
  DEFAULT_TERMINAL_STATES,
  DEFAULT_TRACKER_KIND,
  DEFAULT_TURN_TIMEOUT_MS,
  DEFAULT_WORKSPACE_ROOT,
} from "./defaults.js";
import type {
  AgentHarnessKind,
  CursorReusePolicy,
  DispatchValidationResult,
  ResolvedWorkflowConfig,
  WorkflowCodexConfig,
  WorkflowCursorHarnessConfig,
} from "./types.js";

const LINEAR_CANONICAL_API_KEY_ENV = "LINEAR_API_KEY";

export function resolveWorkflowConfig(
  workflow: WorkflowDefinition & { workflowPath: string },
  environment: NodeJS.ProcessEnv = process.env,
): ResolvedWorkflowConfig {
  const config = workflow.config;
  const tracker = asRecord(config.tracker);
  const polling = asRecord(config.polling);
  const workspace = asRecord(config.workspace);
  const hooks = asRecord(config.hooks);
  const agent = asRecord(config.agent);
  const codex = asRecord(config.codex);
  const harnesses = asRecord(config.harnesses);
  const harnessesCodex = asRecord(harnesses.codex);
  const harnessesCursor = asRecord(harnesses.cursor);
  const server = asRecord(config.server);
  const observability = asRecord(config.observability);
  const resolvedCodex = resolveCodexHarnessConfig(codex, harnessesCodex);
  const resolvedCursor = resolveCursorHarnessConfig(harnessesCursor);

  return {
    workflowPath: workflow.workflowPath,
    promptTemplate: workflow.promptTemplate,
    tracker: {
      kind: readString(tracker.kind) ?? DEFAULT_TRACKER_KIND,
      endpoint: readString(tracker.endpoint) ?? DEFAULT_LINEAR_ENDPOINT,
      apiKey:
        resolveEnvReference(readString(tracker.api_key), environment) ??
        environment[LINEAR_CANONICAL_API_KEY_ENV] ??
        null,
      projectSlug: readString(tracker.project_slug),
      activeStates: readStringList(
        tracker.active_states,
        DEFAULT_ACTIVE_STATES,
      ),
      terminalStates: readStringList(
        tracker.terminal_states,
        DEFAULT_TERMINAL_STATES,
      ),
    },
    polling: {
      intervalMs: readInteger(polling.interval_ms) ?? DEFAULT_POLL_INTERVAL_MS,
    },
    workspace: {
      root:
        resolvePathValue(
          readString(workspace.root),
          workflow.workflowPath,
          environment,
        ) ?? DEFAULT_WORKSPACE_ROOT,
    },
    hooks: {
      afterCreate: readScript(hooks.after_create),
      beforeRun: readScript(hooks.before_run),
      afterRun: readScript(hooks.after_run),
      beforeRemove: readScript(hooks.before_remove),
      timeoutMs:
        readPositiveInteger(hooks.timeout_ms) ?? DEFAULT_HOOK_TIMEOUT_MS,
    },
    agent: {
      harness: readHarnessKind(agent.harness),
      maxConcurrentAgents:
        readPositiveInteger(agent.max_concurrent_agents) ??
        DEFAULT_MAX_CONCURRENT_AGENTS,
      maxTurns: readPositiveInteger(agent.max_turns) ?? DEFAULT_MAX_TURNS,
      maxRetryBackoffMs:
        readPositiveInteger(agent.max_retry_backoff_ms) ??
        DEFAULT_MAX_RETRY_BACKOFF_MS,
      maxConcurrentAgentsByState: readStateConcurrencyMap(
        agent.max_concurrent_agents_by_state,
      ),
    },
    harnesses: {
      codex: resolvedCodex,
      cursor: resolvedCursor,
    },
    codex: resolvedCodex,
    server: {
      port: readNonNegativeInteger(server.port),
    },
    observability: {
      dashboardEnabled:
        readBoolean(observability.dashboard_enabled) ??
        DEFAULT_OBSERVABILITY_ENABLED,
      refreshMs:
        readPositiveInteger(observability.refresh_ms) ??
        DEFAULT_OBSERVABILITY_REFRESH_MS,
      renderIntervalMs:
        readPositiveInteger(observability.render_interval_ms) ??
        DEFAULT_OBSERVABILITY_RENDER_INTERVAL_MS,
    },
  };
}

export function validateDispatchConfig(
  config: ResolvedWorkflowConfig,
): DispatchValidationResult {
  const trackerKind = config.tracker.kind?.trim();
  if (!trackerKind) {
    return invalid(
      ERROR_CODES.configInvalid,
      "tracker.kind must be present before dispatch.",
    );
  }

  if (trackerKind !== DEFAULT_TRACKER_KIND) {
    return invalid(
      ERROR_CODES.unsupportedTrackerKind,
      `tracker.kind '${trackerKind}' is not supported.`,
    );
  }

  if (!config.tracker.apiKey || config.tracker.apiKey.trim() === "") {
    return invalid(
      ERROR_CODES.trackerCredentialsMissing,
      "tracker.api_key must be configured before dispatch.",
    );
  }

  if (!config.tracker.projectSlug || config.tracker.projectSlug.trim() === "") {
    return invalid(
      ERROR_CODES.configInvalid,
      "tracker.project_slug must be configured before dispatch.",
    );
  }

  const harnesses = config.harnesses ?? {
    codex: config.codex,
    cursor: resolveCursorHarnessConfig({}),
  };

  if (config.agent.harness === "cursor") {
    if (harnesses.cursor.command.trim() === "") {
      return invalid(
        ERROR_CODES.configInvalid,
        "harnesses.cursor.command must be present and non-empty before dispatch.",
      );
    }
    return { ok: true };
  }

  if (harnesses.codex.command.trim() === "") {
    return invalid(
      ERROR_CODES.configInvalid,
      "harnesses.codex.command must be present and non-empty before dispatch.",
    );
  }

  return { ok: true };
}

function resolveCodexHarnessConfig(
  legacyCodex: Record<string, unknown>,
  harnessesCodex: Record<string, unknown>,
): WorkflowCodexConfig {
  const merged = {
    ...legacyCodex,
    ...harnessesCodex,
  };

  return {
    command: readString(merged.command) ?? DEFAULT_CODEX_COMMAND,
    approvalPolicy: merged.approval_policy,
    threadSandbox: merged.thread_sandbox,
    turnSandboxPolicy: merged.turn_sandbox_policy,
    turnTimeoutMs:
      readPositiveInteger(merged.turn_timeout_ms) ?? DEFAULT_TURN_TIMEOUT_MS,
    readTimeoutMs:
      readPositiveInteger(merged.read_timeout_ms) ?? DEFAULT_READ_TIMEOUT_MS,
    stallTimeoutMs:
      readInteger(merged.stall_timeout_ms) ?? DEFAULT_STALL_TIMEOUT_MS,
  };
}

function resolveCursorHarnessConfig(
  harnessesCursor: Record<string, unknown>,
): WorkflowCursorHarnessConfig {
  return {
    command: readString(harnessesCursor.command) ?? DEFAULT_CURSOR_COMMAND,
    mode: readString(harnessesCursor.mode) ?? DEFAULT_CURSOR_MODE,
    yolo: readBoolean(harnessesCursor.yolo) ?? DEFAULT_CURSOR_YOLO,
    trust: readBoolean(harnessesCursor.trust) ?? DEFAULT_CURSOR_TRUST,
    sandbox: harnessesCursor.sandbox,
    outputFormat:
      readString(harnessesCursor.output_format) ??
      DEFAULT_CURSOR_OUTPUT_FORMAT,
    reusePolicy: readCursorReusePolicy(harnessesCursor.reuse_policy),
    turnTimeoutMs:
      readPositiveInteger(harnessesCursor.turn_timeout_ms) ??
      DEFAULT_CURSOR_TURN_TIMEOUT_MS,
    turnLogEnabled:
      readBoolean(harnessesCursor.turn_log_enabled) ??
      DEFAULT_CURSOR_TURN_LOG_ENABLED,
    turnLogMaxBytes:
      readPositiveInteger(harnessesCursor.turn_log_max_bytes) ??
      DEFAULT_CURSOR_TURN_LOG_MAX_BYTES,
    turnLogIncludePrompt:
      readBoolean(harnessesCursor.turn_log_include_prompt) ??
      DEFAULT_CURSOR_TURN_LOG_INCLUDE_PROMPT,
    turnLogWorkspaceArtifact:
      readBoolean(harnessesCursor.turn_log_workspace_artifact) ??
      DEFAULT_CURSOR_TURN_LOG_WORKSPACE_ARTIFACT,
  };
}

function readHarnessKind(value: unknown): AgentHarnessKind {
  const harness = readString(value)?.trim().toLowerCase();
  if (harness === "cursor") {
    return "cursor";
  }
  return "codex";
}

function readCursorReusePolicy(value: unknown): CursorReusePolicy {
  const policy = readString(value)?.trim().toLowerCase();
  if (policy === "fresh_each_run") {
    return "fresh_each_run";
  }
  return DEFAULT_CURSOR_REUSE_POLICY;
}

function invalid(code: string, message: string): DispatchValidationResult {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value;
}

function readScript(value: unknown): string | null {
  const script = readString(value);
  if (script === null) {
    return null;
  }

  return script === "" ? null : script;
}

function readInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return null;
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = readInteger(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }

  return parsed;
}

function readNonNegativeInteger(value: unknown): number | null {
  const parsed = readInteger(value);
  if (parsed === null || parsed < 0) {
    return null;
  }

  return parsed;
}

function readStringList(value: unknown, fallback: readonly string[]): string[] {
  if (Array.isArray(value)) {
    const items = value.filter(
      (entry): entry is string => typeof entry === "string",
    );
    if (items.length > 0) {
      return items.map((entry) => entry.trim()).filter((entry) => entry !== "");
    }
  }

  if (typeof value === "string") {
    const items = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");
    if (items.length > 0) {
      return items;
    }
  }

  return [...fallback];
}

function readStateConcurrencyMap(
  value: unknown,
): Readonly<Record<string, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_MAX_CONCURRENT_AGENTS_BY_STATE;
  }

  const normalizedEntries = Object.entries(value).flatMap(([state, limit]) => {
    const parsedLimit = readPositiveInteger(limit);
    if (parsedLimit === null) {
      return [];
    }

    return [[normalizeIssueState(state), parsedLimit] as const];
  });

  return Object.freeze(Object.fromEntries(normalizedEntries));
}

function resolveEnvReference(
  value: string | null,
  environment: NodeJS.ProcessEnv,
): string | null {
  if (!value) {
    return null;
  }

  if (!value.startsWith("$")) {
    return value;
  }

  const envName = value.slice(1);
  const resolvedValue = environment[envName];
  if (!resolvedValue || resolvedValue.trim() === "") {
    return null;
  }

  return resolvedValue;
}

function resolvePathValue(
  value: string | null,
  workflowPath: string,
  environment: NodeJS.ProcessEnv,
): string | null {
  const rawPath = resolveEnvReference(value, environment);
  if (!rawPath) {
    return null;
  }

  let expanded = rawPath.startsWith("~")
    ? `${homedir()}${rawPath.slice(1)}`
    : rawPath;

  if (
    !expanded.includes(sep) &&
    !expanded.includes("/") &&
    !expanded.includes("\\")
  ) {
    return expanded;
  }

  if (isAbsolute(expanded)) {
    return normalize(expanded);
  }

  expanded = resolve(resolve(workflowPath, ".."), expanded);
  return normalize(expanded);
}

export const LINEAR_DEFAULTS = Object.freeze({
  endpoint: DEFAULT_LINEAR_ENDPOINT,
  pageSize: DEFAULT_LINEAR_PAGE_SIZE,
  networkTimeoutMs: DEFAULT_LINEAR_NETWORK_TIMEOUT_MS,
});
