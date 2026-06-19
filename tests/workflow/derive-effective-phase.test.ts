import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import type { WorkflowPhaseConfig } from "../../src/config/types.js";
import { deriveEffectivePhase } from "../../src/workflow/derive-effective-phase.js";

const DEFAULT_PHASES: WorkflowPhaseConfig[] = [
  {
    id: "clarify",
    handler: "openspec-new-change",
    produces: "openspec/changes/{change_ref}/proposal.md",
    requiresPass: false,
  },
  {
    id: "proposal_review",
    handler: "openspec-proposal-review",
    produces: "openspec/changes/{change_ref}/proposal_review.md",
    requiresPass: true,
  },
  {
    id: "plan",
    handler: "openspec-continue-change",
    produces: "openspec/changes/{change_ref}/tasks.md",
    requiresPass: false,
  },
];

const tempDirs: string[] = [];

afterEach(async () => {
  tempDirs.length = 0;
});

async function createWorkspace(): Promise<string> {
  const dir = join(
    tmpdir(),
    `symphony-v12-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

describe("deriveEffectivePhase", () => {
  it("returns clarify when no artifacts exist", async () => {
    const workspacePath = await createWorkspace();
    const result = await deriveEffectivePhase({
      workspacePath,
      changeRef: "bcs-423",
      phases: DEFAULT_PHASES,
    });

    expect(result.currentPhase).toBe("clarify");
    expect(result.effectivePhase?.id).toBe("clarify");
    expect(result.allComplete).toBe(false);
  });

  it("advances to proposal_review when proposal exists", async () => {
    const workspacePath = await createWorkspace();
    await writeRelative(
      workspacePath,
      "openspec/changes/bcs-423/proposal.md",
      "# Proposal",
    );

    const result = await deriveEffectivePhase({
      workspacePath,
      changeRef: "bcs-423",
      phases: DEFAULT_PHASES,
    });

    expect(result.currentPhase).toBe("proposal_review");
  });

  it("blocks on review fail status", async () => {
    const workspacePath = await createWorkspace();
    await writeRelative(
      workspacePath,
      "openspec/changes/bcs-423/proposal.md",
      "# Proposal",
    );
    await writeRelative(
      workspacePath,
      "openspec/changes/bcs-423/proposal_review.md",
      "---\nstatus: fail\n---\n# Review",
    );

    const result = await deriveEffectivePhase({
      workspacePath,
      changeRef: "bcs-423",
      phases: DEFAULT_PHASES,
    });

    expect(result.currentPhase).toBe("proposal_review");
    expect(result.allComplete).toBe(false);
  });

  it("returns done when all phases complete", async () => {
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

    const result = await deriveEffectivePhase({
      workspacePath,
      changeRef: "bcs-423",
      phases: DEFAULT_PHASES,
    });

    expect(result.currentPhase).toBe("done");
    expect(result.allComplete).toBe(true);
  });

  it("detects archive completion in archived change directory", async () => {
    const workspacePath = await createWorkspace();
    const phases: WorkflowPhaseConfig[] = [
      {
        id: "archive",
        handler: "openspec-archive-change",
        produces: "openspec/changes/{change_ref}/archive.md",
        requiresPass: true,
      },
    ];

    await writeRelative(
      workspacePath,
      "openspec/changes/archive/2026-06-19-bcs-423/archive.md",
      "---\nstatus: pass\n---\n# Archive",
    );

    const result = await deriveEffectivePhase({
      workspacePath,
      changeRef: "bcs-423",
      phases,
    });

    expect(result.currentPhase).toBe("done");
  });
});
