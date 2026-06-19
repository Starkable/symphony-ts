import { describe, expect, it } from "vitest";

import { parseWorkpad } from "../../src/artifact-store/workpad-parser.js";
import { buildWorkflowManifest } from "../../src/artifact-store/manifest-builder.js";
import { V1_BUSINESS_PHASES } from "../../src/artifact-store/types.js";

const SAMPLE_WORKPAD = `
## Agent Workpad

### Meta
- Phase: proposal_review
- ChangeRef: bcs-423
- Mode: v1-openspec

### Gate Log
- C0: pass @ 2026-06-19T08:00:00Z
- P1: pass @ 2026-06-19T09:00:00Z
- P2: pending @ —

### Notes
- REVIEW_REPORT: PASS
`;

describe("workpad parser", () => {
  it("parses phase, change ref, gates, and review report", () => {
    const parsed = parseWorkpad(SAMPLE_WORKPAD);
    expect(parsed.phase).toBe("proposal_review");
    expect(parsed.changeRef).toBe("bcs-423");
    expect(parsed.mode).toBe("v1-openspec");
    expect(parsed.gates.C0?.result).toBe("pass");
    expect(parsed.gates.P1?.result).toBe("pass");
    expect(parsed.reviewReport).toBe("PASS");
  });

  it("builds manifest with proposal_review phase", () => {
    const parsed = parseWorkpad(SAMPLE_WORKPAD);
    const manifest = buildWorkflowManifest({
      issueIdentifier: "BCS-423",
      workpad: parsed,
      openspecArtifacts: [],
      logArtifacts: [],
      proofArtifacts: [],
      now: new Date("2026-06-19T10:00:00.000Z"),
    });

    expect(manifest.current_phase).toBe("proposal_review");
    expect(manifest.phases.map((phase) => phase.id)).toEqual([
      ...V1_BUSINESS_PHASES,
    ]);
    const review = manifest.phases.find(
      (phase) => phase.id === "proposal_review",
    );
    expect(review?.status).toBe("in_progress");
    expect(
      manifest.phases.find((phase) => phase.id === "clarify")?.status,
    ).toBe("completed");
  });
});
