import type { SymphonyWorkflowConfig } from "../config/types.js";
import { expandChangeRefPath, resolveChangeRef } from "./change-ref-path.js";
import { deriveEffectivePhase } from "./derive-effective-phase.js";
import { isWorkflowV13 } from "./workflow-version.js";
import { resolveV13WorkflowDispatchContext } from "./workflow-dispatch-v13.js";

export interface WorkflowDispatchContext {
  changeRef: string;
  effectivePhaseId: string;
  skill: string;
  producesPath: string;
  allComplete: boolean;
  /** True when workflow.version is 1.3 (run-state driven). */
  isV13?: boolean;
}

export async function resolveWorkflowDispatchContext(input: {
  workspacePath: string;
  issueIdentifier: string;
  workflow: SymphonyWorkflowConfig;
}): Promise<WorkflowDispatchContext | null> {
  if (isWorkflowV13(input.workflow)) {
    return await resolveV13WorkflowDispatchContext(input);
  }

  const changeRef = resolveChangeRef(input.issueIdentifier);
  const derived = await deriveEffectivePhase({
    workspacePath: input.workspacePath,
    changeRef,
    phases: input.workflow.phases,
    workflow: input.workflow,
  });

  if (derived.allComplete || derived.effectivePhase === null) {
    return {
      changeRef,
      effectivePhaseId: "done",
      skill: "",
      producesPath: "",
      allComplete: true,
    };
  }

  const phase = derived.effectivePhase;
  return {
    changeRef,
    effectivePhaseId: phase.id,
    skill: phase.skill,
    producesPath: expandChangeRefPath(phase.produces, changeRef),
    allComplete: false,
  };
}
