import { describe, expect, it } from "vitest";

import {
  expandChangeRefPath,
  resolveChangeRef,
} from "../../src/workflow/change-ref-path.js";

describe("change-ref-path", () => {
  it("converts issue identifier to kebab-case change_ref", () => {
    expect(resolveChangeRef("BCS-423")).toBe("bcs-423");
    expect(resolveChangeRef("  ABC 123 ")).toBe("abc-123");
  });

  it("expands {change_ref} placeholders in produces paths", () => {
    expect(
      expandChangeRefPath(
        "openspec/changes/{change_ref}/proposal.md",
        "bcs-423",
      ),
    ).toBe("openspec/changes/bcs-423/proposal.md");
  });
});
