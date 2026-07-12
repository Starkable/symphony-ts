import { access } from "node:fs/promises";
import { join } from "node:path";

const SKILL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SHELL_LIKE_PATTERN = /[\s/\\]|^(git|pnpm|npm|bash|sh|curl|wget)\b/i;

export class WorkspaceSkillMissingError extends Error {
  readonly code = "skill_missing";

  constructor(
    readonly skill: string,
    readonly workspacePath: string,
  ) {
    super(
      `Cursor skill '${skill}' is not installed in workspace (missing .cursor/skills/${skill}/SKILL.md).`,
    );
    this.name = "WorkspaceSkillMissingError";
  }
}

export class InvalidWorkflowSkillError extends Error {
  readonly code = "skill_invalid";

  constructor(
    readonly skill: string,
    message: string,
  ) {
    super(message);
    this.name = "InvalidWorkflowSkillError";
  }
}

export function validateSkillNameFormat(skill: string): string | null {
  const trimmed = skill.trim();
  if (trimmed.length === 0) {
    return "workflow phase skill must be a non-empty string.";
  }
  if (SHELL_LIKE_PATTERN.test(trimmed)) {
    return `workflow phase skill '${trimmed}' must be a Cursor skill name, not a shell command.`;
  }
  if (!SKILL_NAME_PATTERN.test(trimmed)) {
    return `workflow phase skill '${trimmed}' contains invalid characters.`;
  }
  return null;
}

export async function assertWorkspaceSkillInstalled(input: {
  workspacePath: string;
  skill: string;
}): Promise<void> {
  const formatError = validateSkillNameFormat(input.skill);
  if (formatError !== null) {
    throw new InvalidWorkflowSkillError(input.skill, formatError);
  }

  if (input.skill.length === 0) {
    return;
  }

  const skillPath = join(
    input.workspacePath,
    ".cursor",
    "skills",
    input.skill,
    "SKILL.md",
  );

  try {
    await access(skillPath);
  } catch {
    throw new WorkspaceSkillMissingError(input.skill, input.workspacePath);
  }
}
