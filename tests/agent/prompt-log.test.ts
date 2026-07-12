import { describe, expect, it } from "vitest";

import {
  buildAgentPromptLogPayload,
  DEFAULT_AGENT_PROMPT_LOG_MAX_BYTES,
} from "../../src/agent/prompt-log.js";
import type { Issue } from "../../src/domain/model.js";

const ISSUE: Issue = {
  id: "1",
  identifier: "BCS-547",
  title: "Test issue",
  description: "PMS 描述正文：实现退款同步",
  priority: null,
  state: "进行中",
  branchName: null,
  url: "http://pms.example/BCS-547",
  labels: [],
  blockedBy: [],
  createdAt: null,
  updatedAt: null,
  trackerComments: [
    { author: "pm", body: "请补充验收标准", createdAt: "2026-01-01T00:00:00Z" },
  ],
};

describe("buildAgentPromptLogPayload", () => {
  it("includes description diagnostics and full prompt when enabled", () => {
    const prompt = [
      "你正在处理 PMS 工作项 BCS-547：Test issue",
      "",
      "## 工单描述（PMS）",
      ISSUE.description,
      "",
      "## PMS 备注",
      "- pm: 请补充验收标准",
    ].join("\n");

    const payload = buildAgentPromptLogPayload({
      issue: ISSUE,
      turnNumber: 1,
      attempt: null,
      workspacePath: "/tmp/ws",
      prompt,
      includeFullPrompt: true,
      maxBytes: DEFAULT_AGENT_PROMPT_LOG_MAX_BYTES,
    });

    expect(payload.issue_description_present).toBe(true);
    expect(payload.issue_description_chars).toBeGreaterThan(0);
    expect(payload.issue_description_preview).toContain("退款同步");
    expect(payload.tracker_comments_count).toBe(1);
    expect(payload.prompt_has_description_section).toBe(true);
    expect(payload.prompt_has_comments_section).toBe(true);
    expect(payload.prompt_include_full).toBe(true);
    expect(String(payload.prompt)).toContain("## 工单描述（PMS）");
  });

  it("uses preview budget when full prompt logging is disabled", () => {
    const prompt = "x".repeat(10_000);
    const payload = buildAgentPromptLogPayload({
      issue: { ...ISSUE, description: null, trackerComments: [] },
      turnNumber: 2,
      attempt: 1,
      workspacePath: "/tmp/ws",
      prompt,
      includeFullPrompt: false,
    });

    expect(payload.issue_description_present).toBe(false);
    expect(payload.prompt_include_full).toBe(false);
    expect(String(payload.prompt).length).toBeLessThan(prompt.length);
  });
});
