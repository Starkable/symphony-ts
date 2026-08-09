import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowPhaseConfig } from "../../../src/config/types.js";
import { PmsTrackerClient } from "../../../src/tracker/pms/pms-client.js";
import { PmsWritebackService } from "../../../src/tracker/pms/pms-writeback.js";

const V12_DONE_PHASES: WorkflowPhaseConfig[] = [
  {
    id: "clarify",
    skill: "symphony-clarify",
    produces: "openspec/changes/{change_ref}/proposal.md",
    requiresPass: false,
  },
  {
    id: "archive",
    skill: "symphony-archive",
    produces: "openspec/changes/{change_ref}/archive.md",
    requiresPass: true,
  },
];

function createMockClient(
  handlers: Partial<{
    transitionIssueByTarget: PmsTrackerClient["transitionIssueByTarget"];
    addIssueComment: PmsTrackerClient["addIssueComment"];
    listIssueComments: PmsTrackerClient["listIssueComments"];
  }>,
): PmsTrackerClient {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

  const client = new PmsTrackerClient({
    serverUrl: "http://pms.example.com",
    projectKey: "BCS",
    activeStates: ["In Progress"],
    oauth: {
      consumerKey: "qa-monitor",
      accessToken: "access-token",
      accessTokenSecret: "access-secret",
      privateKeyPem: privateKey
        .export({ type: "pkcs1", format: "pem" })
        .toString(),
    },
    fetchFn: vi.fn(),
  });

  if (handlers.transitionIssueByTarget) {
    vi.spyOn(client, "transitionIssueByTarget").mockImplementation(
      handlers.transitionIssueByTarget,
    );
  }
  if (handlers.addIssueComment) {
    vi.spyOn(client, "addIssueComment").mockImplementation(
      handlers.addIssueComment,
    );
  }
  if (handlers.listIssueComments) {
    vi.spyOn(client, "listIssueComments").mockImplementation(
      handlers.listIssueComments,
    );
  }

  return client;
}

describe("pms-writeback", () => {
  it("executes clarify_blocked transition and comment", async () => {
    const transition = vi.fn(async () => ({
      ok: true,
      status: 204,
      errorBody: "",
      transitionId: "281",
    }));
    const comment = vi.fn(async () => ({
      ok: true,
      status: 201,
      errorBody: "",
    }));

    const client = createMockClient({
      transitionIssueByTarget: transition,
      addIssueComment: comment,
      listIssueComments: async () => [],
    });
    const service = new PmsWritebackService(client);
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-writeback-"));
    await mkdir(join(workspacePath, ".symphony"), { recursive: true });
    await writeFile(
      join(workspacePath, ".symphony", "workpad.md"),
      "## Agent Workpad\n- Phase: failed\n\n### Notes\n- CLARIFY_BLOCKED: missing AC\n",
      "utf8",
    );

    await service.processWorkpadSignal({
      issueKey: "BCS-1",
      issueState: "\u8fdb\u884c\u4e2d",
      workspacePath,
      logger: null,
    });

    expect(transition).toHaveBeenCalledWith("BCS-1", "\u5f00\u53d1\u6682\u505c");
    expect(comment).toHaveBeenCalled();
  });

  it("queues pending when transition fails", async () => {
    const client = createMockClient({
      transitionIssueByTarget: async () => ({
        ok: false,
        status: 400,
        errorBody: "required field",
        transitionId: null,
      }),
    });
    const service = new PmsWritebackService(client);
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-writeback-"));
    await mkdir(join(workspacePath, ".symphony"), { recursive: true });
    await writeFile(
      join(workspacePath, ".symphony", "workpad.md"),
      "## Agent Workpad\n- Phase: done\n",
      "utf8",
    );

    await service.processWorkpadSignal({
      issueKey: "BCS-2",
      issueState: "\u8fdb\u884c\u4e2d",
      workspacePath,
      logger: null,
    });

    expect(service.getPendingCount()).toBe(1);
  });

  it("executes done transition from V1.2 artifact completion without workpad", async () => {
    const transition = vi.fn(async () => ({
      ok: true,
      status: 204,
      errorBody: "",
      transitionId: "221",
    }));

    const client = createMockClient({
      transitionIssueByTarget: transition,
    });
    const service = new PmsWritebackService(client);
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-writeback-v12-"));
    await mkdir(
      join(
        workspacePath,
        "openspec/changes/archive/2026-06-21-bcs-496",
      ),
      { recursive: true },
    );
    await writeFile(
      join(
        workspacePath,
        "openspec/changes/archive/2026-06-21-bcs-496/proposal.md",
      ),
      "# Proposal",
      "utf8",
    );
    await writeFile(
      join(
        workspacePath,
        "openspec/changes/archive/2026-06-21-bcs-496/archive.md",
      ),
      "---\nstatus: pass\n---\n# Archive",
      "utf8",
    );

    await service.processCompletionSignal({
      issueKey: "BCS-496",
      issueState: "\u8fdb\u884c\u4e2d",
      workspacePath,
      logger: null,
      workflow: {
        version: "1.2",
        changeRefStrategy: null,
        phases: V12_DONE_PHASES,
      },
    });

    expect(transition).toHaveBeenCalledWith("BCS-496", "\u5df2\u63d0\u6d4b");
  });

  it("skips done transition when issue is already done", async () => {
    const transition = vi.fn(async () => ({
      ok: true,
      status: 204,
      errorBody: "",
      transitionId: "221",
    }));

    const client = createMockClient({
      transitionIssueByTarget: transition,
    });
    const service = new PmsWritebackService(client);
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-writeback-v12-"));
    await mkdir(join(workspacePath, ".symphony"), { recursive: true });
    await writeFile(
      join(workspacePath, ".symphony", "workpad.md"),
      "## Agent Workpad\n- Phase: done\n",
      "utf8",
    );

    await service.processCompletionSignal({
      issueKey: "BCS-3",
      issueState: "\u5df2\u63d0\u6d4b",
      workspacePath,
      logger: null,
      workflow: null,
    });

    expect(transition).not.toHaveBeenCalled();
  });
});
