import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import type { SymphonyWorkflowConfig } from "../../src/config/types.js";
import { shouldRunMaterializationHook } from "../../src/workflow/materialization-hook.js";
import { writeRunState } from "../../src/workflow/run-state.js";

const v13Workflow: SymphonyWorkflowConfig = {
  version: "1.3",
  changeRefStrategy: null,
  phases: [
    {
      id: "implement",
      skill: "stage-implement",
      produces: "artifacts/{change_ref}/implement.json",
      requiresPass: false,
      domain: "implement",
    },
    {
      id: "verify",
      skill: "stage-verify",
      produces: "artifacts/{change_ref}/verify.json",
      requiresPass: false,
      domain: "implement",
      gates: ["shell"],
      shellCommand: "pnpm test",
    },
  ],
};

describe("materialization-hook v1.3", () => {
  it("does not materialize on verify stage even when domain is implement", async () => {
    const workspacePath = join(tmpdir(), `symphony-mat-${Date.now()}`);
    const changeRef = "bcs-m1";
    await mkdir(join(workspacePath, "artifacts", changeRef), {
      recursive: true,
    });
    await writeFile(
      join(workspacePath, "artifacts", changeRef, "scope.json"),
      JSON.stringify({
        version: 1,
        primary_repo: "main",
        affected_repos: [
          {
            repo_key: "main",
            mcp_project: "p",
            role: "primary",
            confidence: "high",
            evidence: ["x"],
          },
        ],
        materialized: false,
        materialized_at: null,
      }),
      "utf8",
    );
    await writeRunState({
      workspacePath,
      state: {
        workflowVersion: "1.3",
        changeRef,
        currentStageId: "verify",
        complete: false,
        gates: {},
        manualApprovals: {},
        lastHarnessStageId: null,
      },
    });

    const shouldRun = await shouldRunMaterializationHook({
      workspacePath,
      issueIdentifier: "BCS-M1",
      workflow: v13Workflow,
    });

    expect(shouldRun).toBe(false);
  });
});
