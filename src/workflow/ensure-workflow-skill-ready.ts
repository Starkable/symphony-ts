import { assertWorkspaceSkillInstalled } from "./validate-workspace-skills.js";
import type { WorkflowDispatchContext } from "./workflow-dispatch.js";

export async function ensureWorkflowSkillReady(input: {
  workspacePath: string;
  workflowDispatch: WorkflowDispatchContext | null;
}): Promise<void> {
  if (
    input.workflowDispatch === null ||
    input.workflowDispatch.allComplete ||
    input.workflowDispatch.skill.trim().length === 0
  ) {
    return;
  }

  await assertWorkspaceSkillInstalled({
    workspacePath: input.workspacePath,
    skill: input.workflowDispatch.skill,
  });
}
