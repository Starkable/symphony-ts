import { readAgentSkill } from "./read-agent-skill.js";
import type { AgentSkillPayload } from "./read-agent-skill.js";
import type { WorkflowDispatchContext } from "./workflow-dispatch.js";

/**
 * 校验并读取当前 phase 的 Agent skill（`.agents/skills/<id>/SKILL.md`）。
 * 无 workflow / 已完成 / 无 skill 时返回 null。
 */
export async function resolveWorkflowSkillPayload(input: {
  workspacePath: string;
  workflowDispatch: WorkflowDispatchContext | null;
}): Promise<AgentSkillPayload | null> {
  if (
    input.workflowDispatch === null ||
    input.workflowDispatch.allComplete ||
    input.workflowDispatch.skill.trim().length === 0
  ) {
    return null;
  }

  return readAgentSkill({
    workspacePath: input.workspacePath,
    skill: input.workflowDispatch.skill,
  });
}
