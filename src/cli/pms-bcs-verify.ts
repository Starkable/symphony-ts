import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { PmsTrackerClient } from "../tracker/pms/pms-client.js";
import {
  findTransitionMatch,
  type PmsTransitionEntry,
} from "../tracker/pms/pms-transition.js";

export type TransitionEntry = PmsTransitionEntry;
export { findTransitionMatch };

export const DEFAULT_PMS_VERIFY_PROJECT = "BCS";
export const DEFAULT_PMS_VERIFY_ASSIGNEE = "shenxianghong_wb";
export const PMS_VERIFY_PROJECT_ENV = "PMS_VERIFY_PROJECT";
export const PMS_VERIFY_ASSIGNEE_ENV = "PMS_VERIFY_ASSIGNEE";
export const PMS_PROBE_ISSUE_KEY_ENV = "PMS_PROBE_ISSUE_KEY";
export const PMS_BCS_VERIFY_REPORT_FILENAME = "pms-bcs-verify-report.json";

export interface PmsVerifyEnvConfig {
  project: string;
  assignee: string;
  probeIssueKey: string | null;
}

export interface PmsBcsVerifyCase {
  name: string;
  jql: string;
  fields: string[];
  jqlStatusName?: string;
}

export interface PmsBcsJqlCaseResult extends PmsBcsVerifyCase {
  jqlValid: boolean;
  hasMatchingIssues: boolean;
  ok: boolean;
  status: number;
  total: number;
  errorBody: string;
  returnedStatusName: string | null;
}

export interface ProjectStatusEntry {
  issueType: string;
  statuses: string[];
}

export interface CommentsProbeResult {
  ok: boolean;
  skipped: boolean;
  status: number;
  count: number;
  sample: string | null;
  errorBody: string;
}

export interface WriteProbeResult {
  skipped: boolean;
  commentOk: boolean | null;
  commentStatus: number | null;
  commentErrorBody: string;
  transitionOk: boolean | null;
  transitionStatus: number | null;
  transitionErrorBody: string;
  transitionId: string | null;
  transitionName: string | null;
}

export interface PmsBcsVerifyReport {
  generatedAt: string;
  project: string;
  assignee: string;
  probeIssueKey: string | null;
  jqlCases: PmsBcsJqlCaseResult[];
  projectStatuses: ProjectStatusEntry[];
  transitions: TransitionEntry[];
  transitionsSkipped: boolean;
  comments: CommentsProbeResult;
  writeProbe: WriteProbeResult;
}

export interface PmsProbeCliOptions {
  workflowPath: string | null;
  probeIssueKey: string | null;
  allowWrite: boolean;
  transitionTo: string | null;
  help: boolean;
}

export type AuthenticatedPmsFetch = (
  method: string,
  targetUrl: string,
  jsonBody?: Record<string, unknown>,
) => Promise<Response>;

function quoteJqlString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function resolvePmsVerifyEnv(
  env: NodeJS.ProcessEnv,
  workflowProject?: string | null,
): PmsVerifyEnvConfig {
  const projectFromEnv = env[PMS_VERIFY_PROJECT_ENV]?.trim();
  const projectFromWorkflow = workflowProject?.trim();
  const project =
    projectFromEnv !== undefined && projectFromEnv !== ""
      ? projectFromEnv
      : projectFromWorkflow !== undefined && projectFromWorkflow !== ""
        ? projectFromWorkflow
        : DEFAULT_PMS_VERIFY_PROJECT;

  const assigneeFromEnv = env[PMS_VERIFY_ASSIGNEE_ENV]?.trim();
  const assignee =
    assigneeFromEnv !== undefined && assigneeFromEnv !== ""
      ? assigneeFromEnv
      : DEFAULT_PMS_VERIFY_ASSIGNEE;

  const probeFromEnv = env[PMS_PROBE_ISSUE_KEY_ENV]?.trim();
  const probeIssueKey =
    probeFromEnv !== undefined && probeFromEnv !== "" ? probeFromEnv : null;

  return { project, assignee, probeIssueKey };
}

export function buildBcsAssigneeInProgressJql(
  project: string,
  assignee: string,
): string {
  return `project = ${quoteJqlString(project)} AND status = ${quoteJqlString("In Progress")} AND assignee in (${quoteJqlString(assignee)}) ORDER BY updated ASC`;
}

export function buildBcsStatusJql(project: string, statusName: string): string {
  return `project = ${quoteJqlString(project)} AND status = ${quoteJqlString(statusName)} ORDER BY updated DESC`;
}

export function buildBcsVerifyCases(
  project: string,
  assignee: string,
): PmsBcsVerifyCase[] {
  const statusFields = ["summary", "status", "issuetype"];
  return [
    {
      name: "bcs-assignee-in-progress",
      jql: buildBcsAssigneeInProgressJql(project, assignee),
      fields: statusFields,
      jqlStatusName: "In Progress",
    },
    {
      name: "bcs-status-in-progress",
      jql: buildBcsStatusJql(project, "In Progress"),
      fields: statusFields,
      jqlStatusName: "In Progress",
    },
    {
      name: "bcs-status-开发暂停",
      jql: buildBcsStatusJql(project, "开发暂停"),
      fields: statusFields,
      jqlStatusName: "开发暂停",
    },
    {
      name: "bcs-status-已提测",
      jql: buildBcsStatusJql(project, "已提测"),
      fields: statusFields,
      jqlStatusName: "已提测",
    },
  ];
}

export function parsePmsProbeArgs(argv: readonly string[]): PmsProbeCliOptions {
  let workflowPath: string | null = null;
  let probeIssueKey: string | null = null;
  let allowWrite = false;
  let transitionTo: string | null = null;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }

    if (token === "--allow-write") {
      allowWrite = true;
      continue;
    }

    if (token === "--probe-issue-key") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error("--probe-issue-key requires an issue key argument.");
      }
      probeIssueKey = value.trim();
      index += 1;
      continue;
    }

    if (token === "--transition-to") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error("--transition-to requires a status name argument.");
      }
      transitionTo = value.trim();
      index += 1;
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }

    if (workflowPath !== null) {
      throw new Error(
        "Accepts at most one positional WORKFLOW.md path argument.",
      );
    }

    workflowPath = token;
  }

  return {
    workflowPath,
    probeIssueKey,
    allowWrite,
    transitionTo,
    help,
  };
}

export function renderPmsProbeUsage(): string {
  return [
    "Usage: pms-probe [WORKFLOW.md] [options]",
    "",
    "Run BCS PMS integration probes: JQL matrix, project statuses, issue transitions/comments.",
    "",
    "Environment:",
    `  ${PMS_VERIFY_PROJECT_ENV}     Project key (default: ${DEFAULT_PMS_VERIFY_PROJECT})`,
    `  ${PMS_VERIFY_ASSIGNEE_ENV}  Assignee login for JQL (default: ${DEFAULT_PMS_VERIFY_ASSIGNEE})`,
    `  ${PMS_PROBE_ISSUE_KEY_ENV}   Issue key for transitions/comments (optional)`,
    "",
    "Options:",
    "  --probe-issue-key <KEY>  Issue key for transition/comment probes",
    "  --allow-write            Enable optional comment/transition write probes",
    "  --transition-to <name>   Target status name (requires --allow-write)",
    "  -h, --help               Show this help message",
    "",
    "Report: tmp/pms-bcs-verify-report.json",
  ].join("\n");
}

export function getAuthenticatedFetch(
  client: PmsTrackerClient,
): AuthenticatedPmsFetch {
  return (
    client as unknown as {
      authenticatedFetch: AuthenticatedPmsFetch;
    }
  ).authenticatedFetch.bind(client);
}

function readStatusNameFromIssue(issue: unknown): string | null {
  if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
    return null;
  }
  const fields = (issue as { fields?: unknown }).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return null;
  }
  const status = (fields as { status?: { name?: unknown } }).status;
  const name = status?.name;
  return typeof name === "string" && name.trim() !== "" ? name : null;
}

export async function runBcsJqlVerifyCase(
  fetchFn: AuthenticatedPmsFetch,
  restBaseUrl: string,
  testCase: PmsBcsVerifyCase,
): Promise<PmsBcsJqlCaseResult> {
  const url = `${restBaseUrl}/search`;
  const body: Record<string, unknown> = {
    jql: testCase.jql,
    startAt: 0,
    maxResults: 5,
    fields: testCase.fields,
  };

  try {
    const response = await fetchFn("POST", url, body);
    const text = await response.text();
    const jqlValid = response.ok;

    if (!jqlValid) {
      return {
        ...testCase,
        jqlValid: false,
        hasMatchingIssues: false,
        ok: false,
        status: response.status,
        total: 0,
        errorBody: text.slice(0, 800),
        returnedStatusName: null,
      };
    }

    let total = 0;
    let returnedStatusName: string | null = null;
    try {
      const parsed = JSON.parse(text) as {
        total?: number;
        issues?: unknown[];
      };
      total = parsed.total ?? parsed.issues?.length ?? 0;
      const firstIssue = parsed.issues?.[0];
      returnedStatusName = readStatusNameFromIssue(firstIssue);
    } catch {
      total = 0;
    }

    return {
      ...testCase,
      jqlValid: true,
      hasMatchingIssues: total > 0,
      ok: true,
      status: response.status,
      total,
      errorBody: "",
      returnedStatusName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...testCase,
      jqlValid: false,
      hasMatchingIssues: false,
      ok: false,
      status: 0,
      total: 0,
      errorBody: message,
      returnedStatusName: null,
    };
  }
}

export async function runBcsJqlVerifyCases(
  fetchFn: AuthenticatedPmsFetch,
  restBaseUrl: string,
  project: string,
  assignee: string,
): Promise<PmsBcsJqlCaseResult[]> {
  const cases = buildBcsVerifyCases(project, assignee);
  const results: PmsBcsJqlCaseResult[] = [];
  for (const testCase of cases) {
    results.push(await runBcsJqlVerifyCase(fetchFn, restBaseUrl, testCase));
  }
  return results;
}

export async function probeProjectStatuses(
  fetchFn: AuthenticatedPmsFetch,
  restBaseUrl: string,
  projectKey: string,
): Promise<ProjectStatusEntry[]> {
  const url = `${restBaseUrl}/project/${encodeURIComponent(projectKey)}/statuses`;
  const response = await fetchFn("GET", url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Project statuses request failed with HTTP ${response.status}: ${text.slice(0, 400)}`,
    );
  }

  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const record = entry as {
        name?: unknown;
        statuses?: unknown;
      };
      const issueType =
        typeof record.name === "string" ? record.name : "unknown";
      const statusesRaw = record.statuses;
      if (!Array.isArray(statusesRaw)) {
        return { issueType, statuses: [] as string[] };
      }
      const statuses = statusesRaw
        .map((status) => {
          if (!status || typeof status !== "object") {
            return null;
          }
          const name = (status as { name?: unknown }).name;
          return typeof name === "string" ? name : null;
        })
        .filter((name): name is string => name !== null);
      return { issueType, statuses };
    })
    .filter((entry): entry is ProjectStatusEntry => entry !== null);
}

export async function probeIssueTransitions(
  fetchFn: AuthenticatedPmsFetch,
  restBaseUrl: string,
  issueKey: string,
): Promise<TransitionEntry[]> {
  const url = `${restBaseUrl}/issue/${encodeURIComponent(issueKey)}/transitions`;
  const response = await fetchFn("GET", url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Transitions request failed with HTTP ${response.status}: ${text.slice(0, 400)}`,
    );
  }

  const parsed = JSON.parse(text) as { transitions?: unknown };
  const transitions = parsed.transitions;
  if (!Array.isArray(transitions)) {
    return [];
  }

  return transitions
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as {
        id?: unknown;
        name?: unknown;
        to?: { name?: unknown };
      };
      const id =
        typeof record.id === "string"
          ? record.id
          : typeof record.id === "number"
            ? String(record.id)
            : null;
      const name = typeof record.name === "string" ? record.name : null;
      const toStatus =
        typeof record.to?.name === "string" ? record.to.name : "";
      if (id === null || name === null) {
        return null;
      }
      return { id, name, toStatus };
    })
    .filter((entry): entry is TransitionEntry => entry !== null);
}

export async function probeIssueComments(
  fetchFn: AuthenticatedPmsFetch,
  restBaseUrl: string,
  issueKey: string,
): Promise<CommentsProbeResult> {
  const url = `${restBaseUrl}/issue/${encodeURIComponent(issueKey)}/comment`;
  const response = await fetchFn("GET", url);
  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      status: response.status,
      count: 0,
      sample: null,
      errorBody: text.slice(0, 800),
    };
  }

  let count = 0;
  let sample: string | null = null;
  try {
    const parsed = JSON.parse(text) as {
      total?: number;
      comments?: Array<{ body?: unknown }>;
    };
    count = parsed.total ?? parsed.comments?.length ?? 0;
    const firstBody = parsed.comments?.[0]?.body;
    if (typeof firstBody === "string") {
      sample = firstBody.slice(0, 200);
    }
  } catch {
    count = 0;
  }

  return {
    ok: true,
    skipped: false,
    status: response.status,
    count,
    sample,
    errorBody: "",
  };
}

export async function runWriteProbe(input: {
  fetchFn: AuthenticatedPmsFetch;
  restBaseUrl: string;
  issueKey: string;
  allowWrite: boolean;
  transitionTo: string | null;
  transitions: TransitionEntry[];
}): Promise<WriteProbeResult> {
  const base: WriteProbeResult = {
    skipped: true,
    commentOk: null,
    commentStatus: null,
    commentErrorBody: "",
    transitionOk: null,
    transitionStatus: null,
    transitionErrorBody: "",
    transitionId: null,
    transitionName: null,
  };

  if (!input.allowWrite) {
    return base;
  }

  const result: WriteProbeResult = { ...base, skipped: false };

  const commentUrl = `${input.restBaseUrl}/issue/${encodeURIComponent(input.issueKey)}/comment`;
  try {
    const commentResponse = await input.fetchFn("POST", commentUrl, {
      body: `[Symphony Probe] Integration verify comment at ${new Date().toISOString()}`,
    });
    result.commentOk = commentResponse.ok;
    result.commentStatus = commentResponse.status;
    if (!commentResponse.ok) {
      result.commentErrorBody = (await commentResponse.text()).slice(0, 800);
    }
  } catch (error) {
    result.commentOk = false;
    result.commentStatus = 0;
    result.commentErrorBody =
      error instanceof Error ? error.message : String(error);
  }

  if (input.transitionTo !== null && input.transitionTo.trim() !== "") {
    const match = findTransitionMatch(input.transitions, input.transitionTo);
    if (match === null) {
      result.transitionOk = false;
      result.transitionStatus = 0;
      result.transitionErrorBody = `No unique transition match for ${JSON.stringify(input.transitionTo)}`;
    } else {
      result.transitionId = match.id;
      result.transitionName = match.name;
      const transitionUrl = `${input.restBaseUrl}/issue/${encodeURIComponent(input.issueKey)}/transitions`;
      try {
        const transitionResponse = await input.fetchFn("POST", transitionUrl, {
          transition: { id: match.id },
        });
        result.transitionOk = transitionResponse.ok;
        result.transitionStatus = transitionResponse.status;
        if (!transitionResponse.ok) {
          result.transitionErrorBody = (await transitionResponse.text()).slice(
            0,
            800,
          );
        }
      } catch (error) {
        result.transitionOk = false;
        result.transitionStatus = 0;
        result.transitionErrorBody =
          error instanceof Error ? error.message : String(error);
      }
    }
  }

  return result;
}

export function writePmsBcsVerifyReport(
  report: PmsBcsVerifyReport,
  cwd = process.cwd(),
): string {
  mkdirSync(resolve(cwd, "tmp"), { recursive: true });
  const reportPath = resolve(cwd, "tmp", PMS_BCS_VERIFY_REPORT_FILENAME);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

export function normalizeRestBaseUrl(endpoint: string): string {
  const trimmed = endpoint.replace(/\/$/, "");
  return trimmed.endsWith("/rest/api/2")
    ? trimmed
    : `${trimmed}/rest/api/2`;
}
