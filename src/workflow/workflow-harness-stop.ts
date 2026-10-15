import type { SymphonyWorkflowConfig } from "../config/types.js";
import { resolveChangeRef } from "./change-ref-path.js";
import { deriveEffectivePhase } from "./derive-effective-phase.js";
import { isV13IntakeRejected } from "./writeback-signal.js";
import { isV13WorkflowComplete } from "./workflow-dispatch-v13.js";
import { isWorkflowV13 } from "./workflow-version.js";

/** True when workflow phases are configured and the run is complete (V1.2 scan or V1.3 run state). */
export async function isWorkflowAllComplete(input: {
  workspacePath: string;
  issueIdentifier: string;
  workflow: SymphonyWorkflowConfig | null;
}): Promise<boolean> {
  const phases = input.workflow?.phases ?? [];
  if (phases.length === 0) {
    return false;
  }

  if (isWorkflowV13(input.workflow)) {
    return await isV13WorkflowComplete({
      workspacePath: input.workspacePath,
    });
  }

  const derived = await deriveEffectivePhase({
    workspacePath: input.workspacePath,
    changeRef: resolveChangeRef(input.issueIdentifier),
    phases,
  });

  return derived.allComplete;
}

/**
 * When true, orchestrator should release claim and not schedule workflow continuation
 * (run complete or terminal block such as intake rejected).
 */
export async function shouldReleaseOrchestratorClaimAfterWorker(input: {
  workspacePath: string;
  issueIdentifier: string;
  workflow: SymphonyWorkflowConfig | null;
}): Promise<boolean> {
  if (await isWorkflowAllComplete(input)) {
    return true;
  }

  if (isWorkflowV13(input.workflow)) {
    return await isV13IntakeRejected({
      workspacePath: input.workspacePath,
      issueIdentifier: input.issueIdentifier,
    });
  }

  return false;
}
