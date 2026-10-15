import type { SymphonyWorkflowConfig } from "../config/types.js";
import { composeV13WorkflowSection } from "../agent/prompts/v13-composer.js";
import type { Issue } from "../domain/model.js";
import { resolveChangeRef } from "./change-ref-path.js";
import {
  ensureRunState,
  isRunStateComplete,
  readRunState,
} from "./run-state.js";
import type { WorkflowDispatchContext } from "./workflow-dispatch.js";

export async function resolveV13WorkflowDispatchContext(input: {
  workspacePath: string;
  issueIdentifier: string;
  workflow: SymphonyWorkflowConfig;
}): Promise<WorkflowDispatchContext> {
  const changeRef = resolveChangeRef(input.issueIdentifier);
  const state = await ensureRunState({
    workspacePath: input.workspacePath,
    changeRef,
    workflow: input.workflow,
  });

  if (isRunStateComplete(state)) {
    return {
      changeRef,
      effectivePhaseId: "done",
      skill: "",
      producesPath: "",
      allComplete: true,
      isV13: true,
    };
  }

  const stage =
    input.workflow.phases.find((phase) => phase.id === state.currentStageId) ??
    input.workflow.phases[0];
  if (stage === undefined) {
    return {
      changeRef,
      effectivePhaseId: "done",
      skill: "",
      producesPath: "",
      allComplete: true,
      isV13: true,
    };
  }

  return {
    changeRef,
    effectivePhaseId: stage.id,
    skill: stage.skill,
    producesPath: stage.produces.replace(/\{change_ref\}/g, changeRef),
    allComplete: false,
    isV13: true,
  };
}

export async function buildV13PromptSectionForTurn(input: {
  workspacePath: string;
  issue: Issue;
  workflow: SymphonyWorkflowConfig;
}): Promise<string> {
  const changeRef = resolveChangeRef(input.issue.identifier);
  const state = await ensureRunState({
    workspacePath: input.workspacePath,
    changeRef,
    workflow: input.workflow,
  });

  const stage =
    input.workflow.phases.find((phase) => phase.id === state.currentStageId) ??
    input.workflow.phases[0];
  if (stage === undefined) {
    return composeV13WorkflowSection({
      issue: input.issue,
      changeRef,
      stage: input.workflow.phases[0]!,
      complete: true,
    });
  }

  return composeV13WorkflowSection({
    issue: input.issue,
    changeRef,
    stage,
    complete: isRunStateComplete(state),
  });
}

export async function isV13WorkflowComplete(input: {
  workspacePath: string;
}): Promise<boolean> {
  const state = await readRunState(input.workspacePath);
  return state?.complete === true;
}
