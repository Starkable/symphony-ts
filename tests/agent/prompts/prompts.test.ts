import { describe, expect, it } from "vitest";

import type { Issue } from "../../../src/domain/model.js";
import {
  DEFAULT_WORKFLOW_PROMPT,
  LINEAR_GRAPHQL_DESCRIPTION,
  LINEAR_GRAPHQL_QUERY_DESCRIPTION,
  LINEAR_GRAPHQL_VARIABLES_DESCRIPTION,
  POLICY_SECTION_TITLE,
  WORKFLOW_DONE_MESSAGE,
  WORKFLOW_SECTION_TITLE,
  buildContinuationPrompt,
  buildSkillDeclareGuidance,
  buildSymphonyPolicySection,
} from "../../../src/agent/prompts/index.js";

const ISSUE: Issue = {
  id: "issue-1",
  identifier: "ABC-123",
  title: "示例标题",
  description: "desc",
  priority: 1,
  state: "In Progress",
  branchName: null,
  url: "https://example.com/ABC-123",
  labels: [],
  blockedBy: [],
  createdAt: "2026-03-06T00:00:00.000Z",
  updatedAt: "2026-03-06T01:00:00.000Z",
};

describe("agent prompts resources", () => {
  it("exposes non-empty Chinese catalog constants", () => {
    expect(DEFAULT_WORKFLOW_PROMPT.trim().length).toBeGreaterThan(0);
    expect(DEFAULT_WORKFLOW_PROMPT).toMatch(/[\u4e00-\u9fff]/);
    expect(WORKFLOW_SECTION_TITLE).toContain("工作流");
    expect(POLICY_SECTION_TITLE).toContain("策略");
    expect(WORKFLOW_DONE_MESSAGE).toContain("完成");
    expect(LINEAR_GRAPHQL_DESCRIPTION.trim().length).toBeGreaterThan(0);
    expect(LINEAR_GRAPHQL_QUERY_DESCRIPTION.trim().length).toBeGreaterThan(0);
    expect(LINEAR_GRAPHQL_VARIABLES_DESCRIPTION.trim().length).toBeGreaterThan(
      0,
    );
  });

  it("builds continuation prompts that include issue identifier and turn bounds", () => {
    const prompt = buildContinuationPrompt({
      issue: ISSUE,
      attempt: 2,
      turnNumber: 3,
      maxTurns: 5,
    });

    expect(prompt).toContain("ABC-123");
    expect(prompt).toContain("续跑 turn 3 / 5");
    expect(prompt).toContain("attempt 2");
    expect(prompt).toMatch(/[\u4e00-\u9fff]/);
  });

  it("builds policy section with change_ref path constraint", () => {
    const policy = buildSymphonyPolicySection("demo-change");

    expect(policy).toContain(POLICY_SECTION_TITLE);
    expect(policy).toContain("openspec/changes/demo-change/");
  });

  it("builds skill declare guidance without inlining skill body", () => {
    const guidance = buildSkillDeclareGuidance({
      skillId: "symphony-execute",
      producesPath: "openspec/changes/demo/execute.md",
    });

    expect(guidance).toContain("symphony-execute");
    expect(guidance).toContain("openspec/changes/demo/execute.md");
    expect(guidance).toMatch(/[\u4e00-\u9fff]/);
  });
});
