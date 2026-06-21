import { describe, expect, it } from "vitest";

import {
  PMS_STATE_ALIASES,
  issueStateMatchesStates,
} from "../../../src/tracker/pms/pms-status-alias.js";

describe("pms-status-alias", () => {
  it("matches In Progress config against 进行中 issue state", () => {
    expect(
      issueStateMatchesStates("进行中", ["In Progress"], PMS_STATE_ALIASES),
    ).toBe(true);
  });

  it("does not match unrelated states", () => {
    expect(
      issueStateMatchesStates("开发暂停", ["In Progress"], PMS_STATE_ALIASES),
    ).toBe(false);
  });

  it("matches exact terminal state 已提测", () => {
    expect(
      issueStateMatchesStates("已提测", ["已提测"], PMS_STATE_ALIASES),
    ).toBe(true);
  });
});
