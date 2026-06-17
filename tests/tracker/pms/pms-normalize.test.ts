import { describe, expect, it } from "vitest";

import {
  normalizePmsIssue,
  normalizePmsIssueState,
  resolvePmsBrowseBaseUrl,
  resolvePmsRestBaseUrl,
} from "../../../src/tracker/pms/pms-normalize.js";

describe("pms-normalize", () => {
  it("normalizes a Jira issue into the domain Issue model", () => {
    const issue = normalizePmsIssue(
      {
        id: "12345",
        key: "BASELINEREQ-34606",
        fields: {
          summary: "优化登录流程",
          description: "详细描述",
          status: { name: "待开发" },
          labels: [{ name: "Backend" }],
          priority: { name: "P1" },
          created: "2026-03-01T00:00:00.000Z",
          updated: "2026-03-02T00:00:00.000Z",
        },
      },
      "http://pms.example.com/browse",
    );

    expect(issue).toEqual({
      id: "12345",
      identifier: "BASELINEREQ-34606",
      title: "优化登录流程",
      description: "详细描述",
      priority: 1,
      state: "待开发",
      branchName: null,
      url: "http://pms.example.com/browse/BASELINEREQ-34606",
      labels: ["backend"],
      blockedBy: [],
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
    });
  });

  it("normalizes issue state snapshots", () => {
    expect(
      normalizePmsIssueState({
        id: "12345",
        key: "BASELINEREQ-34606",
        fields: {
          status: { name: "开发中" },
        },
      }),
    ).toEqual({
      id: "12345",
      identifier: "BASELINEREQ-34606",
      state: "开发中",
    });
  });

  it("resolves REST and browse base URLs", () => {
    expect(resolvePmsRestBaseUrl("http://pms.example.com")).toBe(
      "http://pms.example.com/rest/api/2",
    );
    expect(resolvePmsBrowseBaseUrl("http://pms.example.com")).toBe(
      "http://pms.example.com/browse",
    );
  });
});
