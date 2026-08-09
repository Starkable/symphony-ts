export const WORKFLOW_SECTION_TITLE = "## Symphony 工作流 (V1.2)";
export const POLICY_SECTION_TITLE = "## Symphony 策略 (V1.2)";
export const PMS_COMMENTS_SECTION_TITLE = "## PMS 备注";

export const WORKFLOW_DONE_MESSAGE = "全部工作流产物已完成。";

/**
 * 构建策略节正文（含 change 路径约束）。
 * 入口：changeRef；返回：完整策略 Markdown 节。
 */
export function buildSymphonyPolicySection(changeRef: string): string {
  return [
    POLICY_SECTION_TITLE,
    `- 仅操作 openspec/changes/${changeRef}/`,
    "- 禁止 AskUserQuestion 选择 change 或阻塞性确认",
    "- 只执行当前 effective_phase 对应 skill；禁止跳步",
    "- 禁止未授权 git push",
  ].join("\n");
}

/**
 * 弱引导：声明使用已安装 skill，不内联 SKILL.md 正文。
 */
export function buildSkillDeclareGuidance(input: {
  skillId: string;
  producesPath: string;
}): string {
  const skillId = input.skillId.trim();
  if (skillId.length === 0) {
    return `请完成本阶段，并将产物写到 ${input.producesPath}。`;
  }
  return `请使用已安装的 skill ${skillId} 完成当前阶段，并将产物写到 ${input.producesPath}。`;
}
