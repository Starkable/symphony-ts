import { describe, expect, it } from "vitest";

import type { SymphonyWorkflowConfig } from "../../src/config/types.js";
import { buildWorkflowManifest } from "../../src/artifact-store/manifest-builder.js";
import { parseWorkpad } from "../../src/artifact-store/workpad-parser.js";
import { V1_BUSINESS_PHASES } from "../../src/artifact-store/types.js";

const openspecArtifacts = [
  {
    name: "proposal.md",
    type: "MD",
    path: "openspec/changes/bcs-423/proposal.md",
    size_bytes: 100,
    summary: null,
    updated_at: null,
  },
  {
    name: "design.md",
    type: "MD",
    path: "openspec/changes/bcs-423/design.md",
    size_bytes: 200,
    summary: null,
    updated_at: null,
  },
  {
    name: "tasks.md",
    type: "MD",
    path: "openspec/changes/bcs-423/tasks.md",
    size_bytes: 50,
    summary: null,
    updated_at: null,
  },
];

describe("manifest-builder V1.1", () => {
  it("orders phases as clarify → proposal_review → plan → execute → verify → archive", () => {
    const workpad = parseWorkpad(`
### Meta
- Phase: plan
- ChangeRef: bcs-423
### Gate Log
- C0: pass @ 2026-06-19T08:00:00Z
- P2: pass @ 2026-06-19T09:00:00Z
- P1: pending @ —
`);
    const manifest = buildWorkflowManifest({
      issueIdentifier: "BCS-423",
      workpad,
      openspecArtifacts,
      logArtifacts: [],
      proofArtifacts: [],
    });

    expect(manifest.phases.map((phase) => phase.id)).toEqual([
      ...V1_BUSINESS_PHASES,
    ]);
    expect(V1_BUSINESS_PHASES.indexOf("proposal_review")).toBeLessThan(
      V1_BUSINESS_PHASES.indexOf("plan"),
    );
  });

  it("maps primary artifacts per phase contract", () => {
    const workpad = parseWorkpad(`
### Meta
- Phase: verify
### Notes
- REVIEW_REPORT: PASS
- VERIFICATION_REPORT: PASS
### Gate Log
- C0: pass @ 2026-06-19T08:00:00Z
- P2: pass @ 2026-06-19T09:00:00Z
- P1: pass @ 2026-06-19T10:00:00Z
- V1: pending @ —
`);
    const manifest = buildWorkflowManifest({
      issueIdentifier: "BCS-423",
      workpad,
      openspecArtifacts,
      logArtifacts: [
        {
          name: "cursor-turn-1.log",
          type: "LOG",
          path: "logs/cursor-turn-1.log",
          size_bytes: 10,
          summary: null,
          updated_at: null,
        },
      ],
      proofArtifacts: [
        {
          name: "验证报告.md",
          type: "MD",
          path: "workflow/phases/verify/验证报告.md",
          size_bytes: 80,
          summary: null,
          updated_at: null,
        },
      ],
    });

    const clarify = manifest.phases.find((phase) => phase.id === "clarify");
    expect(clarify?.artifacts).toHaveLength(1);
    expect(clarify?.artifacts[0]?.display_name).toBe("需求提案");

    const plan = manifest.phases.find((phase) => phase.id === "plan");
    expect(plan?.artifacts.map((entry) => entry.name)).toEqual(["tasks.md"]);

    const execute = manifest.phases.find((phase) => phase.id === "execute");
    expect(execute?.artifacts).toHaveLength(0);

    const review = manifest.phases.find(
      (phase) => phase.id === "proposal_review",
    );
    expect(
      review?.artifacts.some((entry) => entry.path.includes("review")),
    ).toBe(true);

    const verify = manifest.phases.find((phase) => phase.id === "verify");
    expect(verify?.artifacts.some((entry) => entry.name.includes("验证"))).toBe(
      true,
    );
  });

  it("assigns V1.1 gates to phases", () => {
    const workpad = parseWorkpad(`
### Meta
- Phase: proposal_review
### Gate Log
- C0: pass @ 2026-06-19T08:00:00Z
- P2: pending @ —
`);
    const manifest = buildWorkflowManifest({
      issueIdentifier: "BCS-423",
      workpad,
      openspecArtifacts: [],
      logArtifacts: [],
      proofArtifacts: [],
    });

    expect(
      manifest.phases.find((phase) => phase.id === "clarify")?.gate?.id,
    ).toBe("C0");
    expect(
      manifest.phases.find((phase) => phase.id === "proposal_review")?.gate?.id,
    ).toBe("P2");
    expect(manifest.phases.find((phase) => phase.id === "plan")?.gate?.id).toBe(
      "P1",
    );
    expect(
      manifest.phases.find((phase) => phase.id === "verify")?.gate?.id,
    ).toBe("V1");
  });

  it("uses derived current_phase without workpad", () => {
    const manifest = buildWorkflowManifest({
      issueIdentifier: "BCS-423",
      workpad: null,
      currentPhase: "execute",
      openspecArtifacts: [
        {
          name: "proposal.md",
          type: "MD",
          path: "openspec/changes/bcs-423/proposal.md",
          size_bytes: 10,
          summary: null,
          updated_at: null,
        },
        {
          name: "proposal_review.md",
          type: "MD",
          path: "openspec/changes/bcs-423/proposal_review.md",
          size_bytes: 10,
          summary: null,
          updated_at: null,
        },
        {
          name: "tasks.md",
          type: "MD",
          path: "openspec/changes/bcs-423/tasks.md",
          size_bytes: 10,
          summary: null,
          updated_at: null,
        },
      ],
      logArtifacts: [],
      proofArtifacts: [],
    });

    expect(manifest.current_phase).toBe("execute");
    expect(
      manifest.phases.find((phase) => phase.id === "execute")?.status,
    ).toBe("in_progress");
  });
});

const V12_WORKFLOW: SymphonyWorkflowConfig = {
  version: "1.2",
  changeRefStrategy: null,
  phases: [
    {
      id: "clarify",
      skill: "openspec-new-change",
      produces: "openspec/changes/{change_ref}/proposal.md",
      requiresPass: false,
    },
    {
      id: "proposal_review",
      skill: "openspec-proposal-review",
      produces: "openspec/changes/{change_ref}/proposal_review.md",
      requiresPass: true,
    },
  ],
};

describe("manifest-builder V1.2", () => {
  it("marks requires_pass fail as phase failed", () => {
    const manifest = buildWorkflowManifest({
      issueIdentifier: "BCS-423",
      workpad: null,
      currentPhase: "proposal_review",
      workflow: V12_WORKFLOW,
      phaseCompletions: [
        {
          phaseId: "clarify",
          complete: true,
          failed: false,
          completion: { exists: true, status: null, complete: true },
        },
        {
          phaseId: "proposal_review",
          complete: false,
          failed: true,
          completion: { exists: true, status: "fail", complete: false },
        },
      ],
      openspecArtifacts: [
        {
          name: "proposal.md",
          type: "MD",
          path: "openspec/changes/bcs-423/proposal.md",
          size_bytes: 10,
          summary: null,
          updated_at: null,
        },
        {
          name: "proposal_review.md",
          type: "MD",
          path: "openspec/changes/bcs-423/proposal_review.md",
          size_bytes: 10,
          summary: null,
          updated_at: null,
        },
      ],
      logArtifacts: [],
      proofArtifacts: [],
    });

    expect(
      manifest.phases.find((phase) => phase.id === "proposal_review")?.status,
    ).toBe("failed");
  });

  it("maps custom produces basename from workflow config", () => {
    const manifest = buildWorkflowManifest({
      issueIdentifier: "BCS-423",
      workpad: null,
      currentPhase: "clarify",
      workflow: {
        version: "1.2",
        changeRefStrategy: null,
        phases: [
          {
            id: "clarify",
            skill: "openspec-new-change",
            produces: "openspec/changes/{change_ref}/custom-proposal.md",
            requiresPass: false,
          },
        ],
      },
      phaseCompletions: [
        {
          phaseId: "clarify",
          complete: false,
          failed: false,
          completion: { exists: false, status: null, complete: false },
        },
      ],
      openspecArtifacts: [
        {
          name: "custom-proposal.md",
          type: "MD",
          path: "openspec/changes/bcs-423/custom-proposal.md",
          size_bytes: 10,
          summary: null,
          updated_at: null,
        },
      ],
      logArtifacts: [],
      proofArtifacts: [],
    });

    expect(manifest.phases.find((phase) => phase.id === "clarify")?.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "custom-proposal.md" }),
      ]),
    );
  });
});
