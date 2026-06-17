import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createIssueTracker } from "../../src/tracker/tracker-factory.js";
import type { ResolvedWorkflowConfig } from "../../src/config/types.js";
import { LinearTrackerClient } from "../../src/tracker/linear-client.js";
import { PmsTrackerClient } from "../../src/tracker/pms/pms-client.js";
import { TrackerError } from "../../src/tracker/errors.js";

function baseConfig(
  trackerOverrides: Partial<ResolvedWorkflowConfig["tracker"]>,
): ResolvedWorkflowConfig {
  return {
    workflowPath: "/tmp/WORKFLOW.md",
    promptTemplate: "Prompt",
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      projectSlug: "ENG",
      activeStates: ["Todo"],
      terminalStates: ["Done"],
      oauth: null,
      ...trackerOverrides,
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
      harness: "codex",
      maxConcurrentAgents: 1,
      maxTurns: 1,
      maxRetryBackoffMs: 300_000,
      maxConcurrentAgentsByState: {},
    },
    codex: {
      command: "codex app-server",
      approvalPolicy: null,
      threadSandbox: null,
      turnSandboxPolicy: null,
      turnTimeoutMs: 3_600_000,
      readTimeoutMs: 5_000,
      stallTimeoutMs: 300_000,
    },
    harnesses: {
      codex: {
        command: "codex app-server",
        approvalPolicy: null,
        threadSandbox: null,
        turnSandboxPolicy: null,
        turnTimeoutMs: 3_600_000,
        readTimeoutMs: 5_000,
        stallTimeoutMs: 300_000,
      },
      cursor: {
        command: "agent",
        mode: "force",
        model: null,
        sandbox: null,
        reusePolicy: "per_issue",
        turnTimeoutMs: 3_600_000,
        turnLogEnabled: true,
        turnLogMaxBytes: 32_768,
        turnLogIncludePrompt: false,
        turnLogWorkspaceArtifact: true,
      },
    },
    server: { port: null },
    observability: {
      dashboardEnabled: true,
      refreshMs: 1_000,
      renderIntervalMs: 16,
    },
  };
}

describe("tracker-factory", () => {
  it("creates a Linear tracker for kind linear", () => {
    const tracker = createIssueTracker(baseConfig({ kind: "linear" }));
    expect(tracker).toBeInstanceOf(LinearTrackerClient);
  });

  it("creates a PMS tracker for kind pms", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const keyDir = mkdtempSync(join(tmpdir(), "symphony-pms-key-"));
    const keyPath = join(keyDir, "test.key");
    writeFileSync(
      keyPath,
      privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
      "utf8",
    );

    const tracker = createIssueTracker(
      baseConfig({
        kind: "pms",
        endpoint: "http://pms.example.com",
        apiKey: null,
        oauth: {
          accessToken: "token",
          accessTokenSecret: "secret",
          rsaPrivateKeyPath: keyPath,
          consumerKey: "qa-monitor",
          validateOnDispatch: true,
        },
      }),
    );

    expect(tracker).toBeInstanceOf(PmsTrackerClient);
  });

  it("throws for unsupported tracker kinds", () => {
    expect(() =>
      createIssueTracker(baseConfig({ kind: "jira" })),
    ).toThrowError(TrackerError);
  });
});
