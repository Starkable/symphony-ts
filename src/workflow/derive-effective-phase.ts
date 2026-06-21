import type { V1PhaseId } from "../artifact-store/types.js";
import type { WorkflowPhaseConfig } from "../config/types.js";
import { evaluateArtifactCompletion } from "./artifact-completion.js";
import { expandChangeRefPath } from "./change-ref-path.js";
import { resolveArtifactRelativePath } from "./resolve-artifact-path.js";

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
}): Promise<{ complete: boolean }> {
  const resolvedPath = await resolveArtifactRelativePath({
    workspacePath: input.workspacePath,
    changeRef: input.changeRef,
    relativePath: input.relativePath,
  });

  if (resolvedPath === null) {
    return { complete: false };
  }

  const completion = await evaluateArtifactCompletion({
    workspacePath: input.workspacePath,
    relativePath: resolvedPath,
    requiresPass: input.requiresPass,
  });

  return { complete: completion.complete };
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
