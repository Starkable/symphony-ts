import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { AgentHarness } from "../../src/agent/harness/agent-harness.js";
import type {
  HarnessRunInput,
  HarnessRunResult,
} from "../../src/agent/harness/types.js";
import type { AgentRunnerEvent } from "../../src/agent/runner.js";
import type { ResolvedWorkflowConfig } from "../../src/config/types.js";
import type { Issue } from "../../src/domain/model.js";
import {
  type StructuredLogEntry,
  StructuredLogger,
} from "../../src/logging/structured-logger.js";
import { OrchestratorRuntimeHost } from "../../src/orchestrator/runtime-host.js";
import type {
  IssueStateSnapshot,
  IssueTracker,
} from "../../src/tracker/tracker.js";
import { WorkspaceManager } from "../../src/workspace/workspace-manager.js";
import {
  DEFAULT_TEST_CODEX_CONFIG,
  withHarnessConfig,
} from "../helpers/workflow-config.js";

describe("OrchestratorRuntimeHost", () => {
  it("feeds codex events into orchestrator state and schedules continuation retry after a normal worker exit", async () => {
    const tracker = createTracker();
    const fakeRunner = new FakeAgentRunner();
    const host = new OrchestratorRuntimeHost({
      config: createConfig(),
      tracker,
      createAgentRunner: ({ onEvent }) => {
        fakeRunner.onEvent = onEvent;
        return fakeRunner;
      },
      now: () => new Date("2026-03-06T00:00:05.000Z"),
    });

    const tick = await host.pollOnce();

    expect(tick.dispatchedIssueIds).toEqual(["1"]);
    fakeRunner.emit("1", {
      event: "session_started",
      timestamp: "2026-03-06T00:00:01.000Z",
      codexAppServerPid: "1001",
      sessionId: "thread-1-turn-1",
      threadId: "thread-1",
      turnId: "turn-1",
    });
    fakeRunner.emit("1", {
      event: "turn_completed",
      timestamp: "2026-03-06T00:00:02.000Z",
      codexAppServerPid: "1001",
      sessionId: "thread-1-turn-1",
      threadId: "thread-1",
      turnId: "turn-1",
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
      },
      rateLimits: {
        requestsRemaining: 9,
      },
      message: "turn completed",
    });
    await host.flushEvents();

    let snapshot = await host.getRuntimeSnapshot();
    expect(snapshot.running).toEqual([
      expect.objectContaining({
        issue_id: "1",
        session_id: "thread-1-turn-1",
        turn_count: 1,
        last_event: "turn_completed",
        last_message: "turn completed",
        tokens: {
          input_tokens: 11,
          output_tokens: 7,
          total_tokens: 18,
        },
      }),
    ]);
    expect(snapshot.codex_totals.total_tokens).toBe(18);

    fakeRunner.resolve("1", {
      issue: createIssue({ state: "In Progress" }),
      workspace: {
        path: "/tmp/workspaces/1",
        workspaceKey: "1",
        createdNow: true,
      },
      runAttempt: {
        issueId: "1",
        issueIdentifier: "ISSUE-1",
        attempt: null,
        workspacePath: "/tmp/workspaces/1",
        startedAt: "2026-03-06T00:00:00.000Z",
        status: "succeeded",
      },
      liveSession: {
        sessionId: "thread-1-turn-1",
        threadId: "thread-1",
        turnId: "turn-1",
        codexAppServerPid: "1001",
        lastCodexEvent: "turn_completed",
        lastCodexTimestamp: "2026-03-06T00:00:02.000Z",
        lastCodexMessage: "turn completed",
        codexInputTokens: 11,
        codexOutputTokens: 7,
        codexTotalTokens: 18,
        lastReportedInputTokens: 11,
        lastReportedOutputTokens: 7,
        lastReportedTotalTokens: 18,
        turnCount: 1,
      },
      turnsCompleted: 1,
      lastTurn: null,
      rateLimits: {
        requestsRemaining: 9,
      },
    });
    await host.waitForIdle();

    snapshot = await host.getRuntimeSnapshot();
    expect(snapshot.running).toEqual([]);
    expect(snapshot.retrying).toEqual([
      expect.objectContaining({
        issue_id: "1",
        issue_identifier: "ISSUE-1",
        attempt: 1,
        error: null,
      }),
    ]);
  });

  it("cancels a reconciled worker and releases the claim when the issue is no longer eligible on retry", async () => {
    const tracker = createTracker();
    const fakeRunner = new FakeAgentRunner();
    const host = new OrchestratorRuntimeHost({
      config: createConfig(),
      tracker,
      createAgentRunner: ({ onEvent }) => {
        fakeRunner.onEvent = onEvent;
        return fakeRunner;
      },
      now: () => new Date("2026-03-06T00:00:05.000Z"),
    });

    await host.pollOnce();
    tracker.setStateSnapshots([
      { id: "1", identifier: "ISSUE-1", state: "Done" },
    ]);

    const reconcileTick = await host.pollOnce();
    expect(reconcileTick.stopRequests).toEqual([
      {
        issueId: "1",
        issueIdentifier: "ISSUE-1",
        cleanupWorkspace: true,
        reason: "terminal_state",
      },
    ]);
    await host.waitForIdle();

    expect(fakeRunner.abortReasons).toEqual(["Stopped due to terminal_state."]);
    expect(Object.keys(host.getState().retryAttempts)).toEqual(["1"]);

    tracker.setCandidates([]);
    const retryResult = await host.runRetryTimer("1");

    expect(retryResult).toEqual({
      dispatched: false,
      released: true,
      retryEntry: null,
    });
    expect([...host.getState().claimed]).toEqual([]);
  });

  it("coalesces manual refresh requests onto a single queued poll", async () => {
    const tracker = createTracker({
      candidates: [],
    });
    const host = new OrchestratorRuntimeHost({
      config: createConfig(),
      tracker,
      agentRunner: new FakeAgentRunner(),
      now: () => new Date("2026-03-06T00:00:05.000Z"),
    });

    const [first, second] = await Promise.all([
      host.requestRefresh(),
      host.requestRefresh(),
    ]);
    await host.waitForIdle();

    expect(first).toMatchObject({
      queued: true,
      coalesced: false,
      operations: ["poll", "reconcile"],
    });
    expect(second).toMatchObject({
      queued: true,
      coalesced: true,
    });
    expect(tracker.fetchCandidateIssues).toHaveBeenCalledTimes(1);
  });

  it("resolves running workspace details from issue id after identifier changes", async () => {
    const tracker = createTracker();
    const fakeRunner = new FakeAgentRunner();
    const host = new OrchestratorRuntimeHost({
      config: createConfig(),
      tracker,
      createAgentRunner: ({ onEvent }) => {
        fakeRunner.onEvent = onEvent;
        return fakeRunner;
      },
      now: () => new Date("2026-03-06T00:00:05.000Z"),
    });

    await host.pollOnce();
    tracker.setStateSnapshots([
      { id: "1", identifier: "RENAMED-2", state: "In Progress" },
    ]);
    await host.pollOnce();

    const details = await host.getIssueDetails("RENAMED-2");

    expect(details).toMatchObject({
      issue_identifier: "RENAMED-2",
      workspace: {
        path: expect.stringContaining("workspaces"),
      },
    });
  });

  it("exports workflow manifest to artifact store after turn_completed", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "symphony-host-store-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "symphony-host-ws-"));
    const tracker = createTracker();
    const fakeRunner = new FakeAgentRunner();
    const workspaceManager = new WorkspaceManager({ root: workspaceRoot });
    const host = new OrchestratorRuntimeHost({
      config: createConfig({
        workspace: { root: workspaceRoot },
        artifactStore: {
          enabled: true,
          root: storeRoot,
          hydrateOnCreate: false,
        },
      }),
      tracker,
      workspaceManager,
      createAgentRunner: ({ onEvent }) => {
        fakeRunner.onEvent = onEvent;
        return fakeRunner;
      },
      now: () => new Date("2026-03-06T00:00:05.000Z"),
    });

    await host.pollOnce();

    const workspacePath = workspaceManager.resolveForIssue("1").workspacePath;
    await mkdir(join(workspacePath, ".symphony"), { recursive: true });
    await writeFile(
      join(workspacePath, ".symphony", "workpad.md"),
      "### Meta\n- Phase: clarify\n- ChangeRef: issue-1\n",
      "utf8",
    );

    fakeRunner.emit("1", {
      event: "turn_completed",
      timestamp: "2026-03-06T00:00:02.000Z",
      codexAppServerPid: "1001",
      sessionId: "thread-1-turn-1",
      threadId: "thread-1",
      turnId: "turn-1",
      turnCount: 1,
      message: "turn completed",
    });
    await host.flushEvents();

    const manifest = JSON.parse(
      await readFile(join(storeRoot, "ISSUE-1", "manifest.json"), "utf8"),
    );
    expect(manifest.issue_identifier).toBe("ISSUE-1");
    expect(
      manifest.phases.some((phase: { id: string }) => phase.id === "clarify"),
    ).toBe(true);
  });

  it("skips artifact export for terminal issue without local workspace", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "symphony-rt-skip-store-"));
    const workspaceRoot = await mkdtemp(join(tmpdir(), "symphony-rt-skip-ws-"));
    const host = new OrchestratorRuntimeHost({
      config: createConfig({
        workspace: { root: workspaceRoot },
        artifactStore: {
          enabled: true,
          root: storeRoot,
          hydrateOnCreate: false,
        },
      }),
      tracker: createTracker(),
      workspaceManager: new WorkspaceManager({ root: workspaceRoot }),
    });

    const result = await host.exportTerminalIssue(
      createIssue({ id: "420", identifier: "BCS-420", state: "Done" }),
    );

    expect(result).toEqual({ exported: false, reason: "no_workspace" });
    await expect(
      readFile(join(storeRoot, "BCS-420", "manifest.json"), "utf8"),
    ).rejects.toThrow();
  });

  it("exports terminal issue when workspace contains symphony artifacts", async () => {
    const storeRoot = await mkdtemp(
      join(tmpdir(), "symphony-rt-export-store-"),
    );
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "symphony-rt-export-ws-"),
    );
    const workspacePath = join(workspaceRoot, "420");
    const changeDir = join(workspacePath, "openspec", "changes", "bcs-420");
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, "proposal.md"), "# Proposal\n", "utf8");

    const host = new OrchestratorRuntimeHost({
      config: createConfig({
        workspace: { root: workspaceRoot },
        artifactStore: {
          enabled: true,
          root: storeRoot,
          hydrateOnCreate: false,
        },
      }),
      tracker: createTracker(),
      workspaceManager: new WorkspaceManager({ root: workspaceRoot }),
    });

    const result = await host.exportTerminalIssue(
      createIssue({ id: "420", identifier: "BCS-420", state: "Done" }),
    );

    expect(result).toEqual({ exported: true });
    const meta = JSON.parse(
      await readFile(join(storeRoot, "BCS-420", "meta.json"), "utf8"),
    );
    expect(meta.archived_reason).toBe("pms_terminal_cleanup");
  });

  it("emits issue and session context for agent lifecycle logs", async () => {
    const tracker = createTracker();
    const fakeRunner = new FakeAgentRunner();
    const entries: StructuredLogEntry[] = [];
    const logger = new StructuredLogger([
      {
        write(entry) {
          entries.push(entry);
        },
      },
    ]);
    const host = new OrchestratorRuntimeHost({
      config: createConfig(),
      tracker,
      logger,
      createAgentRunner: ({ onEvent }) => {
        fakeRunner.onEvent = onEvent;
        return fakeRunner;
      },
      now: () => new Date("2026-03-06T00:00:05.000Z"),
    });

    await host.pollOnce();
    fakeRunner.emit("1", {
      event: "session_started",
      timestamp: "2026-03-06T00:00:01.000Z",
      codexAppServerPid: "1001",
      sessionId: "thread-1-turn-1",
      threadId: "thread-1",
      turnId: "turn-1",
    });
    await host.flushEvents();

    expect(entries).toContainEqual(
      expect.objectContaining({
        event: "worker_spawned",
        issue_id: "1",
        issue_identifier: "ISSUE-1",
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        event: "session_started",
        issue_id: "1",
        issue_identifier: "ISSUE-1",
        session_id: "thread-1-turn-1",
      }),
    );
  });
});

class FakeAgentRunner implements AgentHarness {
  onEvent: ((event: AgentRunnerEvent) => void) | undefined;
  readonly runs = new Map<
    string,
    {
      resolve: (result: HarnessRunResult) => void;
      reject: (error: Error) => void;
    }
  >();
  readonly abortReasons: string[] = [];

  async run(input: HarnessRunInput): Promise<HarnessRunResult> {
    return await new Promise<HarnessRunResult>((resolve, reject) => {
      this.runs.set(input.issue.id, { resolve, reject });
      input.signal?.addEventListener(
        "abort",
        () => {
          const reason =
            typeof input.signal?.reason === "string"
              ? input.signal.reason
              : "aborted";
          this.abortReasons.push(reason);
          reject(new Error(reason));
        },
        { once: true },
      );
    });
  }

  emit(
    issueId: string,
    event: Omit<
      AgentRunnerEvent,
      "issueId" | "issueIdentifier" | "attempt" | "workspacePath" | "turnCount"
    > &
      Partial<Pick<AgentRunnerEvent, "turnCount">>,
  ): void {
    this.onEvent?.({
      ...event,
      issueId,
      issueIdentifier: "ISSUE-1",
      attempt: null,
      workspacePath: "/tmp/workspaces/1",
      turnCount: event.turnCount ?? 0,
    });
  }

  resolve(issueId: string, result: HarnessRunResult): void {
    const run = this.runs.get(issueId);
    if (run === undefined) {
      throw new Error(`No fake run registered for ${issueId}.`);
    }
    this.runs.delete(issueId);
    run.resolve(result);
  }
}

function createTracker(input?: { candidates?: Issue[] }) {
  let candidates = input?.candidates ?? [createIssue()];
  let stateSnapshots: IssueStateSnapshot[] = [
    { id: "1", identifier: "ISSUE-1", state: "In Progress" },
  ];

  const tracker: IssueTracker & {
    setCandidates(next: Issue[]): void;
    setStateSnapshots(next: IssueStateSnapshot[]): void;
  } = {
    fetchCandidateIssues: vi.fn(async () => candidates),
    fetchIssuesByStates: vi.fn(async () => []),
    fetchIssueStatesByIds: vi.fn(async () => stateSnapshots),
    setCandidates(next) {
      candidates = next;
    },
    setStateSnapshots(next) {
      stateSnapshots = next;
    },
  };

  return tracker;
}

function createIssue(overrides?: Partial<Issue>): Issue {
  return {
    id: "1",
    identifier: "ISSUE-1",
    title: "Issue 1",
    description: null,
    priority: 1,
    state: "In Progress",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function createConfig(
  overrides: Partial<ResolvedWorkflowConfig> = {},
): ResolvedWorkflowConfig {
  return withHarnessConfig({
    workflowPath: "/tmp/WORKFLOW.md",
    promptTemplate: "Prompt",
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      projectSlug: "project",
      activeStates: ["Todo", "In Progress", "In Review"],
      terminalStates: ["Done", "Canceled"],
      issueTypes: [],
      excludeDraftStatus: false,
      assignees: [],
      stateAliases: {},
      oauth: null,
      ...overrides.tracker,
    },
    polling: {
      intervalMs: 30_000,
      ...overrides.polling,
    },
    workspace: {
      root: "/tmp/workspaces",
      ...overrides.workspace,
    },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 30_000,
      ...overrides.hooks,
    },
    agent: {
      maxConcurrentAgents: 2,
      maxTurns: 5,
      maxRetryBackoffMs: 300_000,
      maxConcurrentAgentsByState: {},
      ...overrides.agent,
    },
    codex: DEFAULT_TEST_CODEX_CONFIG,
    server: {
      port: null,
      ...overrides.server,
    },
    observability: {
      dashboardEnabled: true,
      refreshMs: 1_000,
      renderIntervalMs: 16,
      ...overrides.observability,
    },
    artifactStore: {
      enabled: false,
      root: null,
      hydrateOnCreate: false,
      ...overrides.artifactStore,
    },
    ...overrides,
  });
}
