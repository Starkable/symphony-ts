import { describe, expect, it } from "vitest";

import {
  buildCandidateIssuesJql,
  buildIssueStatesByIdsJql,
  buildIssuesByStatesJql,
} from "../../../src/tracker/pms/pms-jql.js";

describe("pms-jql", () => {
  it("builds candidate issue JQL with active states", () => {
    expect(buildCandidateIssuesJql("BASELINEREQ", ["待开发", "开发中"])).toBe(
      'project = "BASELINEREQ" AND status in ("待开发", "开发中") ORDER BY created ASC',
    );
  });

  it("builds issues-by-states JQL", () => {
    expect(buildIssuesByStatesJql("BASELINEREQ", ["已关闭"])).toBe(
      'project = "BASELINEREQ" AND status in ("已关闭") ORDER BY created ASC',
    );
  });

  it("builds issue-states-by-ids JQL", () => {
    expect(buildIssueStatesByIdsJql(["12345", "67890"])).toBe(
      "id in (12345, 67890) ORDER BY created ASC",
    );
  });

  it("returns empty-id guard JQL when no numeric ids remain", () => {
    expect(buildIssueStatesByIdsJql(["", "abc"])).toBe("id in (0)");
  });
});
