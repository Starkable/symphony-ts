import type { SymphonyWorkflowConfig } from "../config/types.js";
import { resolveChangeRef } from "./change-ref-path.js";
import { deriveEffectivePhase } from "./derive-effective-phase.js";

/** True when V1.2 workflow phases are configured and all artifacts are complete. */
export async function isWorkflowAllComplete(input: {
  workspacePath: string;
  issueIdentifier: string;
  workflow: SymphonyWorkflowConfig | null;
}): Promise<boolean> {
  const phases = input.workflow?.phases ?? [];
  if (phases.length === 0) {
    return false;
  }

  const derived = await deriveEffectivePhase({
    workspacePath: input.workspacePath,
    changeRef: resolveChangeRef(input.issueIdentifier),
    phases,
  });

  return derived.allComplete;
}
