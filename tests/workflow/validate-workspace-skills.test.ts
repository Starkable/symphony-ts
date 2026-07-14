import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertWorkspaceSkillInstalled,
  InvalidWorkflowSkillError,
  validateSkillNameFormat,
  WorkspaceSkillMissingError,
} from "../../src/workflow/validate-workspace-skills.js";
import {
  parseSkillMarkdown,
  readAgentSkill,
} from "../../src/workflow/read-agent-skill.js";

const tempDirs: string[] = [];

afterEach(() => {
  tempDirs.length = 0;
});

async function createWorkspace(): Promise<string> {
  const dir = join(
    tmpdir(),
    `symphony-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

describe("validate-workspace-skills", () => {
  it("accepts canonical skill names", () => {
    expect(validateSkillNameFormat("openspec-new-change")).toBeNull();
  });

  it("rejects shell-like skill values", () => {
    expect(validateSkillNameFormat("git push origin")).not.toBeNull();
  });

  it("throws when skill file is missing", async () => {
    const workspacePath = await createWorkspace();

    await expect(
      assertWorkspaceSkillInstalled({
        workspacePath,
        skill: "openspec-new-change",
      }),
    ).rejects.toBeInstanceOf(WorkspaceSkillMissingError);
  });

  it("fails when skill exists only under .cursor/skills", async () => {
    const workspacePath = await createWorkspace();
    const skillDir = join(
      workspacePath,
      ".cursor",
      "skills",
      "openspec-new-change",
    );
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# skill", "utf8");

    await expect(
      assertWorkspaceSkillInstalled({
        workspacePath,
        skill: "openspec-new-change",
      }),
    ).rejects.toBeInstanceOf(WorkspaceSkillMissingError);
  });

  it("passes when skill file exists under .agents/skills", async () => {
    const workspacePath = await createWorkspace();
    const skillDir = join(
      workspacePath,
      ".agents",
      "skills",
      "openspec-new-change",
    );
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "# skill", "utf8");

    await expect(
      assertWorkspaceSkillInstalled({
        workspacePath,
        skill: "openspec-new-change",
      }),
    ).resolves.toBeUndefined();
  });

  it("passes when skill file exists via directory symlink", async () => {
    const workspacePath = await createWorkspace();
    const bundleSkills = join(
      workspacePath,
      "bundle-skills",
      "openspec-new-change",
    );
    await mkdir(bundleSkills, { recursive: true });
    await writeFile(join(bundleSkills, "SKILL.md"), "# skill", "utf8");

    const skillsLink = join(workspacePath, ".agents", "skills");
    await mkdir(join(workspacePath, ".agents"), { recursive: true });
    const linkType = process.platform === "win32" ? "junction" : "dir";
    await symlink(
      join(workspacePath, "bundle-skills"),
      skillsLink,
      linkType,
    );

    await expect(
      assertWorkspaceSkillInstalled({
        workspacePath,
        skill: "openspec-new-change",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws InvalidWorkflowSkillError for invalid format", async () => {
    const workspacePath = await createWorkspace();

    await expect(
      assertWorkspaceSkillInstalled({
        workspacePath,
        skill: "git push",
      }),
    ).rejects.toBeInstanceOf(InvalidWorkflowSkillError);
  });
});

describe("readAgentSkill", () => {
  it("reads frontmatter description and body", async () => {
    const workspacePath = await createWorkspace();
    const skillDir = join(
      workspacePath,
      ".agents",
      "skills",
      "openspec-apply-change",
    );
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      ["---", "description: Apply tasks", "---", "", "Do the work."].join("\n"),
      "utf8",
    );

    const skill = await readAgentSkill({
      workspacePath,
      skill: "openspec-apply-change",
    });

    expect(skill.id).toBe("openspec-apply-change");
    expect(skill.description).toBe("Apply tasks");
    expect(skill.body).toContain("Do the work.");
  });

  it("rejects empty skill body", () => {
    expect(parseSkillMarkdown("x", "---\ndescription: only\n---\n")).toBeNull();
  });
});
