import type { SymphonyWorkflowConfig } from "../config/types.js";
import type { WorkspaceHookRunner } from "../workspace/hooks.js";
import { resolveChangeRef } from "./change-ref-path.js";
import { deriveEffectivePhase } from "./derive-effective-phase.js";
import {
  loadScopeJson,
  phaseRequiresMaterializationGate,
  scopeRequiresMaterialization,
} from "./scope-json.js";

export async function shouldRunMaterializationHook(input: {
  workspacePath: string;
  issueIdentifier: string;
  workflow: SymphonyWorkflowConfig | null;
}): Promise<boolean> {
  if (input.workflow === null || input.workflow.phases.length === 0) {
    return false;
  }

  const changeRef = resolveChangeRef(input.issueIdentifier);
  const derived = await deriveEffectivePhase({
    workspacePath: input.workspacePath,
    changeRef,
    phases: input.workflow.phases,
    workflow: input.workflow,
  });

  if (derived.allComplete || derived.effectivePhase === null) {
    return false;
  }

  if (!phaseRequiresMaterializationGate(derived.effectivePhase.id)) {
    return false;
  }

  if (derived.materializationBlocked) {
    return true;
  }

  const scope = await loadScopeJson({
    workspacePath: input.workspacePath,
    changeRef,
  });
  if (!scope.exists || scope.document === null) {
    return false;
  }

  return (
    scopeRequiresMaterialization(scope.document) &&
    scope.document.materialized !== true
  );
}

export async function runMaterializationHookIfNeeded(input: {
  hooks: WorkspaceHookRunner;
  workspacePath: string;
  issueIdentifier: string;
  workflow: SymphonyWorkflowConfig | null;
}): Promise<boolean> {
  const shouldRun = await shouldRunMaterializationHook({
    workspacePath: input.workspacePath,
    issueIdentifier: input.issueIdentifier,
    workflow: input.workflow,
  });
  if (!shouldRun) {
    return false;
  }

  await input.hooks.run({
    name: "beforeRun",
    workspacePath: input.workspacePath,
  });
  return true;
}
