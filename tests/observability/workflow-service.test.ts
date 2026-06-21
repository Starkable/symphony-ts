import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ArtifactStore } from "../../src/artifact-store/store.js";
import type {
  WorkflowManifest,
  WorkflowMeta,
} from "../../src/artifact-store/types.js";
import type { OrchestratorState } from "../../src/domain/model.js";
import { WorkflowService } from "../../src/observability/workflow-service.js";

describe("WorkflowService list filters", () => {
  it("excludes archived_reason entries from active list", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "symphony-wf-service-"));
    const store = new ArtifactStore({
      enabled: true,
      root: storeRoot,
      hydrateOnCreate: false,
    });
    await writeStoredWorkflow(storeRoot, {
      issueIdentifier: "BCS-420",
      archivedReason: "pms_terminal_cleanup",
      terminalPhase: null,
    });
    await writeStoredWorkflow(storeRoot, {
      issueIdentifier: "BCS-496",
      archivedReason: null,
      terminalPhase: null,
    });

    const service = new WorkflowService(store);
    const active = await service.listWorkflows("active", emptyState());
    expect(active.map((entry) => entry.issue_identifier)).toEqual(["BCS-496"]);
  });

  it("includes archived_reason entries in archived list", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "symphony-wf-arch-"));
    const store = new ArtifactStore({
      enabled: true,
      root: storeRoot,
      hydrateOnCreate: false,
    });
    await writeStoredWorkflow(storeRoot, {
      issueIdentifier: "BCS-420",
      archivedReason: "pms_terminal_cleanup",
      terminalPhase: null,
    });

    const service = new WorkflowService(store);
    const archived = await service.listWorkflows("archived", emptyState());
    expect(archived.map((entry) => entry.issue_identifier)).toEqual([
      "BCS-420",
    ]);
    expect(archived[0]?.archived_reason).toBe("pms_terminal_cleanup");
  });

  it("keeps running issues in active even when archived_reason is set", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "symphony-wf-running-"));
    const store = new ArtifactStore({
      enabled: true,
      root: storeRoot,
      hydrateOnCreate: false,
    });
    await writeStoredWorkflow(storeRoot, {
      issueIdentifier: "BCS-496",
      archivedReason: "pms_terminal_cleanup",
      terminalPhase: null,
    });

    const service = new WorkflowService(store);
    const state: OrchestratorState = {
      pollIntervalMs: 30_000,
      maxConcurrentAgents: 2,
      claimed: new Set(["99"]),
      completed: new Set(),
      codexTotals: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        secondsRunning: 0,
      },
      codexRateLimits: null,
      running: {
        "99": {
          issue: {
            id: "99",
            identifier: "BCS-496",
            title: "Running",
            description: null,
            priority: 1,
            state: "In Progress",
            branchName: null,
            url: null,
            labels: [],
            blockedBy: [],
            createdAt: "2026-06-21T00:00:00.000Z",
            updatedAt: "2026-06-21T00:00:00.000Z",
          },
          identifier: "BCS-496",
          retryAttempt: null,
          startedAt: "2026-06-21T00:00:00.000Z",
          workerHandle: null,
          monitorHandle: null,
          sessionId: null,
          threadId: null,
          turnId: null,
          codexAppServerPid: null,
          lastCodexEvent: null,
          lastCodexTimestamp: null,
          lastCodexMessage: null,
          codexInputTokens: 0,
          codexOutputTokens: 0,
          codexTotalTokens: 0,
          lastReportedInputTokens: 0,
          lastReportedOutputTokens: 0,
          lastReportedTotalTokens: 0,
          turnCount: 1,
        },
      },
      retryAttempts: {},
    };

    const active = await service.listWorkflows("active", state);
    expect(active.map((entry) => entry.issue_identifier)).toContain("BCS-496");
  });
});

function emptyState(): OrchestratorState {
  return {
    pollIntervalMs: 30_000,
    maxConcurrentAgents: 2,
    claimed: new Set(),
    running: {},
    retryAttempts: {},
    completed: new Set(),
    codexTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0,
    },
    codexRateLimits: null,
  };
}

async function writeStoredWorkflow(
  storeRoot: string,
  input: {
    issueIdentifier: string;
    archivedReason: "pms_terminal_cleanup" | null;
    terminalPhase: WorkflowMeta["terminal_phase"];
  },
): Promise<void> {
  const issuePath = join(storeRoot, input.issueIdentifier);
  await mkdir(issuePath, { recursive: true });

  const manifest: WorkflowManifest = {
    issue_identifier: input.issueIdentifier,
    change_ref: input.issueIdentifier.toLowerCase(),
    mode: "v1-openspec",
    current_phase: "clarify",
    updated_at: "2026-06-21T00:00:00.000Z",
    phases: [],
    runtime: {
      status: "archived",
      turn_count: null,
      last_message: null,
      last_event: null,
      last_event_at: null,
    },
  };

  const meta: WorkflowMeta = {
    issue_identifier: input.issueIdentifier,
    issue_id: "1",
    change_ref: input.issueIdentifier.toLowerCase(),
    mode: "v1-openspec",
    title: input.issueIdentifier,
    priority: null,
    terminal_phase: input.terminalPhase,
    archived_reason: input.archivedReason,
    created_at: "2026-06-21T00:00:00.000Z",
    updated_at: "2026-06-21T00:00:00.000Z",
  };

  await writeFile(
    join(issuePath, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(issuePath, "meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8",
  );
}
