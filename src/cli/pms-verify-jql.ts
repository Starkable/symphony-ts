#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveWorkflowConfig } from "../config/config-resolver.js";
import { loadWorkflowDefinition } from "../config/workflow-loader.js";
import { buildCandidateIssuesJql } from "../tracker/pms/pms-jql.js";
import { PmsTrackerClient } from "../tracker/pms/pms-client.js";

interface VerifyCase {
  name: string;
  jql: string;
  fields: string[] | string;
}

async function runSearch(
  client: PmsTrackerClient,
  restBaseUrl: string,
  testCase: VerifyCase,
): Promise<{ ok: boolean; status: number; total: number; errorBody: string }> {
  const url = `${restBaseUrl}/search`;
  const body: Record<string, unknown> = {
    jql: testCase.jql,
    startAt: 0,
    maxResults: 5,
    fields: testCase.fields,
  };

  const response = await (
    client as unknown as {
      authenticatedFetch: (
        method: string,
        targetUrl: string,
        jsonBody?: Record<string, unknown>,
      ) => Promise<Response>;
    }
  ).authenticatedFetch("POST", url, body);

  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      total: 0,
      errorBody: text.slice(0, 800),
    };
  }

  let total = 0;
  try {
    const parsed = JSON.parse(text) as { total?: number; issues?: unknown[] };
    total = parsed.total ?? parsed.issues?.length ?? 0;
  } catch {
    total = 0;
  }

  return { ok: true, status: response.status, total, errorBody: "" };
}

export async function runPmsJqlVerify(
  argv: readonly string[],
): Promise<number> {
  const workflowPath = argv[0] ?? "examples/workflow-pms/WORKFLOW.md";
  const workflow = await loadWorkflowDefinition(workflowPath);
  const config = resolveWorkflowConfig(workflow, process.env);
  const client = PmsTrackerClient.fromConfig(config);
  const restBaseUrl = config.tracker.endpoint.replace(/\/$/, "");
  const normalizedRestBase = restBaseUrl.endsWith("/rest/api/2")
    ? restBaseUrl
    : `${restBaseUrl}/rest/api/2`;

  await client.validateAuth();
  console.log("[verify] OAuth OK");

  const project = config.tracker.projectSlug?.trim() || "BASELINEREQ";
  const activeStates = config.tracker.activeStates;

  const cases: VerifyCase[] = [
    {
      name: "project-only-array-fields",
      jql: `project = "${project}" ORDER BY updated DESC`,
      fields: ["summary", "status", "issuetype"],
    },
    {
      name: "symphony-config-jql",
      jql: buildCandidateIssuesJql(project, activeStates, {
        issueTypes: config.tracker.issueTypes,
        excludeDraftStatus: config.tracker.excludeDraftStatus,
      }),
      fields: ["summary", "status", "issuetype"],
    },
    {
      name: "symphony-candidate-jql-string-fields",
      jql: buildCandidateIssuesJql(project, activeStates),
      fields: "summary,status",
    },
    {
      name: "status-category-open",
      jql: `project = "${project}" AND statusCategory != Done ORDER BY updated DESC`,
      fields: ["summary", "status"],
    },
    {
      name: "skill-product-req-default",
      jql: `project = "${project}" AND issuetype in ("产品需求") AND statusCategory != Done AND status not in ("草稿", "审核中") ORDER BY updated DESC`,
      fields: ["summary", "status"],
    },
    {
      name: "baselinereq-planned",
      jql: 'project = "BASELINEREQ" AND status in ("已计划") ORDER BY updated DESC',
      fields: ["summary", "status"],
    },
    {
      name: "cs-open-in-progress",
      jql: `project = "${project}" AND status in ("Open", "In Progress") ORDER BY updated DESC`,
      fields: ["summary", "status", "issuetype"],
    },
    {
      name: "dev-todo-states",
      jql: `project = "${project}" AND status in ("待开发", "开发中") ORDER BY updated DESC`,
      fields: ["summary", "status"],
    },
  ];

  const results: Array<
    VerifyCase & {
      ok: boolean;
      status: number;
      total: number;
      errorBody: string;
    }
  > = [];
  let passCount = 0;

  for (const testCase of cases) {
    try {
      const result = await runSearch(client, normalizedRestBase, testCase);
      results.push({ ...testCase, ...result });
      if (result.ok) {
        passCount += 1;
      }
      console.log(
        `[verify] ${testCase.name}: ${result.ok ? "OK" : "FAIL"} status=${result.status} total=${result.total}`,
      );
      if (!result.ok) {
        console.log(`         jql=${testCase.jql}`);
        console.log(`         body=${result.errorBody}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        ...testCase,
        ok: false,
        status: 0,
        total: 0,
        errorBody: message,
      });
      console.log(`[verify] ${testCase.name}: ERROR ${message}`);
    }
  }

  mkdirSync(resolve(process.cwd(), "tmp"), { recursive: true });
  const reportPath = resolve(process.cwd(), "tmp/pms-jql-verify-report.json");
  writeFileSync(reportPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(`[verify] ${passCount}/${cases.length} cases passed`);
  console.log(`[verify] report: ${reportPath}`);

  return passCount > 0 ? 0 : 1;
}

function shouldRunAsCli(
  importMetaUrl: string,
  entryPath: string | undefined,
): boolean {
  if (!entryPath) {
    return false;
  }

  try {
    return (
      realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(entryPath)
    );
  } catch {
    return importMetaUrl === pathToFileURL(entryPath).href;
  }
}

async function main(): Promise<void> {
  process.exit(await runPmsJqlVerify(process.argv.slice(2)));
}

if (shouldRunAsCli(import.meta.url, process.argv[1])) {
  void main();
}
