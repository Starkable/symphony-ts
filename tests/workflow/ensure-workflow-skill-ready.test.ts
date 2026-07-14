import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { resolveWorkflowSkillPayload } from "../../src/workflow/ensure-workflow-skill-ready.js";
import type { WorkflowDispatchContext } from "../../src/workflow/workflow-dispatch.js";

describe("resolveWorkflowSkillPayload", () => {
  it("returns null when workflow is complete", async () => {
    const dispatch: WorkflowDispatchContext = {
      changeRef: "abc",
      effectivePhaseId: "done",
      skill: "openspec-new-change",
      producesPath: "",
      allComplete: true,
    };

    await expect(
      resolveWorkflowSkillPayload({
        workspacePath: tmpdir(),
        workflowDispatch: dispatch,
      }),
    ).resolves.toBeNull();
  });

  it("loads skill from .agents/skills before turn", async () => {
    const workspacePath = join(
      tmpdir(),
      `symphony-ensure-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const skillDir = join(
      workspacePath,
      ".agents",
      "skills",
      "openspec-new-change",
    );
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\ndescription: Clarify\n---\n\nCreate proposal.\n",
      "utf8",
    );

    const payload = await resolveWorkflowSkillPayload({
      workspacePath,
      workflowDispatch: {
        changeRef: "abc",
        effectivePhaseId: "clarify",
        skill: "openspec-new-change",
        producesPath: "openspec/changes/abc/proposal.md",
        allComplete: false,
      },
    });

    expect(payload?.body).toContain("Create proposal.");
    expect(payload?.description).toBe("Clarify");
  });
});
