import type {
  SymphonyWorkflowConfig,
  WorkflowPhaseConfig,
} from "../config/types.js";
import { expandChangeRefPath } from "./change-ref-path.js";

export interface ResolvedPhaseEntry {
  id: string;
  skill: string;
  producesPattern: string;
  producesPath: string;
  primaryArtifactName: string;
  requiresPass: boolean;
}

export interface ResolvedPhaseManifest {
  changeRef: string;
  phases: ResolvedPhaseEntry[];
}

export function resolvePhaseManifest(input: {
  workflow: SymphonyWorkflowConfig;
  changeRef: string;
}): ResolvedPhaseManifest {
  return {
    changeRef: input.changeRef,
    phases: input.workflow.phases.map((phase) =>
      resolvePhaseEntry(phase, input.changeRef),
    ),
  };
}

export function resolvePhaseEntry(
  phase: WorkflowPhaseConfig,
  changeRef: string,
): ResolvedPhaseEntry {
  const producesPath = expandChangeRefPath(phase.produces, changeRef);
  const primaryArtifactName = producesPath.split("/").pop() ?? producesPath;

  return {
    id: phase.id,
    skill: phase.skill,
    producesPattern: phase.produces,
    producesPath,
    primaryArtifactName,
    requiresPass: phase.requiresPass,
  };
}
