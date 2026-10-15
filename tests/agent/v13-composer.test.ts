import { describe, expect, it } from "vitest";

import {
  V13_SECTION_TITLE,
  composeV13WorkflowSection,
} from "../../src/agent/prompts/v13-composer.js";

describe("v13-composer", () => {
  it("includes Chinese section title and artifact index without file bodies", () => {
    const section = composeV13WorkflowSection({
      changeRef: "bcs-99",
      issue: {
        id: "1",
        identifier: "BCS-99",
        title: "测试需求",
        description: "描述",
        priority: null,
        state: "Todo",
        branchName: null,
        url: null,
        labels: [],
        blockedBy: [],
        createdAt: null,
        updatedAt: null,
      },
      stage: {
        id: "discover",
        skill: "stage-discover",
        produces: "artifacts/{change_ref}/discover.json",
        requiresPass: false,
      },
      complete: false,
    });

    expect(section).toContain(V13_SECTION_TITLE);
    expect(section).toContain("前置产物索引");
    expect(section).toContain("review.json");
    expect(section).not.toContain("描述全文嵌入");
  });
});
