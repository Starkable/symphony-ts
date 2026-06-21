import { describe, expect, it } from "vitest";

import {
  WorkflowPhasesParseError,
  parseSymphonyWorkflowConfig,
  validateSymphonyWorkflowConfig,
} from "../../src/config/workflow-phases-parser.js";
import { validateDispatchConfig } from "../../src/config/config-resolver.js";
import { withHarnessConfig } from "../helpers/workflow-config.js";

describe("workflow-phases-parser", () => {
  it("returns null when workflow section is absent", () => {
    expect(parseSymphonyWorkflowConfig(undefined)).toBeNull();
    expect(parseSymphonyWorkflowConfig({ version: "1.2" })).toBeNull();
  });

  it("parses a valid workflow.phases table", () => {
    const parsed = parseSymphonyWorkflowConfig({
      version: "1.2",
      change_ref: "kebab_case_issue_id",
      phases: [
        {
          id: "clarify",
          handler: "openspec-new-change",
          produces: "openspec/changes/{change_ref}/proposal.md",
        },
        {
          id: "proposal_review",
          handler: "openspec-proposal-review",
          produces: "openspec/changes/{change_ref}/proposal_review.md",
          requires_pass: true,
        },
      ],
    });

    expect(parsed?.version).toBe("1.2");
    expect(parsed?.phases).toHaveLength(2);
    expect(parsed?.phases[1]?.requiresPass).toBe(true);
  });

  it("rejects duplicate phase ids and empty handler/produces", () => {
    expect(() =>
      parseSymphonyWorkflowConfig({
        phases: [
          { id: "clarify", handler: "a", produces: "p1" },
          { id: "clarify", handler: "b", produces: "p2" },
        ],
      }),
    ).toThrow(WorkflowPhasesParseError);

    expect(() =>
      parseSymphonyWorkflowConfig({
        phases: [{ id: "clarify", handler: "", produces: "p1" }],
      }),
    ).toThrow(WorkflowPhasesParseError);
  });

  it("fails dispatch validation for invalid workflow config", () => {
    const config = withHarnessConfig({
      workflowPath: "/repo/WORKFLOW.md",
      promptTemplate: "Prompt",
      tracker: {
        kind: "linear",
        endpoint: "https://api.linear.app/graphql",
        apiKey: "token",
        projectSlug: "project",
        activeStates: ["Todo"],
        terminalStates: ["Done"],
        issueTypes: [],
        excludeDraftStatus: false,
        assignees: [],
        stateAliases: {},
        oauth: null,
      },
      polling: { intervalMs: 30_000 },
      workspace: { root: "/tmp/workspaces" },
      hooks: {
        afterCreate: null,
        beforeRun: null,
        afterRun: null,
        beforeRemove: null,
        timeoutMs: 30_000,
      },
      agent: {
        maxConcurrentAgents: 1,
        maxTurns: 3,
        maxRetryBackoffMs: 30_000,
        maxConcurrentAgentsByState: {},
      },
      codex: {
        command: "codex-app-server",
        approvalPolicy: null,
        threadSandbox: null,
        turnSandboxPolicy: null,
        turnTimeoutMs: 120_000,
        readTimeoutMs: 5_000,
        stallTimeoutMs: 60_000,
      },
      server: { port: null },
      observability: {
        dashboardEnabled: false,
        refreshMs: 1_000,
        renderIntervalMs: 16,
      },
      artifactStore: {
        enabled: false,
        root: null,
        hydrateOnCreate: false,
      },
      workflow: {
        version: "1.2",
        changeRefStrategy: null,
        phases: [
          {
            id: "clarify",
            handler: "openspec-new-change",
            produces: "openspec/changes/{change_ref}/proposal.md",
            requiresPass: false,
          },
        ],
      },
    });

    expect(validateDispatchConfig(config).ok).toBe(true);
    expect(
      validateSymphonyWorkflowConfig({
        version: "1.2",
        changeRefStrategy: null,
        phases: [
          {
            id: "",
            handler: "openspec-new-change",
            produces: "x",
            requiresPass: false,
          },
        ],
      }),
    ).not.toBeNull();
  });
});
