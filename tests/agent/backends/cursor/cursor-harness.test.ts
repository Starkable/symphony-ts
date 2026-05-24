import { describe, expect, it, vi } from "vitest";

import { CursorAgentHarness } from "../../../../src/agent/backends/cursor/cursor-harness.js";
import type { CursorCliRunResult } from "../../../../src/agent/backends/cursor/cursor-cli-session.js";
import { StructuredLogger } from "../../../../src/logging/structured-logger.js";
import type { StructuredLogEntry } from "../../../../src/logging/structured-logger.js";
import {
  DEFAULT_TEST_CODEX_CONFIG,
  DEFAULT_TEST_CURSOR_CONFIG,
  withHarnessConfig,
} from "../../../helpers/workflow-config.js";
import type { Issue } from "../../../../src/domain/model.js";

describe("CursorAgentHarness", () => {
  it("runs non-interactive turns and persists discovered chat ids", async () => {
    const events: string[] = [];
    const runCli = vi
      .fn<() => Promise<CursorCliRunResult>>()
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Chat ID: chat-123\ncompleted',
        stderr: "",
        timedOut: false,
      });

    const harness = new CursorAgentHarness({
      config: withHarnessConfig({
        workflowPath: "/tmp/WORKFLOW.md",
        promptTemplate: "Prompt {{ issue.identifier }}",
        tracker: {
          kind: "linear",
          endpoint: "https://api.linear.app/graphql",
          apiKey: "token",
          projectSlug: "ENG",
          activeStates: ["In Progress"],
          terminalStates: ["Done"],
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
          cursor: DEFAULT_TEST_CURSOR_CONFIG,
        },
        server: { port: null },
        observability: {
          dashboardEnabled: true,
          refreshMs: 1_000,
          renderIntervalMs: 16,
        },
      }),
      tracker: {
        fetchCandidateIssues: async () => [],
        fetchIssuesByStates: async () => [],
        fetchIssueStatesByIds: async () => [
          { id: "1", identifier: "ISSUE-1", state: "Done" },
        ],
      },
      workspaceManager: {
        createForIssue: async () => ({
          path: "/tmp/workspaces/1",
          workspaceKey: "1",
          createdNow: true,
        }),
        resolveForIssue: () => ({
          workspacePath: "/tmp/workspaces/1",
        }),
      } as never,
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
      args: expect.arrayContaining(["--trust", "--yolo"]),
    });
    expect(events).toContain("session_started");
    expect(events).toContain("turn_completed");
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
      .fn<() => Promise<CursorCliRunResult>>()
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'Chat ID: chat-456\n```thinking\n计划步骤\n```\ndone',
        stderr: "",
        timedOut: false,
      });

    const harness = new CursorAgentHarness({
      config: withHarnessConfig({
        workflowPath: "/tmp/WORKFLOW.md",
        promptTemplate: "Prompt {{ issue.identifier }}",
        tracker: {
          kind: "linear",
          endpoint: "https://api.linear.app/graphql",
          apiKey: "token",
          projectSlug: "ENG",
          activeStates: ["In Progress"],
          terminalStates: ["Done"],
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
            turnLogWorkspaceArtifact: false,
          },
        },
        server: { port: null },
        observability: {
          dashboardEnabled: true,
          refreshMs: 1_000,
          renderIntervalMs: 16,
        },
      }),
      tracker: {
        fetchCandidateIssues: async () => [],
        fetchIssuesByStates: async () => [],
        fetchIssueStatesByIds: async () => [
          { id: "1", identifier: "ISSUE-1", state: "Done" },
        ],
      },
      workspaceManager: {
        createForIssue: async () => ({
          path: "/tmp/workspaces/1",
          workspaceKey: "1",
          createdNow: true,
        }),
        resolveForIssue: () => ({
          workspacePath: "/tmp/workspaces/1",
        }),
      } as never,
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
      expect.arrayContaining(["-p", expect.stringContaining("prompt chars=")]),
    );
    expect(finishLog).toBeDefined();
    expect(finishLog?.thinking).toContain("计划步骤");
    expect(finishLog?.exit_code).toBe(0);
  });
});

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
