import { rm } from "node:fs/promises";

import type { ResolvedWorkflowConfig } from "../../../config/types.js";
import {
  type Issue,
  type LiveSession,
  type RunAttempt,
  type RunAttemptPhase,
  type Workspace,
  createEmptyLiveSession,
} from "../../../domain/model.js";
import { applyHarnessEventToSession } from "../../../logging/session-metrics.js";
import type { StructuredLogger } from "../../../logging/structured-logger.js";
import { trackerStateMatches } from "../../../tracker/state-matching.js";
import type { IssueTracker } from "../../../tracker/tracker.js";
import { resolveChangeRef } from "../../../workflow/change-ref-path.js";
import { resolveWorkflowSkillPayload } from "../../../workflow/ensure-workflow-skill-ready.js";
import { AgentSkillReadError } from "../../../workflow/read-agent-skill.js";
import {
  InvalidWorkflowSkillError,
  WorkspaceSkillMissingError,
} from "../../../workflow/validate-workspace-skills.js";
import { runMaterializationHookIfNeeded } from "../../../workflow/materialization-hook.js";
import { resolveWorkflowDispatchContext } from "../../../workflow/workflow-dispatch.js";
import { isWorkflowAllComplete } from "../../../workflow/workflow-harness-stop.js";
import { WorkspaceHookRunner } from "../../../workspace/hooks.js";
import { validateWorkspaceCwd } from "../../../workspace/path-safety.js";
import { WorkspaceManager } from "../../../workspace/workspace-manager.js";
import type {
  AgentHarness,
  AgentHarnessFactoryInput,
} from "../../harness/agent-harness.js";
import type {
  HarnessAgentEvent,
  HarnessRunInput,
  HarnessRunResult,
  HarnessRuntimeEvent,
  HarnessTurnOutcome,
} from "../../harness/types.js";
import { buildTurnPrompt } from "../../prompt-builder.js";
import { logAgentPromptBuilt } from "../../prompt-log.js";
import { AgentRunnerError } from "../../runner.js";
import {
  type ClaudeCliRunner,
  runClaudeCli,
} from "./claude-cli-session.js";
import {
  createClaudeHarnessEvent,
  mapClaudeCliResultToHarnessEvent,
  toClaudeHarnessAgentEvent,
} from "./claude-event-adapter.js";
import {
  clearClaudeSession,
  readClaudeSession,
  writeClaudeSession,
} from "./claude-session-store.js";

export class ClaudeAgentHarness implements AgentHarness {
  private config: ResolvedWorkflowConfig;
  private tracker: IssueTracker;
  private workspaceManager: WorkspaceManager;
  private hooks: WorkspaceHookRunner;
  private readonly runCli: ClaudeCliRunner;
  private readonly onEvent: ((event: HarnessAgentEvent) => void) | undefined;
  private readonly logger: StructuredLogger | null;

  constructor(
    input: AgentHarnessFactoryInput & {
      runCli?: ClaudeCliRunner;
    },
  ) {
    this.config = input.config;
    this.tracker = input.tracker;
    this.logger = input.logger ?? null;
    this.hooks = new WorkspaceHookRunner({
      config: input.config.hooks,
    });
    this.workspaceManager =
      input.workspaceManager ??
      new WorkspaceManager({
        root: input.config.workspace.root,
        hooks: this.hooks,
      });
    this.runCli = input.runCli ?? runClaudeCli;
    this.onEvent = input.onEvent;
  }

  updateConfig(input: {
    config: ResolvedWorkflowConfig;
    tracker?: IssueTracker;
    workspaceManager?: WorkspaceManager;
  }): void {
    this.config = input.config;
    if (input.tracker !== undefined) {
      this.tracker = input.tracker;
    }
    if (input.workspaceManager !== undefined) {
      this.workspaceManager = input.workspaceManager;
    }
    this.hooks = new WorkspaceHookRunner({
      config: this.config.hooks,
    });
  }

  async run(input: HarnessRunInput): Promise<HarnessRunResult> {
    let issue = cloneIssue(input.issue);
    let workspace: Workspace | null = null;
    let lastTurn: HarnessTurnOutcome | null = null;
    const liveSession = createEmptyLiveSession();
    const runAttempt: RunAttempt = {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      attempt: input.attempt,
      workspacePath: "",
      startedAt: new Date().toISOString(),
      status: "preparing_workspace",
    };

    try {
      throwIfAborted(input.signal, {
        issue,
        workspace,
        runAttempt,
        liveSession,
      });

      workspace = await this.workspaceManager.createForIssue(issue.id);
      runAttempt.workspacePath = validateWorkspaceCwd({
        cwd: workspace.path,
        workspacePath: workspace.path,
        workspaceRoot: this.config.workspace.root,
      });
      await cleanupWorkspaceArtifacts(workspace.path);
      const workspacePath = workspace.path;

      if (this.config.harnesses.claude.reusePolicy === "fresh_each_run") {
        await clearClaudeSession(workspacePath);
      }

      await this.hooks.run({
        name: "beforeRun",
        workspacePath,
      });

      runAttempt.status = "launching_agent_process";
      const sessionStartedEvent = createClaudeHarnessEvent({
        kind: "session_started",
        message: "claude worker started",
      });
      applyHarnessEventToSession(liveSession, sessionStartedEvent);
      this.emitHarnessEvent(sessionStartedEvent, {
        issue,
        attempt: input.attempt,
        workspacePath,
        liveSession,
      });

      const storedSession =
        this.config.harnesses.claude.reusePolicy === "per_issue"
          ? await readClaudeSession(workspacePath)
          : null;
      let sessionId = storedSession?.sessionId ?? null;

      for (
        let turnNumber = 1;
        turnNumber <= this.config.agent.maxTurns;
        turnNumber += 1
      ) {
        throwIfAborted(input.signal, {
          issue,
          workspace,
          runAttempt,
          liveSession,
        });

        runAttempt.status = "building_prompt";
        await runMaterializationHookIfNeeded({
          hooks: this.hooks,
          workspacePath,
          issueIdentifier: issue.identifier,
          workflow: this.config.workflow,
        });
        const prompt = await this.buildPromptForTurn({
          issue,
          attempt: input.attempt,
          turnNumber,
          workspacePath,
        });
        const claudeConfig = this.config.harnesses.claude;
        await logAgentPromptBuilt(this.logger, {
          issue,
          attempt: input.attempt,
          workspacePath,
          turnNumber,
          prompt,
          includeFullPrompt: false,
          maxBytes: 32_768,
        });

        runAttempt.status =
          turnNumber === 1 ? "initializing_session" : "streaming_turn";

        let streamedTerminalEvent: HarnessRuntimeEvent | null = null;
        const cliResult = await this.runCli({
          command: claudeConfig.command,
          cwd: workspacePath,
          prompt,
          sessionId,
          model: claudeConfig.model,
          permissionMode: claudeConfig.permissionMode,
          allowedTools: claudeConfig.allowedTools,
          turnTimeoutMs: claudeConfig.turnTimeoutMs,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          onSessionId: async (nextSessionId) => {
            sessionId = nextSessionId;
            await writeClaudeSession(workspacePath, {
              sessionId: nextSessionId,
              updatedAt: new Date().toISOString(),
            });
          },
          onHarnessEvent: (event) => {
            const enriched = {
              ...event,
              turnId: event.turnId ?? `turn-${turnNumber}`,
            };
            applyHarnessEventToSession(liveSession, enriched);
            this.emitHarnessEvent(enriched, {
              issue,
              attempt: input.attempt,
              workspacePath,
              liveSession,
            });
            if (isTerminalHarnessEvent(enriched.kind)) {
              streamedTerminalEvent = enriched;
            }
          },
        });

        if (cliResult.sessionId !== null) {
          sessionId = cliResult.sessionId;
        }

        const harnessEvent =
          streamedTerminalEvent ??
          mapClaudeCliResultToHarnessEvent(cliResult, {
            turnNumber,
            sessionId,
          });
        if (streamedTerminalEvent === null) {
          applyHarnessEventToSession(liveSession, harnessEvent);
          this.emitHarnessEvent(harnessEvent, {
            issue,
            attempt: input.attempt,
            workspacePath,
            liveSession,
          });
        }

        lastTurn = {
          status:
            harnessEvent.kind === "turn_completed"
              ? "completed"
              : harnessEvent.kind === "turn_cancelled"
                ? "cancelled"
                : "failed",
          sessionId,
          threadId: sessionId,
          turnId: `turn-${turnNumber}`,
          usage: harnessEvent.usage ?? null,
          rateLimits: null,
          message: harnessEvent.message ?? null,
          exitCode: cliResult.exitCode,
        };

        runAttempt.status = "finishing";
        issue = await this.refreshIssueState(issue);

        if (harnessEvent.kind === "turn_completed") {
          if (
            await isWorkflowAllComplete({
              workspacePath,
              issueIdentifier: issue.identifier,
              workflow: this.config.workflow,
            })
          ) {
            await this.logger?.info(
              "harness_stop_workflow_done",
              "Stopping harness because V1.2 workflow artifacts are complete.",
              {
                issue_identifier: issue.identifier,
                turn_number: turnNumber,
                change_ref: resolveChangeRef(issue.identifier),
              },
            );
            break;
          }
        }

        if (!this.isIssueStillActive(issue)) {
          break;
        }

        if (harnessEvent.kind !== "turn_completed") {
          break;
        }
      }

      runAttempt.status = "succeeded";
      return {
        issue,
        workspace,
        runAttempt,
        liveSession,
        turnsCompleted: liveSession.turnCount,
        lastTurn,
        rateLimits: null,
      };
    } catch (error) {
      const wrapped = this.toHarnessError({
        error,
        issue,
        workspace,
        runAttempt,
        liveSession,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      runAttempt.status = wrapped.status;
      runAttempt.error = wrapped.message;
      throw wrapped;
    } finally {
      if (workspace !== null) {
        await this.hooks.runBestEffort({
          name: "afterRun",
          workspacePath: workspace.path,
        });
      }
    }
  }

  private async buildPromptForTurn(input: {
    issue: Issue;
    attempt: number | null;
    turnNumber: number;
    workspacePath: string;
  }): Promise<string> {
    const workflowDispatch =
      this.config.workflow === null
        ? null
        : await resolveWorkflowDispatchContext({
            workspacePath: input.workspacePath,
            issueIdentifier: input.issue.identifier,
            workflow: this.config.workflow,
          });

    try {
      const skillPayload = await resolveWorkflowSkillPayload({
        workspacePath: input.workspacePath,
        workflowDispatch,
      });

      return await buildTurnPrompt({
        workflow: {
          promptTemplate: this.config.promptTemplate,
        },
        issue: input.issue,
        attempt: input.attempt,
        turnNumber: input.turnNumber,
        maxTurns: this.config.agent.maxTurns,
        workflowDispatch:
          workflowDispatch === null
            ? null
            : {
                changeRef: workflowDispatch.changeRef,
                effectivePhaseId: workflowDispatch.effectivePhaseId,
                skill: workflowDispatch.skill,
                producesPath: workflowDispatch.producesPath,
                skillPayload,
              },
      });
    } catch (error) {
      if (
        error instanceof WorkspaceSkillMissingError ||
        error instanceof InvalidWorkflowSkillError ||
        error instanceof AgentSkillReadError
      ) {
        await this.logger?.error("skill_missing", error.message, {
          skill: error.skill,
          workspace_path: input.workspacePath,
          issue_identifier: input.issue.identifier,
        });
      }
      throw error;
    }
  }

  private emitHarnessEvent(
    event: Parameters<typeof toClaudeHarnessAgentEvent>[0],
    context: {
      issue: Issue;
      attempt: number | null;
      workspacePath: string;
      liveSession: LiveSession;
    },
  ): void {
    this.onEvent?.(
      toClaudeHarnessAgentEvent(event, {
        issueId: context.issue.id,
        issueIdentifier: context.issue.identifier,
        attempt: context.attempt,
        workspacePath: context.workspacePath,
        turnCount: context.liveSession.turnCount,
      }),
    );
  }

  private async refreshIssueState(issue: Issue): Promise<Issue> {
    const refreshed = await this.tracker.fetchIssueStatesByIds([issue.id]);
    const next = refreshed[0];
    if (next === undefined) {
      return issue;
    }

    return {
      ...issue,
      identifier:
        next.identifier.trim().length > 0 ? next.identifier : issue.identifier,
      state: next.state,
    };
  }

  private isIssueStillActive(issue: Issue): boolean {
    return trackerStateMatches(
      issue.state,
      this.config.tracker.activeStates,
      this.config.tracker,
    );
  }

  private toHarnessError(input: {
    error: unknown;
    issue: Issue;
    workspace: Workspace | null;
    runAttempt: RunAttempt;
    liveSession: LiveSession;
    signal?: AbortSignal;
  }): AgentRunnerError {
    if (input.error instanceof AgentRunnerError) {
      return input.error;
    }

    if (input.signal?.aborted) {
      return new AgentRunnerError({
        message: toAbortMessage(input.signal.reason),
        status: "canceled_by_reconciliation",
        failedPhase: input.runAttempt.status,
        issue: input.issue,
        workspace: input.workspace,
        runAttempt: { ...input.runAttempt },
        liveSession: { ...input.liveSession },
        cause: input.error,
      });
    }

    const message =
      input.error instanceof Error
        ? input.error.message
        : "Claude harness failed.";
    const code =
      typeof input.error === "object" &&
      input.error !== null &&
      "code" in input.error &&
      typeof input.error.code === "string"
        ? input.error.code
        : undefined;

    return new AgentRunnerError({
      message,
      ...(code === undefined ? {} : { code }),
      status: classifyFailureStatus(code),
      failedPhase: input.runAttempt.status,
      issue: input.issue,
      workspace: input.workspace,
      runAttempt: { ...input.runAttempt },
      liveSession: { ...input.liveSession },
      cause: input.error,
    });
  }
}

function isTerminalHarnessEvent(kind: HarnessRuntimeEvent["kind"]): boolean {
  return (
    kind === "turn_completed" ||
    kind === "turn_failed" ||
    kind === "turn_cancelled" ||
    kind === "runtime_error"
  );
}

async function cleanupWorkspaceArtifacts(workspacePath: string): Promise<void> {
  await rm(`${workspacePath}/tmp`, {
    force: true,
    recursive: true,
  });
}

function cloneIssue(issue: Issue): Issue {
  return {
    ...issue,
    labels: [...issue.labels],
    blockedBy: issue.blockedBy.map((blocker) => ({ ...blocker })),
  };
}

function throwIfAborted(
  signal: AbortSignal | undefined,
  input: {
    issue: Issue;
    workspace: Workspace | null;
    runAttempt: RunAttempt;
    liveSession: LiveSession;
  },
): void {
  if (!signal?.aborted) {
    return;
  }

  throw new AgentRunnerError({
    message: toAbortMessage(signal.reason),
    status: "canceled_by_reconciliation",
    failedPhase: input.runAttempt.status,
    issue: input.issue,
    workspace: input.workspace,
    runAttempt: { ...input.runAttempt },
    liveSession: { ...input.liveSession },
  });
}

function toAbortMessage(reason: unknown): string {
  if (typeof reason === "string" && reason.trim().length > 0) {
    return reason;
  }
  return "aborted";
}

function classifyFailureStatus(code: string | undefined): RunAttemptPhase {
  if (code === "claude_turn_timeout" || code === "hook_timed_out") {
    return "timed_out";
  }
  return "failed";
}
