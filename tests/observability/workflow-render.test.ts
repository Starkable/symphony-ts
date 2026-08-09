import { describe, expect, it } from "vitest";

import { buildWorkflowManifest } from "../../src/artifact-store/manifest-builder.js";
import { parseWorkpad } from "../../src/artifact-store/workpad-parser.js";
import { renderWorkflowDashboardHtml, renderWorkflowDetailHtml } from "../../src/observability/workflow-render.js";
import type { RuntimeSnapshot } from "../../src/logging/runtime-snapshot.js";

const snapshot: RuntimeSnapshot = {
  generated_at: "2026-06-19T10:00:00.000Z",
  counts: { running: 0, retrying: 0 },
  running: [],
  retrying: [],
  codex_totals: {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    seconds_running: 0,
  },
  rate_limits: null,
};

describe("workflow-render V1.1", () => {
  it("renders Chinese dashboard labels without full-page reload script", () => {
    const html = renderWorkflowDashboardHtml({
      snapshot,
      workflows: [
        {
          issue_identifier: "BCS-1",
          title: "测试",
          current_phase: "clarify",
          phase_progress: { completed: 0, total: 6 },
          runtime: {
            status: "running",
            turn_count: 1,
            last_message: null,
            last_event: null,
            last_event_at: null,
          },
          started_at: "2026-06-19T08:00:00.000Z",
          updated_at: "2026-06-19T09:00:00.000Z",
          artifact_count: 0,
          priority: "P1",
          terminal_phase: null,
        },
      ],
      recentArchived: [],
      options: { liveUpdatesEnabled: true },
    });

    expect(html).toContain("工作流看板");
    expect(html).toContain("活跃工作流");
    expect(html).not.toContain("location.reload()");
    expect(html).toContain("data-wf-meta");
  });
});

describe("manifest synthetic reports", () => {
  it("includes synthetic review artifact when Notes has REVIEW_REPORT", () => {
    const workpad = parseWorkpad(`
### Meta
- Phase: proposal_review
### Notes
- REVIEW_REPORT: PASS
`);
    const manifest = buildWorkflowManifest({
      issueIdentifier: "BCS-1",
      workpad,
      openspecArtifacts: [],
      logArtifacts: [],
      proofArtifacts: [],
    });
    const review = manifest.phases.find(
      (phase) => phase.id === "proposal_review",
    );
    expect(
      review?.artifacts.some((entry) => entry.display_name === "评审报告"),
    ).toBe(true);
  });
});

describe("workflow-render V1.2", () => {
  it("renders failed phase badge and execute artifact rows", () => {
    const manifest = buildWorkflowManifest({
      issueIdentifier: "BCS-1",
      workpad: null,
      currentPhase: "proposal_review",
      workflow: {
        version: "1.2",
        changeRefStrategy: null,
        phases: [
          {
            id: "proposal_review",
            skill: "symphony-proposal-review",
            produces: "openspec/changes/{change_ref}/proposal_review.md",
            requiresPass: true,
          },
          {
            id: "execute",
            skill: "symphony-execute",
            produces: "openspec/changes/{change_ref}/execute.md",
            requiresPass: true,
          },
        ],
      },
      phaseCompletions: [
        {
          phaseId: "proposal_review",
          complete: false,
          failed: true,
          completion: { exists: true, status: "fail", complete: false },
        },
      ],
      openspecArtifacts: [
        {
          name: "execute.md",
          type: "MD",
          path: "openspec/changes/bcs-1/execute.md",
          size_bytes: 10,
          summary: null,
          updated_at: null,
        },
      ],
      logArtifacts: [],
      proofArtifacts: [],
    });

    const html = renderWorkflowDetailHtml(
      {
        issue_identifier: "BCS-1",
        issue_id: "1",
        change_ref: "bcs-1",
        mode: "v1.2-openspec",
        title: "测试",
        priority: "P1",
        terminal_phase: null,
        created_at: "2026-06-19T08:00:00.000Z",
        updated_at: "2026-06-19T09:00:00.000Z",
        manifest,
      },
      { liveUpdatesEnabled: false },
    );

    expect(html).toContain("未通过");
    expect(html).toContain("execute.md");
    expect(html).toContain("预览");
  });
});
