import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SymphonyWorkflowConfig } from "../../config/types.js";
import { normalizeIssueState } from "../../domain/model.js";
import type { StructuredLogger } from "../../logging/structured-logger.js";
import {
  type ResolvedWritebackSignal,
  type WritebackSignalSource,
  resolveWritebackSignal,
} from "../../workflow/writeback-signal.js";
import {
  SYMPHONY_COMMENT_PREFIX,
  type WorkpadWritebackSignal,
} from "../../workflow/workpad-writeback-signal.js";
import type { PmsTrackerClient } from "./pms-client.js";
import { issueStateMatchesStates } from "./pms-status-alias.js";
import {
  PMS_CLARIFY_TRANSITION_TARGET,
  PMS_DONE_TRANSITION_TARGET,
  PMS_STATE_CLARIFY_BLOCKED,
  PMS_STATE_DONE,
} from "./pms-transition.js";

export type PendingWritebackAction = "clarify_blocked" | "done";

export interface PendingWritebackEntry {
  issueKey: string;
  action: PendingWritebackAction;
  commentBody: string | null;
  lastError: string;
  attempts: number;
}

export interface PmsWritebackProcessInput {
  issueKey: string;
  issueState: string;
  workspacePath: string;
  logger: StructuredLogger | null;
  workflow?: SymphonyWorkflowConfig | null;
}

export class PmsWritebackService {
  private readonly pending = new Map<string, PendingWritebackEntry>();

  constructor(private readonly client: PmsTrackerClient) {}

  getPendingCount(): number {
    return this.pending.size;
  }

  getPendingEntries(): PendingWritebackEntry[] {
    return [...this.pending.values()];
  }

  async processWorkpadSignal(input: PmsWritebackProcessInput): Promise<void> {
    await this.processCompletionSignal({
      ...input,
      workflow: input.workflow ?? null,
    });
  }

  async processCompletionSignal(input: {
    issueKey: string;
    issueState: string;
    workspacePath: string;
    logger: StructuredLogger | null;
    workflow: SymphonyWorkflowConfig | null;
  }): Promise<boolean> {
    const workpadPath = join(input.workspacePath, ".symphony", "workpad.md");
    let workpadContent: string | null = null;
    try {
      workpadContent = await readFile(workpadPath, "utf8");
    } catch {
      // V1.2 may omit workpad; artifact completion can still trigger writeback.
    }

    const signal = await resolveWritebackSignal({
      workpadContent,
      workspacePath: input.workspacePath,
      issueIdentifier: input.issueKey,
      workflow: input.workflow,
    });

    if (signal.kind === "none") {
      return false;
    }

    await this.executeSignal({
      issueKey: input.issueKey,
      issueState: input.issueState,
      signal: toWorkpadWritebackSignal(signal),
      logger: input.logger,
      signalSource: signal.source,
    });
    return this.pending.has(input.issueKey);
  }

  hasPendingWriteback(issueKey: string): boolean {
    return this.pending.has(issueKey);
  }

  async retryPending(logger: StructuredLogger | null): Promise<void> {
    for (const entry of [...this.pending.values()]) {
      const signal: WorkpadWritebackSignal =
        entry.action === "clarify_blocked"
          ? {
              kind: "clarify_blocked",
              commentBody: entry.commentBody ?? "",
            }
          : { kind: "done" };

      await this.executeSignal({
        issueKey: entry.issueKey,
        issueState: "",
        signal,
        logger,
        fromPending: true,
      });
    }
  }

  private async executeSignal(input: {
    issueKey: string;
    issueState: string;
    signal: WorkpadWritebackSignal;
    logger: StructuredLogger | null;
    fromPending?: boolean;
    signalSource?: WritebackSignalSource;
  }): Promise<void> {
    if (input.signal.kind === "clarify_blocked") {
      await this.executeClarifyBlocked({
        issueKey: input.issueKey,
        issueState: input.issueState,
        commentBody: input.signal.commentBody,
        logger: input.logger,
        fromPending: input.fromPending ?? false,
        signalSource: input.signalSource ?? "workpad",
      });
      return;
    }

    if (input.signal.kind === "done") {
      await this.executeDone({
        issueKey: input.issueKey,
        issueState: input.issueState,
        logger: input.logger,
        fromPending: input.fromPending ?? false,
        signalSource: input.signalSource ?? "workpad",
      });
    }
  }

  private async executeClarifyBlocked(input: {
    issueKey: string;
    issueState: string;
    commentBody: string;
    logger: StructuredLogger | null;
    fromPending: boolean;
    signalSource: WritebackSignalSource;
  }): Promise<void> {
    const alreadyPaused = issueStateMatchesStates(input.issueState, [
      PMS_STATE_CLARIFY_BLOCKED,
    ]);

    if (!alreadyPaused) {
      const transitionResult = await this.client.transitionIssueByTarget(
        input.issueKey,
        PMS_CLARIFY_TRANSITION_TARGET,
      );
      await this.logWritebackAttempt(input.logger, {
        issueKey: input.issueKey,
        action: "transition",
        target: PMS_CLARIFY_TRANSITION_TARGET,
        ok: transitionResult.ok,
        status: transitionResult.status,
        errorBody: transitionResult.errorBody,
        signalSource: input.signalSource,
      });
      if (!transitionResult.ok) {
        this.enqueuePending({
          issueKey: input.issueKey,
          action: "clarify_blocked",
          commentBody: input.commentBody,
          error: transitionResult.errorBody,
        });
        return;
      }
    }

    const shouldWriteComment = await this.shouldWriteClarifyComment(
      input.issueKey,
      input.commentBody,
    );
    if (!shouldWriteComment) {
      this.pending.delete(input.issueKey);
      return;
    }

    const commentResult = await this.client.addIssueComment(
      input.issueKey,
      input.commentBody,
    );
    await this.logWritebackAttempt(input.logger, {
      issueKey: input.issueKey,
      action: "comment",
      target: "clarify_blocked",
      ok: commentResult.ok,
      status: commentResult.status,
      errorBody: commentResult.errorBody,
      signalSource: input.signalSource,
    });

    if (commentResult.ok) {
      this.pending.delete(input.issueKey);
    } else {
      this.enqueuePending({
        issueKey: input.issueKey,
        action: "clarify_blocked",
        commentBody: input.commentBody,
        error: commentResult.errorBody,
      });
    }
  }

  private async executeDone(input: {
    issueKey: string;
    issueState: string;
    logger: StructuredLogger | null;
    fromPending: boolean;
    signalSource: WritebackSignalSource;
  }): Promise<void> {
    if (
      issueStateMatchesStates(input.issueState, [PMS_STATE_DONE]) &&
      input.issueState.trim() !== ""
    ) {
      this.pending.delete(input.issueKey);
      return;
    }

    const transitionResult = await this.client.transitionIssueByTarget(
      input.issueKey,
      PMS_DONE_TRANSITION_TARGET,
    );
    await this.logWritebackAttempt(input.logger, {
      issueKey: input.issueKey,
      action: "transition",
      target: PMS_DONE_TRANSITION_TARGET,
      ok: transitionResult.ok,
      status: transitionResult.status,
      errorBody: transitionResult.errorBody,
      signalSource: input.signalSource,
    });

    if (transitionResult.ok) {
      this.pending.delete(input.issueKey);
    } else {
      this.enqueuePending({
        issueKey: input.issueKey,
        action: "done",
        commentBody: null,
        error: transitionResult.errorBody,
      });
    }
  }

  private async shouldWriteClarifyComment(
    issueKey: string,
    commentBody: string,
  ): Promise<boolean> {
    if (!commentBody.includes(SYMPHONY_COMMENT_PREFIX)) {
      return true;
    }

    try {
      const comments = await this.client.listIssueComments(issueKey);
      const normalizedBody = commentBody.trim();
      return !comments.some((entry) => entry.body.trim() === normalizedBody);
    } catch {
      return true;
    }
  }

  private enqueuePending(input: {
    issueKey: string;
    action: PendingWritebackAction;
    commentBody: string | null;
    error: string;
  }): void {
    const existing = this.pending.get(input.issueKey);
    this.pending.set(input.issueKey, {
      issueKey: input.issueKey,
      action: input.action,
      commentBody: input.commentBody,
      lastError: input.error,
      attempts: (existing?.attempts ?? 0) + 1,
    });
  }

  private async logWritebackAttempt(
    logger: StructuredLogger | null,
    input: {
      issueKey: string;
      action: string;
      target: string;
      ok: boolean;
      status: number;
      errorBody: string;
      signalSource?: WritebackSignalSource;
    },
  ): Promise<void> {
    if (logger === null) {
      return;
    }

    await logger.log(
      input.ok ? "info" : "warn",
      "pms_writeback",
      input.ok
        ? `PMS writeback ${input.action} succeeded.`
        : `PMS writeback ${input.action} failed.`,
      {
        issue_identifier: input.issueKey,
        action: input.action,
        target: input.target,
        http_status: input.status,
        ...(input.errorBody === "" ? {} : { error_body: input.errorBody }),
        ...(input.signalSource === undefined || input.signalSource === "none"
          ? {}
          : { signal_source: input.signalSource }),
        outcome: input.ok ? "completed" : "failed",
      },
    );
  }
}

function toWorkpadWritebackSignal(
  signal: Exclude<ResolvedWritebackSignal, { kind: "none" }>,
): WorkpadWritebackSignal {
  if (signal.kind === "clarify_blocked") {
    return {
      kind: "clarify_blocked",
      commentBody: signal.commentBody,
    };
  }
  return { kind: "done" };
}

export function isPmsWritebackTargetState(state: string): boolean {
  const normalized = normalizeIssueState(state);
  return (
    normalized === normalizeIssueState(PMS_STATE_CLARIFY_BLOCKED) ||
    normalized === normalizeIssueState(PMS_STATE_DONE)
  );
}
