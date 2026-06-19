import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  parsePmsSmokeArgs,
  renderPmsSmokeUsage,
  runPmsSmoke,
} from "../../src/cli/pms-smoke.js";
import { resolveWorkflowConfig } from "../../src/config/config-resolver.js";
import { PMS_TRACKER_KIND } from "../../src/config/defaults.js";
import type { Issue } from "../../src/domain/model.js";

function createKeyPath(): string {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const keyDir = mkdtempSync(join(tmpdir(), "symphony-pms-smoke-"));
  const keyPath = join(keyDir, "test.key");
  writeFileSync(
    keyPath,
    privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
  );
  return keyPath;
}

describe("pms-smoke", () => {
  it("parses workflow path and options", () => {
    expect(parsePmsSmokeArgs(["./WORKFLOW.md", "--limit", "3"])).toEqual({
      workflowPath: "./WORKFLOW.md",
      limit: 3,
      skipAuth: false,
      help: false,
    });
  });

  it("rejects invalid limit values", () => {
    expect(() => parsePmsSmokeArgs(["--limit", "0"])).toThrow(
      "--limit must be a positive integer.",
    );
  });

  it("renders usage text", () => {
    expect(renderPmsSmokeUsage()).toContain("pms-smoke");
  });

  it("prints fetched issues from a mocked client", async () => {
    const keyPath = createKeyPath();
    const sampleIssue: Issue = {
      id: "12345",
      identifier: "BASELINEREQ-1",
      title: "Sample issue",
      description: "desc",
      priority: 2,
      state: "待开发",
      branchName: null,
      url: "http://pms.example.com/browse/BASELINEREQ-1",
      labels: ["backend"],
      blockedBy: [],
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-02T00:00:00.000Z",
    };

    const logs: string[] = [];
    const errors: string[] = [];
    const validateAuth = vi.fn(async () => undefined);
    const fetchCandidateIssues = vi.fn(async () => [sampleIssue]);

    const exitCode = await runPmsSmoke(["./WORKFLOW.md", "--limit", "1"], {
      env: {
        PMS_OAUTH_ACCESS_TOKEN: "token",
        PMS_OAUTH_ACCESS_TOKEN_SECRET: "secret",
        PMS_JIRA_KEY_PATH: keyPath,
      },
      io: {
        log: (message) => {
          logs.push(message);
        },
        error: (message) => {
          errors.push(message);
        },
      },
      loadWorkflowDefinition: vi.fn(async () => ({
        workflowPath: "/repo/WORKFLOW.md",
        promptTemplate: "Prompt",
        config: {
          tracker: {
            kind: PMS_TRACKER_KIND,
            endpoint: "http://pms.example.com",
            project_slug: "BASELINEREQ",
            active_states: ["待开发"],
            oauth: {
              access_token: "$PMS_OAUTH_ACCESS_TOKEN",
              access_token_secret: "$PMS_OAUTH_ACCESS_TOKEN_SECRET",
              rsa_private_key_path: "$PMS_JIRA_KEY_PATH",
            },
          },
        },
      })),
      resolveWorkflowConfig,
      createClient: () => ({
        validateAuth,
        fetchCandidateIssues,
      }),
    });

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(validateAuth).toHaveBeenCalledTimes(1);
    expect(fetchCandidateIssues).toHaveBeenCalledTimes(1);
    expect(
      logs.some((message) => message.includes('"identifier": "BASELINEREQ-1"')),
    ).toBe(true);
  });
});
