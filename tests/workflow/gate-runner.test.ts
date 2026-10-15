import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import type { WorkflowPhaseConfig } from "../../src/config/types.js";
import { runStageGates } from "../../src/workflow/gate-runner.js";
import { advanceRunStateAfterGate } from "../../src/workflow/run-state.js";

describe("gate-runner", () => {
  it("fails intake when review.json is rejected", async () => {
    const workspacePath = join(tmpdir(), `symphony-gate-${Date.now()}`);
    const changeRef = "bcs-g1";
    await mkdir(join(workspacePath, "artifacts", changeRef), {
      recursive: true,
    });
    await writeFile(
      join(workspacePath, "artifacts", changeRef, "review.json"),
      JSON.stringify({ status: "rejected", comment: "信息不足" }),
      "utf8",
    );

    const phase: WorkflowPhaseConfig = {
      id: "intake_review",
      skill: "stage-intake-review",
      produces: "artifacts/{change_ref}/review.json",
      requiresPass: false,
      outputs: ["review.json"],
      gates: ["schema_valid"],
    };

    const result = await runStageGates({
      workspacePath,
      changeRef,
      phase,
      manualApprovals: {},
    });
    expect(result.passed).toBe(false);

    await rm(workspacePath, { recursive: true, force: true });
  });

  it("fails shell gate when shell_command is missing", async () => {
    const phase: WorkflowPhaseConfig = {
      id: "verify",
      skill: "stage-verify",
      produces: "artifacts/{change_ref}/verify.json",
      requiresPass: false,
      gates: ["shell"],
    };

    const result = await runStageGates({
      workspacePath: join(tmpdir(), "unused"),
      changeRef: "x",
      phase,
      manualApprovals: {},
    });
    expect(result.passed).toBe(false);
    expect(result.message).toContain("shell_command");
  });

  it("does not advance run state when gate fails", () => {
    const workflow = {
      version: "1.3",
      changeRefStrategy: null,
      phases: [
        {
          id: "intake_review",
          skill: "s",
          produces: "p",
          requiresPass: false,
        },
        {
          id: "discover",
          skill: "s2",
          produces: "p2",
          requiresPass: false,
        },
      ],
    };
    const state = {
      workflowVersion: "1.3",
      changeRef: "x",
      currentStageId: "intake_review",
      complete: false,
      gates: {},
      manualApprovals: {},
      lastHarnessStageId: null,
    };
    const next = advanceRunStateAfterGate({
      state,
      workflow,
      stageId: "intake_review",
      gateRecord: { passed: false, at: new Date().toISOString() },
    });
    expect(next.currentStageId).toBe("intake_review");
  });
});
