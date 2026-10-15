import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import type { SymphonyWorkflowConfig } from "../../src/config/types.js";
import {
  advanceRunStateAfterGate,
  ensureRunState,
  readRunState,
} from "../../src/workflow/run-state.js";

const workflow: SymphonyWorkflowConfig = {
  version: "1.3",
  changeRefStrategy: null,
  phases: [
    {
      id: "intake_review",
      skill: "stage-intake-review",
      produces: "artifacts/{change_ref}/review.json",
      requiresPass: false,
    },
    {
      id: "discover",
      skill: "stage-discover",
      produces: "artifacts/{change_ref}/discover.json",
      requiresPass: false,
    },
  ],
};

describe("run-state", () => {
  it("initializes and advances after gate success", async () => {
    const workspacePath = join(
      tmpdir(),
      `symphony-run-state-${Date.now().toString()}`,
    );
    await mkdir(workspacePath, { recursive: true });

    const state = await ensureRunState({
      workspacePath,
      changeRef: "bcs-1",
      workflow,
    });
    expect(state.currentStageId).toBe("intake_review");

    const advanced = advanceRunStateAfterGate({
      state,
      workflow,
      stageId: "intake_review",
      gateRecord: { passed: true, at: new Date().toISOString() },
    });
    expect(advanced.currentStageId).toBe("discover");
    expect(advanced.complete).toBe(false);

    await rm(workspacePath, { recursive: true, force: true });
  });

  it("persists run state to disk", async () => {
    const workspacePath = join(
      tmpdir(),
      `symphony-run-state-${Date.now().toString()}-2`,
    );
    await mkdir(workspacePath, { recursive: true });

    await ensureRunState({
      workspacePath,
      changeRef: "bcs-2",
      workflow,
    });
    const loaded = await readRunState(workspacePath);
    expect(loaded?.changeRef).toBe("bcs-2");

    await rm(workspacePath, { recursive: true, force: true });
  });

  it("persists failed gate record via turn-end path", async () => {
    const workspacePath = join(
      tmpdir(),
      `symphony-run-state-gate-fail-${Date.now()}`,
    );
    await mkdir(workspacePath, { recursive: true });

    const { processV13TurnEnd } = await import(
      "../../src/workflow/workflow-v13-turn-end.js"
    );
    await ensureRunState({
      workspacePath,
      changeRef: "bcs-gf",
      workflow,
    });

    const result = await processV13TurnEnd({
      workspacePath,
      changeRef: "bcs-gf",
      workflow,
    });
    expect(result.gatePassed).toBe(false);

    const loaded = await readRunState(workspacePath);
    expect(loaded?.gates.intake_review?.passed).toBe(false);

    await rm(workspacePath, { recursive: true, force: true });
  });
});
