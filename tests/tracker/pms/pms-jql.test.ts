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

  it("builds candidate issue JQL with issuetype and draft exclusion", () => {
    expect(
      buildCandidateIssuesJql("CS", ["Open", "In Progress"], {
        issueTypes: ["产品需求"],
        excludeDraftStatus: true,
      }),
    ).toBe(
      'project = "CS" AND issuetype in ("产品需求") AND status not in ("草稿", "审核中") AND status in ("Open", "In Progress") ORDER BY created ASC',
    );
  });

  it("builds open candidate JQL when active states are empty", () => {
    expect(
      buildCandidateIssuesJql("CS", [], {
        issueTypes: ["产品需求"],
        excludeDraftStatus: true,
      }),
    ).toBe(
      'project = "CS" AND issuetype in ("产品需求") AND status not in ("草稿", "审核中") AND statusCategory != Done ORDER BY created ASC',
    );
  });

  it("builds issues-by-states JQL", () => {
    expect(buildIssuesByStatesJql("CS", ["Done", "Closed"])).toBe(
      'project = "CS" AND status in ("Done", "Closed") ORDER BY created ASC',
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
