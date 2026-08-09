import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import type {
  SymphonyWorkflowConfig,
  WorkflowPhaseConfig,
} from "../../src/config/types.js";
import { isWorkflowAllComplete } from "../../src/workflow/workflow-harness-stop.js";

const DEFAULT_PHASES: WorkflowPhaseConfig[] = [
  {
    id: "clarify",
    skill: "symphony-clarify",
    produces: "openspec/changes/{change_ref}/proposal.md",
    requiresPass: false,
  },
  {
    id: "proposal_review",
    skill: "symphony-proposal-review",
    produces: "openspec/changes/{change_ref}/proposal_review.md",
    requiresPass: true,
  },
  {
    id: "plan",
    skill: "symphony-plan",
    produces: "openspec/changes/{change_ref}/tasks.md",
    requiresPass: false,
  },
];

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.length = 0;
});

async function createWorkspace(): Promise<string> {
  const dir = join(
    tmpdir(),
    `symphony-harness-stop-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

async function writeRelative(
  workspacePath: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const absolutePath = join(workspacePath, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

function workflowConfig(
  phases: WorkflowPhaseConfig[],
): SymphonyWorkflowConfig {
  return { version: "1.2", changeRefStrategy: null, phases };
}

describe("isWorkflowAllComplete", () => {
  it("returns false when workflow phases are not configured", async () => {
    const workspacePath = await createWorkspace();

    const result = await isWorkflowAllComplete({
      workspacePath,
      issueIdentifier: "BCS-423",
      workflow: null,
    });

    expect(result).toBe(false);
  });

  it("returns false when artifacts are incomplete", async () => {
    const workspacePath = await createWorkspace();
    await writeRelative(
      workspacePath,
      "openspec/changes/bcs-423/proposal.md",
      "# Proposal",
    );

    const result = await isWorkflowAllComplete({
      workspacePath,
      issueIdentifier: "BCS-423",
      workflow: workflowConfig(DEFAULT_PHASES),
    });

    expect(result).toBe(false);
  });

  it("returns true when all phase artifacts are complete", async () => {
    const workspacePath = await createWorkspace();
    await writeRelative(
      workspacePath,
      "openspec/changes/bcs-423/proposal.md",
      "# Proposal",
    );
    await writeRelative(
      workspacePath,
      "openspec/changes/bcs-423/proposal_review.md",
      "---\nstatus: pass\n---\n# Review",
    );
    await writeRelative(
      workspacePath,
      "openspec/changes/bcs-423/tasks.md",
      "# Tasks",
    );

    const result = await isWorkflowAllComplete({
      workspacePath,
      issueIdentifier: "BCS-423",
      workflow: workflowConfig(DEFAULT_PHASES),
    });

    expect(result).toBe(true);
  });
});
