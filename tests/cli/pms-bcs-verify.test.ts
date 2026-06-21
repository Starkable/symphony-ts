import { describe, expect, it } from "vitest";

import {
  buildBcsAssigneeInProgressJql,
  buildBcsStatusJql,
  buildBcsVerifyCases,
  findTransitionMatch,
  parsePmsProbeArgs,
  renderPmsProbeUsage,
  resolvePmsVerifyEnv,
  type TransitionEntry,
} from "../../src/cli/pms-bcs-verify.js";

describe("pms-bcs-verify", () => {
  it("resolves verify env with defaults and overrides", () => {
    expect(resolvePmsVerifyEnv({}, null)).toEqual({
      project: "BCS",
      assignee: "shenxianghong_wb",
      probeIssueKey: null,
    });

    expect(
      resolvePmsVerifyEnv(
        {
          PMS_VERIFY_PROJECT: "CS",
          PMS_VERIFY_ASSIGNEE: "alice_wb",
          PMS_PROBE_ISSUE_KEY: "CS-100",
        },
        "BCS",
      ),
    ).toEqual({
      project: "CS",
      assignee: "alice_wb",
      probeIssueKey: "CS-100",
    });
  });

  it("builds BCS assignee in progress JQL", () => {
    expect(buildBcsAssigneeInProgressJql("BCS", "shenxianghong_wb")).toBe(
      'project = "BCS" AND status = "In Progress" AND assignee in ("shenxianghong_wb") ORDER BY updated ASC',
    );
  });

  it("builds BCS status JQL", () => {
    expect(buildBcsStatusJql("BCS", "已提测")).toBe(
      'project = "BCS" AND status = "已提测" ORDER BY updated DESC',
    );
  });

  it("builds four BCS verify cases", () => {
    const cases = buildBcsVerifyCases("BCS", "shenxianghong_wb");
    expect(cases.map((entry) => entry.name)).toEqual([
      "bcs-assignee-in-progress",
      "bcs-status-in-progress",
      "bcs-status-开发暂停",
      "bcs-status-已提测",
    ]);
  });

  it("parses probe CLI args", () => {
    expect(
      parsePmsProbeArgs([
        "./WORKFLOW.md",
        "--probe-issue-key",
        "BCS-1234",
        "--allow-write",
        "--transition-to",
        "开发暂停",
      ]),
    ).toEqual({
      workflowPath: "./WORKFLOW.md",
      probeIssueKey: "BCS-1234",
      allowWrite: true,
      transitionTo: "开发暂停",
      help: false,
    });
  });

  it("renders probe usage text", () => {
    expect(renderPmsProbeUsage()).toContain("pms-probe");
    expect(renderPmsProbeUsage()).toContain("PMS_VERIFY_PROJECT");
  });

  it("finds a unique transition match by target substring", () => {
    const transitions: TransitionEntry[] = [
      { id: "1", name: "Resolve", toStatus: "Resolved" },
      { id: "2", name: "Submit Test", toStatus: "已提测" },
    ];

    expect(findTransitionMatch(transitions, "已提测")).toEqual(transitions[1]);
    expect(findTransitionMatch(transitions, "ambiguous")).toBeNull();
  });
});
