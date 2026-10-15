import type { SymphonyWorkflowConfig } from "../config/types.js";

export function isWorkflowV13(
  workflow: SymphonyWorkflowConfig | null,
): boolean {
  return workflow?.version?.trim() === "1.3";
}

export function isWorkflowV12(
  workflow: SymphonyWorkflowConfig | null,
): boolean {
  if (workflow === null || workflow.phases.length === 0) {
    return false;
  }
  const version = workflow.version?.trim();
  if (version === "1.3") {
    return false;
  }
  return version === "1.2" || version === null || version === undefined;
}
