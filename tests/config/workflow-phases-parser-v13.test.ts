import { describe, expect, it } from "vitest";

import { parseSymphonyWorkflowConfig } from "../../src/config/workflow-phases-parser.js";

describe("workflow-phases-parser v1.3", () => {
  it("parses v1.3 stages without produces field", () => {
    const parsed = parseSymphonyWorkflowConfig({
      version: "1.3",
      phases: [
        {
          id: "intake_review",
          skill: "stage-intake-review",
          domain: "analysis",
          gates: ["schema_valid"],
        },
      ],
    });

    expect(parsed?.version).toBe("1.3");
    expect(parsed?.phases[0]?.produces).toContain("review.json");
    expect(parsed?.phases[0]?.domain).toBe("analysis");
    expect(parsed?.phases[0]?.gates).toEqual(["schema_valid"]);
  });
});
