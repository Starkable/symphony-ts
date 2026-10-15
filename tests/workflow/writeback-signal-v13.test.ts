import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import type { SymphonyWorkflowConfig } from "../../src/config/types.js";
import { writeRunState } from "../../src/workflow/run-state.js";
import { resolveWritebackSignal } from "../../src/workflow/writeback-signal.js";

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
  ],
};

describe("writeback-signal v1.3", () => {
  it("returns intake_rejected when review.json is rejected", async () => {
    const workspacePath = join(tmpdir(), `symphony-wb-${Date.now()}`);
    const changeRef = "bcs-r1";
    await mkdir(join(workspacePath, "artifacts", changeRef), {
      recursive: true,
    });
    await writeFile(
      join(workspacePath, "artifacts", changeRef, "review.json"),
      JSON.stringify({ status: "rejected", comment: "缺少验收标准" }),
      "utf8",
    );

    const signal = await resolveWritebackSignal({
      workpadContent: null,
      workspacePath,
      issueIdentifier: "BCS-R1",
      workflow,
    });
    expect(signal.kind).toBe("intake_rejected");

    await rm(workspacePath, { recursive: true, force: true });
  });

  it("returns done when run state is complete", async () => {
    const workspacePath = join(tmpdir(), `symphony-wb-${Date.now()}-2`);
    await mkdir(workspacePath, { recursive: true });
    await writeRunState({
      workspacePath,
      state: {
        workflowVersion: "1.3",
        changeRef: "bcs-r2",
        currentStageId: "intake_review",
        complete: true,
        gates: {},
        manualApprovals: {},
        lastHarnessStageId: null,
      },
    });

    const signal = await resolveWritebackSignal({
      workpadContent: null,
      workspacePath,
      issueIdentifier: "BCS-R2",
      workflow,
    });
    expect(signal.kind).toBe("done");
    if (signal.kind === "done") {
      expect(signal.source).toBe("artifact_v13");
    }

    await rm(workspacePath, { recursive: true, force: true });
  });
});
