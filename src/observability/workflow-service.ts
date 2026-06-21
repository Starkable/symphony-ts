import { type ArtifactStore, toSummary } from "../artifact-store/store.js";
import type {
  WorkflowDetail,
  WorkflowManifest,
  WorkflowSummary,
} from "../artifact-store/types.js";
import type { OrchestratorState } from "../domain/model.js";

export type WorkflowListStatus = "active" | "archived" | "all";

export class WorkflowService {
  readonly #store: ArtifactStore;

  constructor(store: ArtifactStore) {
    this.#store = store;
  }

  isEnabled(): boolean {
    return this.#store.isEnabled();
  }

  get store(): ArtifactStore {
    return this.#store;
  }

  async listWorkflows(
    status: WorkflowListStatus,
    state: OrchestratorState,
  ): Promise<WorkflowSummary[]> {
    const stored = await this.#store.listSummaries();
    const runningIds = new Set(Object.keys(state.running));
    const merged = new Map<string, WorkflowSummary>();

    for (const summary of stored) {
      merged.set(summary.issue_identifier, summary);
    }

    for (const running of Object.values(state.running)) {
      const existing = merged.get(running.identifier);
      const manifest = existing
        ? await this.#store.readManifest(running.identifier)
        : null;
      const summary = manifest
        ? {
            ...toSummary(mergeManifestRuntime(manifest, running), null),
            title: running.issue.title,
            priority: formatPriority(running.issue.priority),
            runtime: {
              status: "running" as const,
              turn_count: running.turnCount,
              last_message: running.lastCodexMessage,
              last_event: running.lastCodexEvent,
              last_event_at: running.lastCodexTimestamp,
            },
          }
        : placeholderRunningSummary(running);
      merged.set(running.identifier, summary);
    }

    const all = [...merged.values()].sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at),
    );

    if (status === "all") {
      return all;
    }

    if (status === "active") {
      return all.filter((entry) => {
        const issueId = findIssueId(state, entry.issue_identifier) ?? "";
        if (runningIds.has(issueId)) {
          return true;
        }
        if (hasArchivedReason(entry.archived_reason)) {
          return false;
        }
        return entry.terminal_phase === null;
      });
    }

    return all.filter((entry) => {
      const issueId = findIssueId(state, entry.issue_identifier) ?? "";
      if (runningIds.has(issueId)) {
        return false;
      }
      return (
        hasArchivedReason(entry.archived_reason) ||
        entry.terminal_phase !== null
      );
    });
  }

  async getWorkflowDetail(
    issueIdentifier: string,
    state: OrchestratorState,
  ): Promise<WorkflowDetail | null> {
    const detail = await this.#store.getDetail(issueIdentifier);
    const running = Object.values(state.running).find(
      (entry) => entry.identifier === issueIdentifier,
    );

    if (detail === null && running === undefined) {
      return null;
    }

    if (detail === null && running !== undefined) {
      return {
        issue_identifier: running.identifier,
        issue_id: running.issue.id,
        change_ref: running.identifier.toLowerCase(),
        mode: "v1-openspec",
        title: running.issue.title,
        priority: formatPriority(running.issue.priority),
        terminal_phase: null,
        created_at: running.startedAt,
        updated_at: new Date().toISOString(),
        manifest: emptyManifest(running),
      };
    }

    if (detail !== null && running !== undefined) {
      return {
        ...detail,
        title: detail.title ?? running.issue.title,
        priority: detail.priority ?? formatPriority(running.issue.priority),
        manifest: mergeManifestRuntime(detail.manifest, running),
      };
    }

    return detail;
  }
}

function mergeManifestRuntime(
  manifest: WorkflowManifest,
  running: OrchestratorState["running"][string],
): WorkflowManifest {
  return {
    ...manifest,
    runtime: {
      status: "running",
      turn_count: running.turnCount,
      last_message: running.lastCodexMessage,
      last_event: running.lastCodexEvent,
      last_event_at: running.lastCodexTimestamp,
    },
  };
}

function placeholderRunningSummary(
  running: OrchestratorState["running"][string],
): WorkflowSummary {
  return {
    issue_identifier: running.identifier,
    title: running.issue.title,
    current_phase: "clarify",
    phase_progress: { completed: 0, total: 6 },
    runtime: {
      status: "running",
      turn_count: running.turnCount,
      last_message: running.lastCodexMessage,
      last_event: running.lastCodexEvent,
      last_event_at: running.lastCodexTimestamp,
    },
    updated_at: new Date().toISOString(),
    started_at: running.startedAt,
    artifact_count: 0,
    priority: formatPriority(running.issue.priority),
    terminal_phase: null,
  };
}

function emptyManifest(
  running: OrchestratorState["running"][string],
): WorkflowManifest {
  return {
    issue_identifier: running.identifier,
    change_ref: running.identifier.toLowerCase(),
    mode: "v1-openspec",
    current_phase: "clarify",
    updated_at: new Date().toISOString(),
    phases: [],
    runtime: {
      status: "running",
      turn_count: running.turnCount,
      last_message: running.lastCodexMessage,
      last_event: running.lastCodexEvent,
      last_event_at: running.lastCodexTimestamp,
    },
  };
}

function hasArchivedReason(
  archivedReason: WorkflowSummary["archived_reason"],
): boolean {
  return archivedReason !== null && archivedReason !== undefined;
}

function findIssueId(
  state: OrchestratorState,
  issueIdentifier: string,
): string | null {
  for (const [issueId, running] of Object.entries(state.running)) {
    if (running.identifier === issueIdentifier) {
      return issueId;
    }
  }
  return null;
}

function formatPriority(priority: number | null): string | null {
  if (priority === null) {
    return null;
  }
  if (priority <= 1) {
    return "P0";
  }
  if (priority === 2) {
    return "P1";
  }
  return "P2";
}
