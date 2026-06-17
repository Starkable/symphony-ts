import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/agent/backends/cursor/cursor-command-resolve.js", () => ({
  resolveCursorSpawnSpec: vi.fn((configCommand: string, cliArgs: string[]) => ({
    command: configCommand,
    args: cliArgs,
    resolvedPath: configCommand,
  })),
}));

import { CursorAgentHarness } from "../../../../src/agent/backends/cursor/cursor-harness.js";
import type {
  CursorCliRunInput,
  CursorCliRunResult,
} from "../../../../src/agent/backends/cursor/cursor-cli-session.js";
import { createCursorHarnessEvent } from "../../../../src/agent/backends/cursor/cursor-event-adapter.js";
import { StructuredLogger } from "../../../../src/logging/structured-logger.js";
import type { StructuredLogEntry } from "../../../../src/logging/structured-logger.js";
import {
  DEFAULT_TEST_CODEX_CONFIG,
  DEFAULT_TEST_CURSOR_CONFIG,
  withHarnessConfig,
} from "../../../helpers/workflow-config.js";
import type { Issue } from "../../../../src/domain/model.js";

function createMockCliResult(
  input: CursorCliRunInput,
  overrides: Partial<CursorCliRunResult> = {},
): CursorCliRunResult {
  const terminalEvent = createCursorHarnessEvent({
    kind: "turn_completed",
    message: "done",
    sessionId: "chat-123",
  });
  input.onSessionId?.("chat-123");
  input.onHarnessEvent?.(
    createCursorHarnessEvent({
      kind: "notification",
      message: "Cursor session init (test)",
    }),
  );
  input.onHarnessEvent?.(
    createCursorHarnessEvent({
      kind: "other_message",
      message: "working",
    }),
  );
  input.onHarnessEvent?.(terminalEvent);

  return {
    exitCode: 0,
    stdout: '{"type":"result"}',
    stderr: "",
    timedOut: false,
    sessionId: "chat-123",
    terminalEvent,
    ...overrides,
  };
}

describe("CursorAgentHarness", () => {
  it("runs stream-json turns and persists session ids", async () => {
    const events: string[] = [];
    const runCli = vi
      .fn<(input: CursorCliRunInput) => Promise<CursorCliRunResult>>()
      .mockImplementationOnce(async (input) => createMockCliResult(input));

    const harness = new CursorAgentHarness({
      config: buildHarnessConfig(),
      tracker: buildTracker(),
      workspaceManager: buildWorkspaceManager(),
      runCli,
      onEvent: (event) => {
        events.push(event.kind);
      },
    });

    const result = await harness.run({
      issue: createIssue(),
      attempt: null,
    });

    expect(runCli).toHaveBeenCalledTimes(1);
    expect(runCli.mock.calls[0]?.[0]).toMatchObject({
      workspace: "/tmp/workspaces/1",
      model: null,
      prompt: expect.any(String),
    });
    expect(events).toContain("session_started");
    expect(events).toContain("notification");
    expect(events).toContain("other_message");
    expect(events).toContain("turn_completed");
    expect(events.filter((kind) => kind === "other_message").length).toBeGreaterThanOrEqual(1);
    expect(result.lastTurn?.sessionId).toBe("chat-123");
    expect(result.turnsCompleted).toBe(1);
  });

  it("emits cursor_turn_start and cursor_turn_finished structured logs", async () => {
    const logEntries: StructuredLogEntry[] = [];
    const logger = new StructuredLogger([
      {
        write(entry) {
          logEntries.push(entry);
        },
      },
    ]);

    const runCli = vi
      .fn<(input: CursorCliRunInput) => Promise<CursorCliRunResult>>()
      .mockImplementationOnce(async (input) =>
        createMockCliResult(input, {
          stdout:
            '{"type":"thinking","subtype":"completed"}\n{"type":"result","result":"done"}',
        }),
      );

    const harness = new CursorAgentHarness({
      config: buildHarnessConfig({
        turnLogWorkspaceArtifact: false,
      }),
      tracker: buildTracker(),
      workspaceManager: buildWorkspaceManager(),
      logger,
      runCli,
      onEvent: () => {},
    });

    await harness.run({
      issue: createIssue(),
      attempt: null,
    });

    const startLog = logEntries.find((entry) => entry.event === "cursor_turn_start");
    const finishLog = logEntries.find(
      (entry) => entry.event === "cursor_turn_finished",
    );

    expect(startLog).toBeDefined();
    expect(startLog?.cli_args).toEqual(
      expect.arrayContaining(["--", expect.stringContaining("prompt chars=")]),
    );
    expect(finishLog).toBeDefined();
    expect(finishLog?.exit_code).toBe(0);
  });
});

function buildHarnessConfig(
  cursorOverrides: Partial<typeof DEFAULT_TEST_CURSOR_CONFIG> = {},
) {
  return withHarnessConfig({
    workflowPath: "/tmp/WORKFLOW.md",
    promptTemplate: "Prompt {{ issue.identifier }}",
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      projectSlug: "ENG",
      activeStates: ["In Progress"],
      terminalStates: ["Done"],
      issueTypes: [],
      excludeDraftStatus: false,
      oauth: null,
    },
    polling: { intervalMs: 30_000 },
    workspace: { root: "/tmp/workspaces" },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1_000,
    },
    agent: {
      harness: "cursor",
      maxConcurrentAgents: 1,
      maxTurns: 1,
      maxRetryBackoffMs: 300_000,
      maxConcurrentAgentsByState: {},
    },
    codex: DEFAULT_TEST_CODEX_CONFIG,
    harnesses: {
      codex: DEFAULT_TEST_CODEX_CONFIG,
      cursor: {
        ...DEFAULT_TEST_CURSOR_CONFIG,
        ...cursorOverrides,
      },
    },
    server: { port: null },
    observability: {
      dashboardEnabled: true,
      refreshMs: 1_000,
      renderIntervalMs: 16,
    },
  });
}

function buildTracker() {
  return {
    fetchCandidateIssues: async () => [],
    fetchIssuesByStates: async () => [],
    fetchIssueStatesByIds: async () => [
      { id: "1", identifier: "ISSUE-1", state: "Done" },
    ],
  };
}

function buildWorkspaceManager() {
  return {
    createForIssue: async () => ({
      path: "/tmp/workspaces/1",
      workspaceKey: "1",
      createdNow: true,
    }),
    resolveForIssue: () => ({
      workspacePath: "/tmp/workspaces/1",
    }),
  } as never;
}

function createIssue(): Issue {
  return {
    id: "1",
    identifier: "ISSUE-1",
    title: "Issue",
    description: null,
    priority: 1,
    state: "In Progress",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
}
