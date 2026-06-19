import type { SymphonyWorkflowConfig } from "../config/types.js";
import { expandChangeRefPath, resolveChangeRef } from "./change-ref-path.js";
import { deriveEffectivePhase } from "./derive-effective-phase.js";

export interface WorkflowDispatchContext {
  changeRef: string;
  effectivePhaseId: string;
  handler: string;
  producesPath: string;
  allComplete: boolean;
}

export async function resolveWorkflowDispatchContext(input: {
  workspacePath: string;
  issueIdentifier: string;
  workflow: SymphonyWorkflowConfig;
}): Promise<WorkflowDispatchContext | null> {
  const changeRef = resolveChangeRef(input.issueIdentifier);
  const derived = await deriveEffectivePhase({
    workspacePath: input.workspacePath,
    changeRef,
    phases: input.workflow.phases,
  });

  if (derived.allComplete || derived.effectivePhase === null) {
    return {
      changeRef,
      effectivePhaseId: "done",
      handler: "",
      producesPath: "",
      allComplete: true,
    };
  }

  const phase = derived.effectivePhase;
  return {
    changeRef,
    effectivePhaseId: phase.id,
    handler: phase.handler,
    producesPath: expandChangeRefPath(phase.produces, changeRef),
    allComplete: false,
  };
}
