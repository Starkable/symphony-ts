import { readFile } from "node:fs/promises";

import {
  InvalidWorkflowSkillError,
  resolveAgentSkillMarkdownPath,
  validateSkillNameFormat,
  WorkspaceSkillMissingError,
} from "./validate-workspace-skills.js";

export interface AgentSkillPayload {
  id: string;
  description: string;
  body: string;
  sourcePath: string;
}

export class AgentSkillReadError extends Error {
  readonly code = "skill_read_error";

  constructor(
    readonly skill: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AgentSkillReadError";
  }
}

/**
 * 读取 workspace `.agents/skills/<id>/SKILL.md`，解析 frontmatter 与正文。
 */
export async function readAgentSkill(input: {
  workspacePath: string;
  skill: string;
}): Promise<AgentSkillPayload> {
  const formatError = validateSkillNameFormat(input.skill);
  if (formatError !== null) {
    throw new InvalidWorkflowSkillError(input.skill, formatError);
  }

  const sourcePath = resolveAgentSkillMarkdownPath({
    workspacePath: input.workspacePath,
    skill: input.skill,
  });

  let raw: string;
  try {
    raw = await readFile(sourcePath, "utf8");
  } catch {
    throw new WorkspaceSkillMissingError(input.skill, input.workspacePath);
  }

  const parsed = parseSkillMarkdown(input.skill, raw);
  if (parsed === null) {
    throw new AgentSkillReadError(
      input.skill,
      `Agent skill '${input.skill}' SKILL.md is empty or has no instruction body (${sourcePath}).`,
    );
  }

  return {
    id: input.skill,
    description: parsed.description,
    body: parsed.body,
    sourcePath,
  };
}

export function parseSkillMarkdown(
  _skillId: string,
  raw: string,
): { description: string; body: string } | null {
  const content = raw.trim();
  if (content.length === 0) {
    return null;
  }

  let description = "";
  let body = content;

  if (content.startsWith("---")) {
    const rest = content.slice(3);
    const endIdx = rest.indexOf("\n---");
    if (endIdx >= 0) {
      const fmBlock = rest.slice(0, endIdx);
      body = rest.slice(endIdx + 4).trim();
      const frontmatter = parseSimpleFrontmatter(fmBlock);
      description = frontmatter.description ?? "";
    }
  }

  if (body.length === 0) {
    return null;
  }

  if (description.length === 0) {
    const firstLine = body.split("\n")[0]?.trim() ?? "";
    description =
      firstLine.length > 80 ? `${[...firstLine].slice(0, 80).join("")}...` : firstLine;
  }

  return { description, body };
}

function parseSimpleFrontmatter(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? "";
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon < 0) {
      continue;
    }
    const key = line.slice(0, colon).trim().toLowerCase();
    let value = line.slice(colon + 1).trim();

    if (value === ">-" || value === "|-" || value === ">" || value === "|") {
      const blockLines: string[] = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1] ?? "";
        if (next.length === 0 || (next[0] !== " " && next[0] !== "\t")) {
          break;
        }
        i += 1;
        blockLines.push(next.trim());
      }
      value = blockLines.join(" ");
    }

    value = value.replace(/^["']|["']$/g, "");
    if (key.length > 0) {
      result[key] = value;
    }
  }
  return result;
}
