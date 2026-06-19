import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/agent/backends/cursor/cursor-command-resolve.js", () => ({
  isCursorCommandAvailable: vi.fn(() => true),
}));

import {
  resolveWorkflowConfig,
  validateDispatchConfig,
} from "../../src/config/config-resolver.js";
import {
  DEFAULT_CODEX_COMMAND,
  DEFAULT_HOOK_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENT_AGENTS,
  DEFAULT_MAX_RETRY_BACKOFF_MS,
  DEFAULT_MAX_TURNS,
  DEFAULT_OBSERVABILITY_ENABLED,
  DEFAULT_OBSERVABILITY_REFRESH_MS,
  DEFAULT_OBSERVABILITY_RENDER_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_STALL_TIMEOUT_MS,
  DEFAULT_TURN_TIMEOUT_MS,
  DEFAULT_WORKSPACE_ROOT,
} from "../../src/config/defaults.js";
import { ERROR_CODES } from "../../src/errors/codes.js";

describe("config-resolver", () => {
  it("applies spec defaults when workflow config is empty", () => {
    const resolved = resolveWorkflowConfig({
      workflowPath: "/repo/WORKFLOW.md",
      config: {},
      promptTemplate: "Prompt",
    });

    expect(resolved.tracker.kind).toBe("linear");
    expect(resolved.tracker.oauth).toBeNull();
    expect(resolved.tracker.endpoint).toBe("https://api.linear.app/graphql");
    expect(resolved.tracker.activeStates).toEqual(["Todo", "In Progress"]);
    expect(resolved.tracker.terminalStates).toEqual([
      "Closed",
      "Cancelled",
      "Canceled",
      "Duplicate",
      "Done",
    ]);
    expect(resolved.polling.intervalMs).toBe(DEFAULT_POLL_INTERVAL_MS);
    expect(resolved.workspace.root).toBe(DEFAULT_WORKSPACE_ROOT);
    expect(resolved.hooks.timeoutMs).toBe(DEFAULT_HOOK_TIMEOUT_MS);
    expect(resolved.agent.maxConcurrentAgents).toBe(
      DEFAULT_MAX_CONCURRENT_AGENTS,
    );
    expect(resolved.agent.maxTurns).toBe(DEFAULT_MAX_TURNS);
    expect(resolved.agent.harness).toBe("codex");
    expect(resolved.agent.maxRetryBackoffMs).toBe(DEFAULT_MAX_RETRY_BACKOFF_MS);
    expect(resolved.harnesses.codex.command).toBe(DEFAULT_CODEX_COMMAND);
    expect(resolved.codex.command).toBe(DEFAULT_CODEX_COMMAND);
    expect(resolved.codex.turnTimeoutMs).toBe(DEFAULT_TURN_TIMEOUT_MS);
    expect(resolved.codex.readTimeoutMs).toBe(DEFAULT_READ_TIMEOUT_MS);
    expect(resolved.codex.stallTimeoutMs).toBe(DEFAULT_STALL_TIMEOUT_MS);
    expect(resolved.observability.dashboardEnabled).toBe(
      DEFAULT_OBSERVABILITY_ENABLED,
    );
    expect(resolved.observability.refreshMs).toBe(
      DEFAULT_OBSERVABILITY_REFRESH_MS,
    );
    expect(resolved.observability.renderIntervalMs).toBe(
      DEFAULT_OBSERVABILITY_RENDER_INTERVAL_MS,
    );
    expect(resolved.workflow).toBeNull();
  });

  it("coerces env-backed fields, path-like roots, and state limits", () => {
    const resolved = resolveWorkflowConfig(
      {
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {
          tracker: {
            api_key: "$LINEAR_TOKEN",
            project_slug: "ENG",
            active_states: "Todo, In Progress, Ready for QA",
          },
          polling: {
            interval_ms: "15000",
          },
          workspace: {
            root: "./tmp/workspaces",
          },
          hooks: {
            timeout_ms: "0",
            before_run: "pnpm test",
          },
          agent: {
            max_concurrent_agents: "4",
            max_turns: "8",
            max_retry_backoff_ms: "120000",
            max_concurrent_agents_by_state: {
              " In Progress ": "2",
              Done: 0,
            },
          },
          codex: {
            command: "codex app-server --stdio",
            turn_timeout_ms: "90000",
            read_timeout_ms: "2500",
            stall_timeout_ms: "-1",
          },
          server: {
            port: "8080",
          },
          observability: {
            dashboard_enabled: "false",
            refresh_ms: "2500",
            render_interval_ms: "33",
          },
        },
      },
      {
        LINEAR_TOKEN: "secret-token",
      },
    );

    expect(resolved.tracker.apiKey).toBe("secret-token");
    expect(resolved.tracker.projectSlug).toBe("ENG");
    expect(resolved.tracker.activeStates).toEqual([
      "Todo",
      "In Progress",
      "Ready for QA",
    ]);
    expect(resolved.polling.intervalMs).toBe(15_000);
    expect(resolved.workspace.root).toBe(join("/repo", "tmp/workspaces"));
    expect(resolved.hooks.beforeRun).toBe("pnpm test");
    expect(resolved.hooks.timeoutMs).toBe(DEFAULT_HOOK_TIMEOUT_MS);
    expect(resolved.agent.maxConcurrentAgents).toBe(4);
    expect(resolved.agent.maxTurns).toBe(8);
    expect(resolved.agent.maxRetryBackoffMs).toBe(120_000);
    expect(resolved.agent.maxConcurrentAgentsByState).toEqual({
      "in progress": 2,
    });
    expect(resolved.codex.command).toBe("codex app-server --stdio");
    expect(resolved.codex.turnTimeoutMs).toBe(90_000);
    expect(resolved.codex.readTimeoutMs).toBe(2_500);
    expect(resolved.codex.stallTimeoutMs).toBe(-1);
    expect(resolved.server.port).toBe(8080);
    expect(resolved.observability.dashboardEnabled).toBe(false);
    expect(resolved.observability.refreshMs).toBe(2_500);
    expect(resolved.observability.renderIntervalMs).toBe(33);
  });

  it("parses artifact_store settings with defaults", () => {
    const disabled = resolveWorkflowConfig({
      workflowPath: "/repo/WORKFLOW.md",
      promptTemplate: "Prompt",
      config: {},
    });
    expect(disabled.artifactStore).toEqual({
      enabled: false,
      root: null,
      hydrateOnCreate: false,
    });

    const enabled = resolveWorkflowConfig({
      workflowPath: "/repo/WORKFLOW.md",
      promptTemplate: "Prompt",
      config: {
        artifact_store: {
          enabled: true,
          root: "/repo/artifacts",
          hydrate_on_create: true,
        },
      },
    });
    expect(enabled.artifactStore.enabled).toBe(true);
    expect(enabled.artifactStore.hydrateOnCreate).toBe(true);
    expect(enabled.artifactStore.root).toContain("artifacts");
  });

  it("accepts server.port zero for ephemeral listener binding", () => {
    const resolved = resolveWorkflowConfig({
      workflowPath: "/repo/WORKFLOW.md",
      promptTemplate: "Prompt",
      config: {
        server: {
          port: 0,
        },
      },
    });

    expect(resolved.server.port).toBe(0);
  });

  it("ignores invalid negative or non-integer server.port values", () => {
    const negative = resolveWorkflowConfig({
      workflowPath: "/repo/WORKFLOW.md",
      promptTemplate: "Prompt",
      config: {
        server: {
          port: -1,
        },
      },
    });
    const invalidString = resolveWorkflowConfig({
      workflowPath: "/repo/WORKFLOW.md",
      promptTemplate: "Prompt",
      config: {
        server: {
          port: "eight-thousand",
        },
      },
    });

    expect(negative.server.port).toBeNull();
    expect(invalidString.server.port).toBeNull();
  });

  it("uses the canonical LINEAR_API_KEY env var fallback", () => {
    const resolved = resolveWorkflowConfig(
      {
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {
          tracker: {
            project_slug: "ENG",
          },
        },
      },
      {
        LINEAR_API_KEY: "canonical-secret",
      },
    );

    expect(resolved.tracker.apiKey).toBe("canonical-secret");
  });

  it("resolves env-backed workspace roots and expands the home directory", () => {
    const envBacked = resolveWorkflowConfig(
      {
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {
          workspace: {
            root: "$WORKSPACE_ROOT",
          },
        },
      },
      {
        WORKSPACE_ROOT: "~/symphony-workspaces",
      },
    );

    expect(envBacked.workspace.root).toBe(
      join(homedir(), "symphony-workspaces"),
    );
  });

  it("blocks dispatch when required tracker settings are missing", () => {
    const resolved = resolveWorkflowConfig(
      {
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {},
      },
      {},
    );

    const validation = validateDispatchConfig(resolved);
    expect(validation).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.configInvalid,
        message: "tracker.project_slug must be configured before dispatch.",
      },
    });
  });

  it("rejects unsupported tracker kinds during dispatch validation", () => {
    const validation = validateDispatchConfig(
      resolveWorkflowConfig(
        {
          workflowPath: "/repo/WORKFLOW.md",
          promptTemplate: "Prompt",
          config: {
            tracker: {
              kind: "jira",
              api_key: "token",
              project_slug: "ENG",
            },
          },
        },
        {},
      ),
    );

    expect(validation).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.unsupportedTrackerKind,
        message: "tracker.kind 'jira' is not supported.",
      },
    });
  });

  it("maps legacy top-level codex config into harnesses.codex", () => {
    const resolved = resolveWorkflowConfig({
      workflowPath: "/repo/WORKFLOW.md",
      promptTemplate: "Prompt",
      config: {
        codex: {
          command: "custom-codex",
        },
      },
    });

    expect(resolved.harnesses.codex.command).toBe("custom-codex");
    expect(resolved.codex.command).toBe("custom-codex");
  });

  it("accepts cursor harness dispatch without codex command", () => {
    const resolved = resolveWorkflowConfig(
      {
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {
          agent: {
            harness: "cursor",
          },
          harnesses: {
            cursor: {
              command: "agent",
            },
          },
          tracker: {
            kind: "linear",
            api_key: "token",
            project_slug: "ENG",
          },
        },
      },
      {},
    );

    const validation = validateDispatchConfig(resolved, {
      command: "agent",
    });
    expect(validation).toEqual({ ok: true });
    expect(resolved.harnesses.cursor.mode).toBe("force");
    expect(resolved.harnesses.cursor.model).toBeNull();
  });

  it("rejects deprecated harnesses.cursor.trust in dispatch validation", () => {
    const resolved = resolveWorkflowConfig(
      {
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {
          agent: { harness: "cursor" },
          harnesses: { cursor: { command: "agent" } },
          tracker: {
            kind: "linear",
            api_key: "token",
            project_slug: "ENG",
          },
        },
      },
      {},
    );

    const validation = validateDispatchConfig(resolved, { trust: true });
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.error.message).toContain("trust");
    }
  });

  it("rejects non-force harnesses.cursor.mode at dispatch", () => {
    const resolved = resolveWorkflowConfig(
      {
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {
          agent: { harness: "cursor" },
          harnesses: { cursor: { command: "agent", mode: "agent" } },
          tracker: {
            kind: "linear",
            api_key: "token",
            project_slug: "ENG",
          },
        },
      },
      {},
    );

    const validation = validateDispatchConfig(resolved, { mode: "agent" });
    expect(validation.ok).toBe(false);
  });

  it("parses harnesses.cursor.model when set in workflow", () => {
    const resolved = resolveWorkflowConfig(
      {
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {
          agent: { harness: "cursor" },
          harnesses: {
            cursor: {
              command: "agent",
              model: "composer-2.5-fast",
            },
          },
        },
      },
      {},
    );

    expect(resolved.harnesses.cursor.model).toBe("composer-2.5-fast");
  });

  it("parses harnesses.cursor turn_log settings with defaults", () => {
    const resolved = resolveWorkflowConfig(
      {
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {
          agent: { harness: "cursor" },
          harnesses: {
            cursor: {
              command: "agent",
              turn_log_enabled: false,
              turn_log_max_bytes: 4096,
              turn_log_include_prompt: true,
              turn_log_workspace_artifact: false,
            },
          },
        },
      },
      {},
    );

    expect(resolved.harnesses.cursor.turnLogEnabled).toBe(false);
    expect(resolved.harnesses.cursor.turnLogMaxBytes).toBe(4096);
    expect(resolved.harnesses.cursor.turnLogIncludePrompt).toBe(true);
    expect(resolved.harnesses.cursor.turnLogWorkspaceArtifact).toBe(false);
  });

  it("accepts dispatch when tracker and codex prerequisites are present", () => {
    const validation = validateDispatchConfig(
      resolveWorkflowConfig(
        {
          workflowPath: "/repo/WORKFLOW.md",
          promptTemplate: "Prompt",
          config: {
            tracker: {
              kind: "linear",
              api_key: "token",
              project_slug: "ENG",
            },
          },
        },
        {},
      ),
    );

    expect(validation).toEqual({ ok: true });
  });

  it("resolves PMS oauth credentials from env references and canonical env vars", () => {
    const keyPath = join(homedir(), ".symphony-test.key");
    const resolved = resolveWorkflowConfig(
      {
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {
          tracker: {
            kind: "pms",
            project_slug: "BASELINEREQ",
            oauth: {
              access_token: "$PMS_OAUTH_ACCESS_TOKEN",
              access_token_secret: "$PMS_OAUTH_ACCESS_TOKEN_SECRET",
              rsa_private_key_path: "$PMS_JIRA_KEY_PATH",
            },
          },
        },
      },
      {
        PMS_OAUTH_ACCESS_TOKEN: "token-value",
        PMS_OAUTH_ACCESS_TOKEN_SECRET: "secret-value",
        PMS_JIRA_KEY_PATH: keyPath,
      },
    );

    expect(resolved.tracker.kind).toBe("pms");
    expect(resolved.tracker.endpoint).toBe("http://pms.qiyi.domain");
    expect(resolved.tracker.oauth).toEqual({
      accessToken: "token-value",
      accessTokenSecret: "secret-value",
      rsaPrivateKeyPath: keyPath,
      consumerKey: "qa-monitor",
      validateOnDispatch: true,
    });
  });

  it("blocks PMS dispatch when oauth credentials are missing", () => {
    const validation = validateDispatchConfig(
      resolveWorkflowConfig(
        {
          workflowPath: "/repo/WORKFLOW.md",
          promptTemplate: "Prompt",
          config: {
            tracker: {
              kind: "pms",
              project_slug: "BASELINEREQ",
            },
          },
        },
        {},
      ),
    );

    expect(validation).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.trackerCredentialsMissing,
        message:
          "tracker.oauth.access_token must be configured before dispatch.",
      },
    });
  });

  it("accepts PMS dispatch when oauth credentials are present", () => {
    const validation = validateDispatchConfig(
      resolveWorkflowConfig(
        {
          workflowPath: "/repo/WORKFLOW.md",
          promptTemplate: "Prompt",
          config: {
            tracker: {
              kind: "pms",
              project_slug: "BASELINEREQ",
              oauth: {
                access_token: "token",
                access_token_secret: "secret",
                rsa_private_key_path: join(homedir(), "test.key"),
              },
            },
          },
        },
        {},
      ),
    );

    expect(validation).toEqual({ ok: true });
  });
});
