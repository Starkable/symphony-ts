import type { Issue } from "../domain/model.js";
import type { ResolvedWorkflowConfig } from "../config/types.js";
import type { WorkflowDispatchInjection } from "../agent/prompt-builder.js";
import { isWorkflowV13 } from "./workflow-version.js";
import { buildV13PromptSectionForTurn } from "./workflow-dispatch-v13.js";
import { resolveWorkflowDispatchContext } from "./workflow-dispatch.js";

export async function buildWorkflowPromptDispatch(input: {
  config: ResolvedWorkflowConfig;
  workspacePath: string;
  issue: Issue;
}): Promise<WorkflowDispatchInjection | null> {
  const workflow = input.config.workflow;
  if (workflow === null) {
    return null;
  }

  const workflowDispatch = await resolveWorkflowDispatchContext({
    workspacePath: input.workspacePath,
    issueIdentifier: input.issue.identifier,
    workflow,
  });
  if (workflowDispatch === null) {
    return null;
  }

  const usesServicePrompts = isWorkflowV13(workflow);
  let v13PromptSection: string | undefined;
  if (usesServicePrompts) {
    v13PromptSection = await buildV13PromptSectionForTurn({
      workspacePath: input.workspacePath,
      issue: input.issue,
      workflow,
    });
  }

  return {
    changeRef: workflowDispatch.changeRef,
    effectivePhaseId: workflowDispatch.effectivePhaseId,
    skill: workflowDispatch.skill,
    producesPath: workflowDispatch.producesPath,
    ...(workflowDispatch.isV13 === true ? { isV13: true } : {}),
    ...(v13PromptSection !== undefined ? { v13PromptSection } : {}),
  };
}
