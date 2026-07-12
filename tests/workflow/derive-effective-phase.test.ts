import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import type { WorkflowPhaseConfig } from "../../src/config/types.js";
import { deriveEffectivePhase } from "../../src/workflow/derive-effective-phase.js";

const DEFAULT_PHASES: WorkflowPhaseConfig[] = [
  {
    id: "clarify",
    skill: "openspec-new-change",
    produces: "openspec/changes/{change_ref}/proposal.md",
    requiresPass: false,
  },
  {
    id: "proposal_review",
    skill: "openspec-proposal-review",
    produces: "openspec/changes/{change_ref}/proposal_review.md",
    requiresPass: true,
  },
  {
    id: "plan",
    skill: "openspec-continue-change",
    produces: "openspec/changes/{change_ref}/tasks.md",
    requiresPass: false,
  },
];

const VALID_SCOPE = {
  version: 1,
  primary_repo: "leke-refund",
  affected_repos: [
    {
      repo_key: "leke-refund",
      mcp_project: "F-project-leke-refund",
      role: "primary",
      confidence: "high",
      evidence: ["search_graph: RefundController"],
    },
  ],
  materialized: false,
  materialized_at: null,
};

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

  it("returns clarify when proposal_review fails", async () => {
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

    expect(result.currentPhase).toBe("clarify");
    expect(result.effectivePhase?.id).toBe("clarify");
    expect(result.allComplete).toBe(false);
  });

  it("blocks clarify when scope.json exists but is invalid", async () => {
    const workspacePath = await createWorkspace();
    await writeRelative(
      workspacePath,
      "openspec/changes/bcs-423/proposal.md",
      "# Proposal",
    );
    await writeRelative(
      workspacePath,
      "openspec/changes/bcs-423/scope.json",
      '{"version": 1}',
    );

    const result = await deriveEffectivePhase({
      workspacePath,
      changeRef: "bcs-423",
      phases: DEFAULT_PHASES,
    });

    expect(result.currentPhase).toBe("clarify");
    expect(result.scopeValidationFailed).toBe(true);
  });

  it("blocks plan when scope requires materialization", async () => {
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
      "openspec/changes/bcs-423/scope.json",
      JSON.stringify(VALID_SCOPE),
    );

    const result = await deriveEffectivePhase({
      workspacePath,
      changeRef: "bcs-423",
      phases: DEFAULT_PHASES,
    });

    expect(result.currentPhase).toBe("plan");
    expect(result.materializationBlocked).toBe(true);
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
        skill: "openspec-archive-change",
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

  it("returns done when all artifacts exist only in archived directory", async () => {
    const workspacePath = await createWorkspace();
    const archiveBase = "openspec/changes/archive/2026-06-21-bcs-496";

    await writeRelative(
      workspacePath,
      `${archiveBase}/proposal.md`,
      "# Proposal",
    );
    await writeRelative(
      workspacePath,
      `${archiveBase}/proposal_review.md`,
      "---\nstatus: pass\n---\n# Review",
    );
    await writeRelative(
      workspacePath,
      `${archiveBase}/tasks.md`,
      "# Tasks",
    );

    const result = await deriveEffectivePhase({
      workspacePath,
      changeRef: "bcs-496",
      phases: DEFAULT_PHASES,
    });

    expect(result.currentPhase).toBe("done");
    expect(result.allComplete).toBe(true);
  });

  it("prefers active change artifacts over archived copies", async () => {
    const workspacePath = await createWorkspace();

    await writeRelative(
      workspacePath,
      "openspec/changes/bcs-423/proposal.md",
      "# Active Proposal",
    );
    await writeRelative(
      workspacePath,
      "openspec/changes/archive/2026-06-19-bcs-423/proposal.md",
      "# Archived Proposal",
    );

    const result = await deriveEffectivePhase({
      workspacePath,
      changeRef: "bcs-423",
      phases: DEFAULT_PHASES,
    });

    expect(result.currentPhase).toBe("proposal_review");
  });

  it("uses the latest archived directory when multiple matches exist", async () => {
    const workspacePath = await createWorkspace();

    await writeRelative(
      workspacePath,
      "openspec/changes/archive/2026-06-19-bcs-423/proposal.md",
      "# Old",
    );
    await writeRelative(
      workspacePath,
      "openspec/changes/archive/2026-06-21-bcs-423/proposal.md",
      "# New",
    );
    await writeRelative(
      workspacePath,
      "openspec/changes/archive/2026-06-21-bcs-423/proposal_review.md",
      "---\nstatus: pass\n---\n# Review",
    );
    await writeRelative(
      workspacePath,
      "openspec/changes/archive/2026-06-21-bcs-423/tasks.md",
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
});
