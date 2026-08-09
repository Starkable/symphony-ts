const SKILL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SHELL_LIKE_PATTERN = /[\s/\\]|^(git|pnpm|npm|bash|sh|curl|wget)\b/i;

/**
 * 校验 workflow.phases[].skill 是否为合法 skill id（不检查是否已安装）。
 */
export function validateSkillNameFormat(skill: string): string | null {
  const trimmed = skill.trim();
  if (trimmed.length === 0) {
    return "workflow phase skill must be a non-empty string.";
  }
  if (SHELL_LIKE_PATTERN.test(trimmed)) {
    return `workflow phase skill '${trimmed}' must be an Agent skill id, not a shell command.`;
  }
  if (!SKILL_NAME_PATTERN.test(trimmed)) {
    return `workflow phase skill '${trimmed}' contains invalid characters.`;
  }
  return null;
}
