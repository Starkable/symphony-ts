import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { V1PhaseId } from "../artifact-store/types.js";
import type { WorkflowPhaseConfig } from "../config/types.js";
import { evaluateArtifactCompletion } from "./artifact-completion.js";
import { expandChangeRefPath } from "./change-ref-path.js";

export interface DeriveEffectivePhaseResult {
  effectivePhase: WorkflowPhaseConfig | null;
  currentPhase: V1PhaseId;
  allComplete: boolean;
}

export async function deriveEffectivePhase(input: {
  workspacePath: string;
  changeRef: string;
  phases: WorkflowPhaseConfig[];
}): Promise<DeriveEffectivePhaseResult> {
  for (const phase of input.phases) {
    const relativePath = expandChangeRefPath(phase.produces, input.changeRef);
    const completion = await evaluatePhaseArtifact({
      workspacePath: input.workspacePath,
      changeRef: input.changeRef,
      relativePath,
      requiresPass: phase.requiresPass,
      phaseId: phase.id,
    });

    if (!completion.complete) {
      return {
        effectivePhase: phase,
        currentPhase: mapPhaseId(phase.id),
        allComplete: false,
      };
    }
  }

  return {
    effectivePhase: null,
    currentPhase: "done",
    allComplete: true,
  };
}

async function evaluatePhaseArtifact(input: {
  workspacePath: string;
  changeRef: string;
  relativePath: string;
  requiresPass: boolean;
  phaseId: string;
}): Promise<{ complete: boolean }> {
  const activeCompletion = await evaluateArtifactCompletion({
    workspacePath: input.workspacePath,
    relativePath: input.relativePath,
    requiresPass: input.requiresPass,
  });

  if (activeCompletion.complete) {
    return { complete: true };
  }

  if (input.phaseId !== "archive") {
    return { complete: false };
  }

  const archivedPath = await findArchivedArtifactPath({
    workspacePath: input.workspacePath,
    changeRef: input.changeRef,
    fileName: "archive.md",
  });

  if (archivedPath === null) {
    return { complete: false };
  }

  const archivedCompletion = await evaluateArtifactCompletion({
    workspacePath: input.workspacePath,
    relativePath: archivedPath,
    requiresPass: input.requiresPass,
  });

  return { complete: archivedCompletion.complete };
}

async function findArchivedArtifactPath(input: {
  workspacePath: string;
  changeRef: string;
  fileName: string;
}): Promise<string | null> {
  const archiveRoot = join(
    input.workspacePath,
    "openspec",
    "changes",
    "archive",
  );

  try {
    const entries = await readdir(archiveRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (!entry.name.endsWith(`-${input.changeRef}`)) {
        continue;
      }
      return join(
        "openspec",
        "changes",
        "archive",
        entry.name,
        input.fileName,
      ).replace(/\\/g, "/");
    }
  } catch {
    return null;
  }

  return null;
}

function mapPhaseId(phaseId: string): V1PhaseId {
  const normalized = phaseId.toLowerCase();
  if (
    normalized === "done" ||
    normalized === "failed" ||
    normalized === "clarify" ||
    normalized === "proposal_review" ||
    normalized === "plan" ||
    normalized === "execute" ||
    normalized === "verify" ||
    normalized === "archive"
  ) {
    return normalized as V1PhaseId;
  }
  return "clarify";
}
