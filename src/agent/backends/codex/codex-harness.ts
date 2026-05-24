import type { CodexTurnResult } from "../../../codex/app-server-client.js";
import type { ResolvedWorkflowConfig } from "../../../config/types.js";
import type { IssueTracker } from "../../../tracker/tracker.js";
import type { WorkspaceManager } from "../../../workspace/workspace-manager.js";
import {
  AgentRunner,
  type AgentRunResult,
  type AgentRunnerOptions,
} from "../../runner.js";
import type { AgentHarness, AgentHarnessFactoryInput } from "../../harness/agent-harness.js";
import type {
  HarnessAgentEvent,
  HarnessRunInput,
  HarnessRunResult,
  HarnessTurnOutcome,
} from "../../harness/types.js";
import { mapAgentRunnerEventToHarnessAgentEvent } from "./codex-event-adapter.js";

export class CodexAgentHarness implements AgentHarness {
  private config: ResolvedWorkflowConfig;

  private tracker: IssueTracker;

  private workspaceManager: WorkspaceManager | undefined;

  private readonly createRunner: (
    options: AgentRunnerOptions,
  ) => AgentRunner;

  private runner: AgentRunner;

  private readonly onEvent: ((event: HarnessAgentEvent) => void) | undefined;

  constructor(
    input: AgentHarnessFactoryInput & {
      createRunner?: (options: AgentRunnerOptions) => AgentRunner;
    },
  ) {
    this.config = input.config;
    this.tracker = input.tracker;
    this.workspaceManager = input.workspaceManager;
    this.onEvent = input.onEvent;
    this.createRunner = input.createRunner ?? ((options) => new AgentRunner(options));
    this.runner = this.createRunner(this.buildRunnerOptions());
  }

  async run(input: HarnessRunInput): Promise<HarnessRunResult> {
    const result = await this.runner.run(input);
    return mapAgentRunResultToHarnessRunResult(result);
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
    this.runner = this.createRunner(this.buildRunnerOptions());
  }

  private buildRunnerOptions(): AgentRunnerOptions {
    return {
      config: this.config,
      tracker: this.tracker,
      ...(this.workspaceManager === undefined
        ? {}
        : { workspaceManager: this.workspaceManager }),
      ...(this.onEvent === undefined
        ? {}
        : {
            onEvent: (event) => {
              this.onEvent?.(mapAgentRunnerEventToHarnessAgentEvent(event));
            },
          }),
    };
  }
}

export function mapAgentRunResultToHarnessRunResult(
  result: AgentRunResult,
): HarnessRunResult {
  return {
    issue: result.issue,
    workspace: result.workspace,
    runAttempt: result.runAttempt,
    liveSession: result.liveSession,
    turnsCompleted: result.turnsCompleted,
    lastTurn:
      result.lastTurn === null
        ? null
        : mapCodexTurnResultToHarnessTurnOutcome(result.lastTurn),
    rateLimits: result.rateLimits,
  };
}

export function mapCodexTurnResultToHarnessTurnOutcome(
  turn: CodexTurnResult,
): HarnessTurnOutcome {
  return {
    status: turn.status,
    sessionId: turn.sessionId,
    threadId: turn.threadId,
    turnId: turn.turnId,
    usage: turn.usage,
    rateLimits: turn.rateLimits,
    message: turn.message,
    exitCode: null,
  };
}
