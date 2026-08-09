import { describe, expect, it } from "vitest";

import { validateSkillNameFormat } from "../../src/workflow/validate-workspace-skills.js";

describe("validate-workspace-skills", () => {
  it("accepts canonical skill names", () => {
    expect(validateSkillNameFormat("symphony-clarify")).toBeNull();
  });

  it("rejects shell-like skill values", () => {
    expect(validateSkillNameFormat("git push origin")).not.toBeNull();
  });

  it("rejects empty skill values", () => {
    expect(validateSkillNameFormat("   ")).not.toBeNull();
  });

  it("rejects invalid characters", () => {
    expect(validateSkillNameFormat("bad skill!")).not.toBeNull();
  });
});
