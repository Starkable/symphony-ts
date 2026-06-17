#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  resolveWorkflowConfig,
  validateDispatchConfig,
} from "../config/config-resolver.js";
import { PMS_TRACKER_KIND } from "../config/defaults.js";
import { loadWorkflowDefinition } from "../config/workflow-loader.js";
import type { ResolvedWorkflowConfig } from "../config/types.js";
import type { Issue } from "../domain/model.js";
import { TrackerError } from "../tracker/errors.js";
import { PmsTrackerClient } from "../tracker/pms/pms-client.js";

export interface PmsSmokeClient {
  validateAuth(): Promise<void>;
  fetchCandidateIssues(): Promise<Issue[]>;
}

export interface PmsSmokeOptions {
  workflowPath: string | null;
  limit: number;
  skipAuth: boolean;
  help: boolean;
}

export interface PmsSmokeIo {
  log(message: string): void;
  error(message: string): void;
}

const DEFAULT_PREVIEW_LIMIT = 10;

export function parsePmsSmokeArgs(argv: readonly string[]): PmsSmokeOptions {
  let workflowPath: string | null = null;
  let limit = DEFAULT_PREVIEW_LIMIT;
  let skipAuth = false;
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

    if (token === "--skip-auth") {
      skipAuth = true;
      continue;
    }

    if (token === "--limit") {
      const rawLimit = argv[index + 1];
      if (rawLimit === undefined || rawLimit.startsWith("-")) {
        throw new Error("--limit requires a positive integer argument.");
      }

      const parsed = Number.parseInt(rawLimit, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--limit must be a positive integer.");
      }

      limit = parsed;
      index += 1;
      continue;
    }

    if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    }

    if (workflowPath !== null) {
      throw new Error("Accepts at most one positional WORKFLOW.md path argument.");
    }

    workflowPath = token;
  }

  return { workflowPath, limit, skipAuth, help };
}

export function renderPmsSmokeUsage(): string {
  return [
    "Usage: pms-smoke [WORKFLOW.md] [options]",
    "",
    "Load a PMS WORKFLOW, validate OAuth (optional), and fetch candidate issues",
    "from the configured tracker endpoint.",
    "",
    "Options:",
    "  --limit <n>     Number of issues to print in the preview (default: 10)",
    "  --skip-auth     Skip GET /rest/api/2/myself before search",
    "  -h, --help      Show this help message",
    "",
    "Environment:",
    "  PMS_OAUTH_ACCESS_TOKEN",
    "  PMS_OAUTH_ACCESS_TOKEN_SECRET",
    "  PMS_JIRA_KEY_PATH",
    "  PMS_JIRA_SERVER (optional endpoint override)",
    "",
    "Examples:",
    "  pnpm pms:smoke examples/workflow-pms/WORKFLOW.md",
    "  pnpm pms:smoke ./WORKFLOW.md --limit 5",
  ].join("\n");
}

function summarizeIssue(issue: Issue): Record<string, unknown> {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    state: issue.state,
    priority: issue.priority,
    url: issue.url,
    labels: issue.labels,
    updatedAt: issue.updatedAt,
  };
}

function readRawOauthField(
  workflow: Awaited<ReturnType<typeof loadWorkflowDefinition>>,
  field: string,
): string | null {
  const tracker = workflow.config.tracker;
  if (tracker === null || typeof tracker !== "object" || Array.isArray(tracker)) {
    return null;
  }

  const oauth = (tracker as Record<string, unknown>).oauth;
  if (oauth === null || typeof oauth !== "object" || Array.isArray(oauth)) {
    return null;
  }

  const value = (oauth as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

function renderMissingPmsCredentialHints(
  workflow: Awaited<ReturnType<typeof loadWorkflowDefinition>>,
  config: ResolvedWorkflowConfig,
  env: NodeJS.ProcessEnv,
): string[] {
  const hints: string[] = [];
  const fields = [
    {
      yamlField: "access_token",
      envVar: "PMS_OAUTH_ACCESS_TOKEN",
      resolved: config.tracker.oauth?.accessToken ?? null,
    },
    {
      yamlField: "access_token_secret",
      envVar: "PMS_OAUTH_ACCESS_TOKEN_SECRET",
      resolved: config.tracker.oauth?.accessTokenSecret ?? null,
    },
    {
      yamlField: "rsa_private_key_path",
      envVar: "PMS_JIRA_KEY_PATH",
      resolved: config.tracker.oauth?.rsaPrivateKeyPath ?? null,
    },
  ] as const;

  for (const field of fields) {
    if (field.resolved && field.resolved.trim() !== "") {
      continue;
    }

    const rawValue = readRawOauthField(workflow, field.yamlField);
    if (rawValue?.startsWith("$")) {
      const referencedEnv = rawValue.slice(1);
      const envPresent =
        typeof env[referencedEnv] === "string" &&
        env[referencedEnv]?.trim() !== "";
      hints.push(
        `  - tracker.oauth.${field.yamlField}=${rawValue} but shell env ${referencedEnv} is ${envPresent ? "empty" : "unset"}`,
      );
      continue;
    }

    if (rawValue && rawValue.trim() !== "") {
      hints.push(
        `  - tracker.oauth.${field.yamlField} is set in WORKFLOW but did not resolve; check YAML quoting (Windows paths like E:\\key\\test.key should use quotes or forward slashes)`,
      );
      continue;
    }

    hints.push(
      `  - tracker.oauth.${field.yamlField} is missing; set it in WORKFLOW or export ${field.envVar}`,
    );
  }

  if (hints.length > 0) {
    hints.unshift(
      "[pms-smoke] credential resolution hints (save WORKFLOW.md before re-running if you edited it in the IDE):",
    );
  }

  return hints;
}

function formatError(error: unknown): string {
  if (error instanceof TrackerError) {
    return `[${error.code}] ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function runPmsSmoke(
  argv: readonly string[],
  dependencies: {
    env?: NodeJS.ProcessEnv;
    io?: PmsSmokeIo;
    loadWorkflowDefinition?: typeof loadWorkflowDefinition;
    resolveWorkflowConfig?: typeof resolveWorkflowConfig;
    createClient?: (config: ResolvedWorkflowConfig) => PmsSmokeClient;
  } = {},
): Promise<number> {
  const env = dependencies.env ?? process.env;
  const io = dependencies.io ?? {
    log: (message: string) => {
      console.log(message);
    },
    error: (message: string) => {
      console.error(message);
    },
  };
  const loadWorkflow =
    dependencies.loadWorkflowDefinition ?? loadWorkflowDefinition;
  const resolveConfig =
    dependencies.resolveWorkflowConfig ?? resolveWorkflowConfig;

  let options: PmsSmokeOptions;
  try {
    options = parsePmsSmokeArgs(argv);
  } catch (error) {
    io.error(formatError(error));
    io.error(renderPmsSmokeUsage());
    return 1;
  }

  if (options.help) {
    io.log(renderPmsSmokeUsage());
    return 0;
  }

  io.log("[pms-smoke] loading workflow configuration");

  let workflowPath = options.workflowPath ?? process.cwd();
  try {
    const workflow = await loadWorkflow(options.workflowPath ?? undefined);
    workflowPath = workflow.workflowPath;
    io.log(`[pms-smoke] workflow path: ${workflowPath}`);

    const config = resolveConfig(workflow, env);
    if (config.tracker.kind !== PMS_TRACKER_KIND) {
      io.error(
        `[pms-smoke] tracker.kind must be "${PMS_TRACKER_KIND}", got "${config.tracker.kind}".`,
      );
      return 1;
    }

    const validation = validateDispatchConfig(config);
    if (!validation.ok) {
      io.error(
        `[pms-smoke] dispatch validation failed: [${validation.error.code}] ${validation.error.message}`,
      );
      for (const hint of renderMissingPmsCredentialHints(workflow, config, env)) {
        io.error(hint);
      }
      return 1;
    }

    io.log(
      `[pms-smoke] endpoint=${config.tracker.endpoint} project=${config.tracker.projectSlug ?? "(missing)"} active_states=${JSON.stringify(config.tracker.activeStates)}`,
    );

    const createClient =
      dependencies.createClient ??
      ((resolvedConfig: ResolvedWorkflowConfig) =>
        PmsTrackerClient.fromConfig(resolvedConfig));
    const client = createClient(config);

    if (!options.skipAuth) {
      io.log("[pms-smoke] validating OAuth via GET /rest/api/2/myself");
      await client.validateAuth();
      io.log("[pms-smoke] OAuth validation succeeded");
    } else {
      io.log("[pms-smoke] skipping OAuth validation (--skip-auth)");
    }

    io.log("[pms-smoke] fetching candidate issues");
    const issues = await client.fetchCandidateIssues();
    io.log(`[pms-smoke] fetched ${issues.length} candidate issue(s)`);

    const preview = issues.slice(0, options.limit).map(summarizeIssue);
    io.log(
      JSON.stringify(
        {
          workflowPath,
          endpoint: config.tracker.endpoint,
          projectSlug: config.tracker.projectSlug,
          activeStates: config.tracker.activeStates,
          total: issues.length,
          previewLimit: options.limit,
          preview,
        },
        null,
        2,
      ),
    );

    io.log("[pms-smoke] completed successfully");
    return 0;
  } catch (error) {
    io.error(`[pms-smoke] failed: ${formatError(error)}`);
    io.error(`[pms-smoke] workflow path: ${workflowPath ?? "(unknown)"}`);
    return 1;
  }
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
  const exitCode = await runPmsSmoke(process.argv.slice(2));
  process.exit(exitCode);
}

if (shouldRunAsCli(import.meta.url, process.argv[1])) {
  void main();
}
