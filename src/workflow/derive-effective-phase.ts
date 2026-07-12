import type { V1PhaseId } from "../artifact-store/types.js";
import type {
  SymphonyWorkflowConfig,
  WorkflowPhaseConfig,
} from "../config/types.js";
import {
  type ArtifactCompletionResult,
  evaluateArtifactCompletion,
} from "./artifact-completion.js";
import { resolveArtifactRelativePath } from "./resolve-artifact-path.js";
import {
  type ResolvedPhaseEntry,
  type ResolvedPhaseManifest,
  resolvePhaseManifest,
} from "./resolve-phase-manifest.js";
import {
  loadScopeJson,
  phaseRequiresMaterializationGate,
  scopeRequiresMaterialization,
} from "./scope-json.js";

export interface PhaseCompletionSnapshot {
  phaseId: string;
  complete: boolean;
  failed: boolean;
  completion: ArtifactCompletionResult;
}

export interface DeriveEffectivePhaseResult {
  effectivePhase: WorkflowPhaseConfig | null;
  currentPhase: V1PhaseId;
  allComplete: boolean;
  phaseCompletions: PhaseCompletionSnapshot[];
  materializationBlocked: boolean;
  scopeValidationFailed: boolean;
}

export async function deriveEffectivePhase(input: {
  workspacePath: string;
  changeRef: string;
  phases: WorkflowPhaseConfig[];
  workflow?: SymphonyWorkflowConfig | null;
}): Promise<DeriveEffectivePhaseResult> {
  const manifest =
    input.workflow !== null && input.workflow !== undefined
      ? resolvePhaseManifest({
          workflow: input.workflow,
          changeRef: input.changeRef,
        })
      : resolvePhaseManifest({
          workflow: {
            version: null,
            changeRefStrategy: null,
            phases: input.phases,
          },
          changeRef: input.changeRef,
        });

  const phaseCompletions = await evaluatePhaseCompletions({
    workspacePath: input.workspacePath,
    changeRef: input.changeRef,
    manifest,
  });

  const scopeState = await loadScopeJson({
    workspacePath: input.workspacePath,
    changeRef: input.changeRef,
  });

  const reviewFailed = isProposalReviewFailed(input.phases, phaseCompletions);
  if (reviewFailed) {
    const clarifyPhase = findPhaseById(input.phases, "clarify") ?? input.phases[0];
    if (clarifyPhase !== undefined) {
      return {
        effectivePhase: clarifyPhase,
        currentPhase: "clarify",
        allComplete: false,
        phaseCompletions,
        materializationBlocked: false,
        scopeValidationFailed:
          scopeState.exists && !scopeState.valid,
      };
    }
  }

  for (const [index, phase] of input.phases.entries()) {
    const completion = phaseCompletions[index];
    if (completion === undefined) {
      continue;
    }

    if (phase.id === "clarify" && completion.complete) {
      if (scopeState.exists && !scopeState.valid) {
        return {
          effectivePhase: phase,
          currentPhase: mapPhaseId(phase.id),
          allComplete: false,
          phaseCompletions,
          materializationBlocked: false,
          scopeValidationFailed: true,
        };
      }
      continue;
    }

    if (
      phaseRequiresMaterializationGate(phase.id) &&
      !completion.complete &&
      scopeState.document !== null &&
      scopeRequiresMaterialization(scopeState.document) &&
      scopeState.document.materialized !== true
    ) {
      return {
        effectivePhase: phase,
        currentPhase: mapPhaseId(phase.id),
        allComplete: false,
        phaseCompletions,
        materializationBlocked: true,
        scopeValidationFailed: false,
      };
    }

    if (!completion.complete) {
      return {
        effectivePhase: phase,
        currentPhase: mapPhaseId(phase.id),
        allComplete: false,
        phaseCompletions,
        materializationBlocked: false,
        scopeValidationFailed: false,
      };
    }
  }

  return {
    effectivePhase: null,
    currentPhase: "done",
    allComplete: true,
    phaseCompletions,
    materializationBlocked: false,
    scopeValidationFailed: false,
  };
}

export async function evaluatePhaseCompletions(input: {
  workspacePath: string;
  changeRef: string;
  manifest: ResolvedPhaseManifest;
}): Promise<PhaseCompletionSnapshot[]> {
  const snapshots: PhaseCompletionSnapshot[] = [];

  for (const phase of input.manifest.phases) {
    const completion = await evaluateResolvedPhaseArtifact({
      workspacePath: input.workspacePath,
      changeRef: input.changeRef,
      phase,
    });
    snapshots.push({
      phaseId: phase.id,
      complete: completion.complete,
      failed:
        completion.exists && phase.requiresPass && completion.status === "fail",
      completion,
    });
  }

  return snapshots;
}

function isProposalReviewFailed(
  phases: WorkflowPhaseConfig[],
  phaseCompletions: PhaseCompletionSnapshot[],
): boolean {
  const reviewIndex = phases.findIndex((phase) => phase.id === "proposal_review");
  if (reviewIndex < 0) {
    return false;
  }
  const reviewCompletion = phaseCompletions[reviewIndex];
  return reviewCompletion?.failed === true;
}

function findPhaseById(
  phases: WorkflowPhaseConfig[],
  phaseId: string,
): WorkflowPhaseConfig | undefined {
  return phases.find((phase) => phase.id === phaseId);
}

async function evaluateResolvedPhaseArtifact(input: {
  workspacePath: string;
  changeRef: string;
  phase: ResolvedPhaseEntry;
}): Promise<ArtifactCompletionResult> {
  const resolvedPath = await resolveArtifactRelativePath({
    workspacePath: input.workspacePath,
    changeRef: input.changeRef,
    relativePath: input.phase.producesPath,
  });

  if (resolvedPath === null) {
    return { exists: false, status: null, complete: false };
  }

  return await evaluateArtifactCompletion({
    workspacePath: input.workspacePath,
    relativePath: resolvedPath,
    requiresPass: input.phase.requiresPass,
  });
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
