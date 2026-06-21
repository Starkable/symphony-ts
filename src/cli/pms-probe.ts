#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveWorkflowConfig } from "../config/config-resolver.js";
import { loadWorkflowDefinition } from "../config/workflow-loader.js";
import {
  getAuthenticatedFetch,
  normalizeRestBaseUrl,
  parsePmsProbeArgs,
  probeIssueComments,
  probeIssueTransitions,
  probeProjectStatuses,
  renderPmsProbeUsage,
  resolvePmsVerifyEnv,
  runBcsJqlVerifyCases,
  runWriteProbe,
  writePmsBcsVerifyReport,
  type CommentsProbeResult,
  type PmsBcsVerifyReport,
} from "./pms-bcs-verify.js";
import { PmsTrackerClient } from "../tracker/pms/pms-client.js";

export async function runPmsProbe(argv: readonly string[]): Promise<number> {
  const options = parsePmsProbeArgs(argv);
  if (options.help) {
    console.log(renderPmsProbeUsage());
    return 0;
  }

  const workflowPath = options.workflowPath ?? "examples/workflow-pms/WORKFLOW.md";
  const workflow = await loadWorkflowDefinition(workflowPath);
  const config = resolveWorkflowConfig(workflow, process.env);
  const client = PmsTrackerClient.fromConfig(config);
  const restBaseUrl = normalizeRestBaseUrl(config.tracker.endpoint);
  const fetchFn = getAuthenticatedFetch(client);

  const verifyEnv = resolvePmsVerifyEnv(
    process.env,
    config.tracker.projectSlug,
  );
  const probeIssueKey =
    options.probeIssueKey ?? verifyEnv.probeIssueKey ?? null;

  await client.validateAuth();
  console.log("[probe] OAuth OK");

  console.log(
    `[probe] project=${verifyEnv.project} assignee=${verifyEnv.assignee} probeIssueKey=${probeIssueKey ?? "(none)"}`,
  );

  const jqlCases = await runBcsJqlVerifyCases(
    fetchFn,
    restBaseUrl,
    verifyEnv.project,
    verifyEnv.assignee,
  );

  for (const testCase of jqlCases) {
    console.log(
      `[probe] ${testCase.name}: ${testCase.jqlValid ? "JQL_OK" : "JQL_FAIL"} status=${testCase.status} total=${testCase.total}${testCase.returnedStatusName ? ` returnedStatus=${testCase.returnedStatusName}` : ""}`,
    );
    if (!testCase.jqlValid) {
      console.log(`         jql=${testCase.jql}`);
      console.log(`         body=${testCase.errorBody}`);
    }
  }

  let projectStatuses: PmsBcsVerifyReport["projectStatuses"] = [];
  try {
    projectStatuses = await probeProjectStatuses(
      fetchFn,
      restBaseUrl,
      verifyEnv.project,
    );
    console.log(
      `[probe] projectStatuses: ${projectStatuses.length} issuetype entries`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[probe] projectStatuses: ERROR ${message}`);
  }

  let transitions: PmsBcsVerifyReport["transitions"] = [];
  let transitionsSkipped = probeIssueKey === null;
  let comments: CommentsProbeResult = {
    ok: false,
    skipped: true,
    status: 0,
    count: 0,
    sample: null,
    errorBody: "",
  };

  if (probeIssueKey !== null) {
    try {
      transitions = await probeIssueTransitions(
        fetchFn,
        restBaseUrl,
        probeIssueKey,
      );
      console.log(`[probe] transitions: ${transitions.length} available`);
      for (const transition of transitions) {
        console.log(
          `         id=${transition.id} name=${transition.name} to=${transition.toStatus}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[probe] transitions: ERROR ${message}`);
    }

    comments = await probeIssueComments(fetchFn, restBaseUrl, probeIssueKey);
    console.log(
      `[probe] comments: ${comments.skipped ? "skipped" : comments.ok ? "OK" : "FAIL"} count=${comments.count}`,
    );
  } else {
    console.log("[probe] transitions/comments skipped (no probe issue key)");
  }

  const writeProbe = await runWriteProbe({
    fetchFn,
    restBaseUrl,
    issueKey: probeIssueKey ?? "",
    allowWrite: options.allowWrite && probeIssueKey !== null,
    transitionTo: options.transitionTo,
    transitions,
  });

  if (writeProbe.skipped) {
    console.log("[probe] writeProbe skipped (use --allow-write with issue key)");
  } else {
    console.log(
      `[probe] writeProbe commentOk=${writeProbe.commentOk} transitionOk=${writeProbe.transitionOk}`,
    );
  }

  const report: PmsBcsVerifyReport = {
    generatedAt: new Date().toISOString(),
    project: verifyEnv.project,
    assignee: verifyEnv.assignee,
    probeIssueKey,
    jqlCases,
    projectStatuses,
    transitions,
    transitionsSkipped,
    comments,
    writeProbe,
  };

  const reportPath = writePmsBcsVerifyReport(report);
  const jqlPassCount = jqlCases.filter((entry) => entry.jqlValid).length;
  console.log(`[probe] ${jqlPassCount}/${jqlCases.length} JQL cases valid`);
  console.log(`[probe] report: ${reportPath}`);

  return jqlPassCount > 0 ? 0 : 1;
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
  process.exit(await runPmsProbe(process.argv.slice(2)));
}

if (shouldRunAsCli(import.meta.url, process.argv[1])) {
  void main();
}
