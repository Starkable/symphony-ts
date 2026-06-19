import { describe, expect, it } from "vitest";

import {
  evaluateArtifactCompletionFromContent,
  parseFrontMatterStatus,
} from "../../src/workflow/artifact-completion.js";

describe("artifact-completion", () => {
  it("parses front matter status pass/fail", () => {
    expect(
      parseFrontMatterStatus(`---
status: pass
---
# Report
`),
    ).toBe("pass");

    expect(
      parseFrontMatterStatus(`---
status: fail
---
# Report
`),
    ).toBe("fail");
  });

  it("treats file_exists phases as complete without front matter", () => {
    const result = evaluateArtifactCompletionFromContent({
      content: "# Proposal\n",
      requiresPass: false,
    });
    expect(result.complete).toBe(true);
  });

  it("requires status pass when requires_pass is true", () => {
    expect(
      evaluateArtifactCompletionFromContent({
        content: "# Report\n",
        requiresPass: true,
      }).complete,
    ).toBe(false);

    expect(
      evaluateArtifactCompletionFromContent({
        content: "---\nstatus: pass\n---\n# Report\n",
        requiresPass: true,
      }).complete,
    ).toBe(true);
  });
});
