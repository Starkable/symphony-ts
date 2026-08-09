import { dirname, join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ClaudeAgentHarness } from "../../../../src/agent/backends/claude/claude-harness.js";
import type {
  ClaudeCliRunInput,
  ClaudeCliRunResult,
} from "../../../../src/agent/backends/claude/claude-cli-session.js";
import { createClaudeHarnessEvent } from "../../../../src/agent/backends/claude/claude-event-adapter.js";
import type { Issue } from "../../../../src/domain/model.js";
import {
  DEFAULT_TEST_CLAUDE_CONFIG,
  DEFAULT_TEST_CODEX_CONFIG,
  withHarnessConfig,
} from "../../../helpers/workflow-config.js";

function createMockCliResult(
  input: ClaudeCliRunInput,
  overrides: Partial<ClaudeCliRunResult> = {},
): ClaudeCliRunResult {
  const terminalEvent = createClaudeHarnessEvent({
    kind: "turn_completed",
    message: "done",
    sessionId: "sess-123",
  });
  void input.onSessionId?.("sess-123");
  input.onHarnessEvent?.(terminalEvent);

  return {
    exitCode: 0,
    stdout: '{"type":"result"}',
    stderr: "",
    timedOut: false,
    sessionId: "sess-123",
    terminalEvent,
    ...overrides,
  };
}

describe("ClaudeAgentHarness", () => {
  it("runs turns and persists session ids", async () => {
    const events: string[] = [];
    const runCli = vi
      .fn<(input: ClaudeCliRunInput) => Promise<ClaudeCliRunResult>>()
      .mockImplementationOnce(async (input) => createMockCliResult(input));

    const harness = new ClaudeAgentHarness({
      config: buildHarnessConfig(),
      tracker: buildTracker(),
      workspaceManager: buildWorkspaceManager() as never,
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
      cwd: "/tmp/workspaces/1",
      permissionMode: "acceptEdits",
      prompt: expect.any(String),
    });
    expect(events).toContain("session_started");
    expect(events).toContain("turn_completed");
    expect(result.runAttempt.status).toBe("succeeded");
  });

  it("declares skill id in prompt without requiring .agents/skills on disk", async () => {
    const root = await createTempWorkspace();
    const runCli = vi
      .fn<(input: ClaudeCliRunInput) => Promise<ClaudeCliRunResult>>()
      .mockImplementationOnce(async (input) => createMockCliResult(input));

    const config = buildHarnessConfig({
      workflow: {
        version: "1.2",
        changeRefStrategy: "kebab_case_issue_id",
        phases: [
          {
            id: "clarify",
            skill: "symphony-clarify",
            produces: "openspec/changes/{change_ref}/proposal.md",
            requiresPass: false,
          },
        ],
      },
    });
    config.workspace.root = dirname(root);

    const harness = new ClaudeAgentHarness({
      config,
      tracker: buildTracker({ state: "Done" }),
      workspaceManager: {
        createForIssue: vi.fn(async () => ({
          path: root,
          workspaceKey: "1",
          createdNow: false,
        })),
      } as never,
      runCli,
    });

    await harness.run({
      issue: createIssue(),
      attempt: null,
    });

    const prompt = runCli.mock.calls[0]?.[0]?.prompt ?? "";
    expect(prompt).toContain("- skill: symphony-clarify");
    expect(prompt).toContain("请使用已安装的 skill symphony-clarify");
    expect(prompt).not.toContain("## Skill 说明");
    expect(prompt).not.toContain("CLAUDE_SKILL_INLINE");
  });
});

function buildHarnessConfig(overrides?: {
  workflow?: Parameters<typeof withHarnessConfig>[0]["workflow"];
}) {
  return withHarnessConfig({
    workflowPath: "/tmp/WORKFLOW.md",
    promptTemplate: "Work on {{ issue.identifier }}",
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      projectSlug: "demo",
      activeStates: ["In Progress"],
      terminalStates: ["Done"],
      issueTypes: [],
      excludeDraftStatus: false,
      assignees: [],
      stateAliases: {},
      oauth: null,
    },
    polling: { intervalMs: 30_000 },
    workspace: { root: "/tmp/workspaces" },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 500,
    },
    agent: {
      harness: "claude",
      maxConcurrentAgents: 1,
      maxTurns: 2,
      maxRetryBackoffMs: 1_000,
      maxConcurrentAgentsByState: {},
    },
    codex: DEFAULT_TEST_CODEX_CONFIG,
    harnesses: {
      claude: DEFAULT_TEST_CLAUDE_CONFIG,
    },
    server: { port: null },
    observability: {
      dashboardEnabled: false,
      refreshMs: 1_000,
      renderIntervalMs: 16,
    },
    artifactStore: {
      enabled: false,
      root: null,
      hydrateOnCreate: false,
    },
    workflow: overrides?.workflow ?? null,
  });
}

function buildTracker(input?: { state?: string }) {
  return {
    fetchCandidateIssues: vi.fn(),
    fetchIssuesByStates: vi.fn(),
    fetchIssueStatesByIds: vi.fn(async () => [
      {
        id: "issue-1",
        identifier: "ABC-123",
        state: input?.state ?? "Done",
      },
    ]),
  };
}

function buildWorkspaceManager() {
  return {
    createForIssue: vi.fn(async () => ({
      path: "/tmp/workspaces/1",
      workspaceKey: "1",
      createdNow: true,
    })),
  };
}

function createIssue(): Issue {
  return {
    id: "issue-1",
    identifier: "ABC-123",
    title: "Ship claude harness",
    description: "Implement Claude Code backend",
    priority: 1,
    state: "In Progress",
    branchName: null,
    url: "https://linear.app/example/issue/ABC-123",
    labels: [],
    blockedBy: [],
    createdAt: "2026-03-06T00:00:00.000Z",
    updatedAt: "2026-03-06T01:00:00.000Z",
  };
}

async function createTempWorkspace(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  return mkdtemp(join(tmpdir(), "symphony-claude-"));
}
