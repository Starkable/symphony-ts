import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKFLOW_PROMPT,
  appendWorkflowDispatchSection,
  buildContinuationPrompt,
  buildSymphonyPolicySection,
  buildTurnPrompt,
  getEffectivePromptTemplate,
  renderPrompt,
} from "../../src/agent/prompt-builder.js";
import type { PromptTemplateError } from "../../src/agent/prompt-builder.js";
import type { Issue } from "../../src/domain/model.js";
import { ERROR_CODES } from "../../src/errors/codes.js";

const ISSUE_FIXTURE: Issue = {
  id: "issue-1",
  identifier: "ABC-123",
  title: "Ship prompt rendering",
  description: "Implement strict Liquid prompt rendering",
  priority: 1,
  state: "In Progress",
  branchName: "feature/abc-123",
  url: "https://linear.app/example/issue/ABC-123",
  labels: ["backend", "automation"],
  blockedBy: [
    {
      id: "issue-0",
      identifier: "ABC-122",
      state: "Todo",
    },
  ],
  createdAt: "2026-03-06T00:00:00.000Z",
  updatedAt: "2026-03-06T01:00:00.000Z",
};

describe("prompt builder", () => {
  it("uses the spec fallback prompt when the workflow body is blank", () => {
    expect(getEffectivePromptTemplate(" \n\t ")).toBe(DEFAULT_WORKFLOW_PROMPT);
  });

  it("renders issue fields, nested arrays, and attempt metadata", async () => {
    const prompt = await renderPrompt({
      workflow: {
        promptTemplate: [
          "# {{ issue.identifier }}",
          "{{ issue.title }}",
          "{% for label in issue.labels %}[{{ label }}]{% endfor %}",
          "{% for blocker in issue.blocked_by %}{{ blocker.identifier }}:{{ blocker.state }}{% endfor %}",
          "{{ issue.branch_name }}",
          "{{ issue.created_at }}",
          "{{ issue.updated_at }}",
          "attempt={{ attempt }}",
        ].join("\n"),
      },
      issue: ISSUE_FIXTURE,
      attempt: 2,
    });

    expect(prompt).toContain("# ABC-123");
    expect(prompt).toContain("Ship prompt rendering");
    expect(prompt).toContain("[backend][automation]");
    expect(prompt).toContain("ABC-122:Todo");
    expect(prompt).toContain("feature/abc-123");
    expect(prompt).toContain("2026-03-06T00:00:00.000Z");
    expect(prompt).toContain("2026-03-06T01:00:00.000Z");
    expect(prompt).toContain("attempt=2");
  });

  it("preserves a null attempt for first-run prompts", async () => {
    const prompt = await renderPrompt({
      workflow: {
        promptTemplate:
          "{% if attempt == nil %}first-run{% else %}retry{% endif %}",
      },
      issue: ISSUE_FIXTURE,
      attempt: null,
    });

    expect(prompt).toBe("first-run");
  });

  it("uses the rendered workflow prompt for the first turn and continuation guidance after that", async () => {
    const first = await buildTurnPrompt({
      workflow: {
        promptTemplate: "Initial {{ issue.identifier }} attempt={{ attempt }}",
      },
      issue: ISSUE_FIXTURE,
      attempt: 3,
      turnNumber: 1,
      maxTurns: 4,
    });
    const second = await buildTurnPrompt({
      workflow: {
        promptTemplate: "Initial {{ issue.identifier }} attempt={{ attempt }}",
      },
      issue: ISSUE_FIXTURE,
      attempt: 3,
      turnNumber: 2,
      maxTurns: 4,
    });

    expect(first).toBe("Initial ABC-123 attempt=3");
    expect(second).toContain("继续处理工作项 ABC-123");
    expect(second).toContain("续跑 turn 2 / 4");
    expect(second).not.toContain("Initial ABC-123 attempt=3");
  });

  it("builds continuation guidance with issue and attempt context", () => {
    const prompt = buildContinuationPrompt({
      issue: ISSUE_FIXTURE,
      attempt: null,
      turnNumber: 2,
      maxTurns: 5,
    });

    expect(prompt).toContain("ABC-123");
    expect(prompt).toContain("Ship prompt rendering");
    expect(prompt).toContain("当前 tracker 状态：In Progress。");
    expect(prompt).toContain("首次调度");
  });

  it("appends PMS comments section when trackerComments present", async () => {
    const prompt = await renderPrompt({
      workflow: {
        promptTemplate: "Issue {{ issue.identifier }}",
      },
      issue: {
        ...ISSUE_FIXTURE,
        trackerComments: [
          {
            author: "pm",
            body: "请补充验收标准",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      attempt: null,
    });

    expect(prompt).toContain("## PMS 备注");
    expect(prompt).toContain("请补充验收标准");
  });

  it("fails on unknown variables in strict mode", async () => {
    await expect(
      renderPrompt({
        workflow: {
          promptTemplate: "{{ issue.missingField }}",
        },
        issue: ISSUE_FIXTURE,
        attempt: null,
      }),
    ).rejects.toMatchObject({
      name: "PromptTemplateError",
      code: ERROR_CODES.templateRenderError,
      kind: "template_render_error",
    } satisfies Partial<PromptTemplateError>);
  });

  it("fails on unknown filters in strict mode", async () => {
    await expect(
      renderPrompt({
        workflow: {
          promptTemplate: "{{ issue.title | no_such_filter }}",
        },
        issue: ISSUE_FIXTURE,
        attempt: null,
      }),
    ).rejects.toMatchObject({
      name: "PromptTemplateError",
      code: ERROR_CODES.templateRenderError,
      kind: "template_render_error",
    } satisfies Partial<PromptTemplateError>);
  });

  it("reports invalid template syntax as a parse error", async () => {
    await expect(
      renderPrompt({
        workflow: {
          promptTemplate: "{% if issue.identifier %}",
        },
        issue: ISSUE_FIXTURE,
        attempt: null,
      }),
    ).rejects.toMatchObject({
      name: "PromptTemplateError",
      code: ERROR_CODES.templateParseError,
      kind: "template_parse_error",
    } satisfies Partial<PromptTemplateError>);
  });

  it("appends V1.2 workflow dispatch with skill declare guidance only", async () => {
    const prompt = await buildTurnPrompt({
      workflow: {
        promptTemplate: "Base prompt for {{ issue.identifier }}",
      },
      issue: ISSUE_FIXTURE,
      attempt: 1,
      turnNumber: 2,
      maxTurns: 4,
      workflowDispatch: {
        changeRef: "abc-123",
        effectivePhaseId: "plan",
        skill: "symphony-plan",
        producesPath: "openspec/changes/abc-123/tasks.md",
      },
    });

    expect(prompt).toContain("继续处理工作项 ABC-123");
    expect(prompt).toContain("effective_phase: plan");
    expect(prompt).toContain("- skill: symphony-plan");
    expect(prompt).not.toContain("- skill: /symphony-plan");
    expect(prompt).not.toContain("handler:");
    expect(prompt).toContain("请使用已安装的 skill symphony-plan");
    expect(prompt).not.toContain("## Skill 说明");
    expect(prompt).not.toContain("Write tasks.md for the change.");
    expect(prompt).toContain("openspec/changes/abc-123/tasks.md");
    expect(prompt).toContain("## Symphony 策略 (V1.2)");
    expect(prompt).toContain("禁止 AskUserQuestion");
    expect(prompt).toContain("openspec/changes/abc-123/");
  });

  it("builds workflow dispatch without requiring SKILL.md payload", () => {
    const prompt = appendWorkflowDispatchSection("Base", {
      changeRef: "abc-123",
      effectivePhaseId: "plan",
      skill: "symphony-plan",
      producesPath: "openspec/changes/abc-123/tasks.md",
    });

    expect(prompt).toContain("- skill: symphony-plan");
    expect(prompt).toContain("请使用已安装的 skill symphony-plan");
    expect(prompt).not.toContain("## Skill 说明");
  });

  it("builds done-state workflow dispatch section with policy", () => {
    const prompt = appendWorkflowDispatchSection("Base", {
      changeRef: "abc-123",
      effectivePhaseId: "done",
      skill: "",
      producesPath: "",
    });

    expect(prompt).toContain("effective_phase: done");
    expect(prompt).toContain("全部工作流产物已完成");
    expect(prompt).toContain("## Symphony 策略 (V1.2)");
    expect(prompt).toContain("禁止跳步");
  });

  it("builds policy section with change ref path constraint", () => {
    const policy = buildSymphonyPolicySection("my-change");

    expect(policy).toContain("## Symphony 策略 (V1.2)");
    expect(policy).toContain("openspec/changes/my-change/");
    expect(policy).toContain("禁止未授权 git push");
  });
});
