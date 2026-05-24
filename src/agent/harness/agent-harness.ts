import type { ResolvedWorkflowConfig } from "../../config/types.js";
import type { StructuredLogger } from "../../logging/structured-logger.js";
import type { IssueTracker } from "../../tracker/tracker.js";
import type { WorkspaceManager } from "../../workspace/workspace-manager.js";
import type {
  HarnessAgentEvent,
  HarnessRunInput,
  HarnessRunResult,
} from "./types.js";

export interface AgentHarness {
  run(input: HarnessRunInput): Promise<HarnessRunResult>;
  updateConfig?(input: {
    config: ResolvedWorkflowConfig;
    tracker?: IssueTracker;
    workspaceManager?: WorkspaceManager;
  }): void;
}

export interface AgentHarnessFactoryInput {
  config: ResolvedWorkflowConfig;
  tracker: IssueTracker;
  workspaceManager?: WorkspaceManager;
  logger?: StructuredLogger | null;
  onEvent?: (event: HarnessAgentEvent) => void;
}

export type AgentHarnessLike = AgentHarness;
