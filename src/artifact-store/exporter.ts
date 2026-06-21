import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SymphonyWorkflowConfig } from "../config/types.js";
import type { Issue } from "../domain/model.js";
import type { RunningEntry } from "../domain/model.js";
import { resolveChangeRef } from "../workflow/change-ref-path.js";
import { deriveEffectivePhase } from "../workflow/derive-effective-phase.js";
import { toChangeRef } from "./change-ref.js";
import {
  type ExportIfExportableResult,
  hasExportableContent,
  workspaceDirectoryExists,
} from "./exportable-content.js";
import { buildWorkflowManifest } from "./manifest-builder.js";
import {
  scanOpenspecChangeArtifacts,
  scanPhaseProofArtifacts,
  scanSymphonyLogs,
} from "./openspec-scan.js";
import type { ArtifactStore } from "./store.js";
import type {
  WorkflowArchivedReason,
  WorkflowMeta,
  WorkflowRuntimeSummary,
} from "./types.js";
import { parseWorkpad } from "./workpad-parser.js";

const WORKPAD_RELATIVE = ".symphony/workpad.md";

export type {
  ExportIfExportableResult,
  ExportSkipReason,
} from "./exportable-content.js";

export class WorkflowExporter {
  readonly #store: ArtifactStore;

  constructor(store: ArtifactStore) {
    this.#store = store;
  }

  isEnabled(): boolean {
    return this.#store.isEnabled();
  }

  async exportIssue(input: {
    issue: Pick<Issue, "id" | "identifier" | "title" | "priority">;
    workspacePath: string;
    running?: RunningEntry | null;
    mode?: string;
    workflow?: SymphonyWorkflowConfig | null;
    now?: Date;
    setArchivedReason?: WorkflowArchivedReason;
  }): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const now = input.now ?? new Date();
    const workpadContent = await readOptionalFile(
      join(input.workspacePath, WORKPAD_RELATIVE),
    );
    const workpad =
      workpadContent === null ? null : parseWorkpad(workpadContent);
    const changeRef =
      input.workflow !== null && input.workflow !== undefined
        ? resolveChangeRef(input.issue.identifier)
        : (workpad?.changeRef ?? toChangeRef(input.issue.identifier));

    let currentPhase:
      | Awaited<ReturnType<typeof deriveEffectivePhase>>["currentPhase"]
      | undefined;
    if (input.workflow !== null && input.workflow !== undefined) {
      const derived = await deriveEffectivePhase({
        workspacePath: input.workspacePath,
        changeRef,
        phases: input.workflow.phases,
      });
      currentPhase = derived.currentPhase;
    }

    await this.#copyLogs(input.workspacePath, input.issue.identifier);
    await this.#copyWorkflowProofs(input.workspacePath, input.issue.identifier);

    const openspecSource = join(
      input.workspacePath,
      "openspec",
      "changes",
      changeRef,
    );
    const openspecTarget = join(
      this.#store.resolveIssuePath(input.issue.identifier),
      "openspec",
      "changes",
      changeRef,
    );
    await mkdir(join(openspecTarget, ".."), { recursive: true });
    await cp(openspecSource, openspecTarget, {
      force: true,
      recursive: true,
    }).catch(() => undefined);

    const openspecArtifacts = await scanOpenspecChangeArtifacts({
      workspacePath: input.workspacePath,
      changeRef,
    });
    const logArtifacts = await scanSymphonyLogs({
      workspacePath: input.workspacePath,
    });
    const proofArtifacts = await scanPhaseProofArtifacts({
      workspacePath: input.workspacePath,
    });

    const manifest = buildWorkflowManifest({
      issueIdentifier: input.issue.identifier,
      workpad,
      ...(currentPhase !== undefined ? { currentPhase } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      runtime: runtimeFromRunning(input.running),
      openspecArtifacts: remapArtifactsForStore(
        openspecArtifacts,
        input.issue.identifier,
        changeRef,
      ),
      logArtifacts: remapLogArtifacts(logArtifacts, input.issue.identifier),
      proofArtifacts: remapProofArtifacts(
        proofArtifacts,
        input.issue.identifier,
      ),
      now,
    });

    const existingMeta = await this.#store.readMeta(input.issue.identifier);

    const meta: WorkflowMeta = {
      issue_identifier: input.issue.identifier,
      issue_id: input.issue.id,
      change_ref: changeRef,
      mode: manifest.mode,
      title: input.issue.title ?? null,
      priority: formatPriority(input.issue.priority),
      terminal_phase:
        manifest.current_phase === "done" || manifest.current_phase === "failed"
          ? manifest.current_phase
          : null,
      archived_reason:
        input.setArchivedReason ?? existingMeta?.archived_reason ?? null,
      created_at: existingMeta?.created_at ?? now.toISOString(),
      updated_at: now.toISOString(),
    };

    await this.#store.writeMeta(input.issue.identifier, meta);
    await this.#store.writeManifest(manifest);

    await writeFile(
      join(
        this.#store.resolveIssuePath(input.issue.identifier),
        WORKPAD_RELATIVE,
      ),
      workpadContent ?? "",
      "utf8",
    ).catch(() => undefined);
  }

  async exportIssueIfExportable(input: {
    issue: Pick<Issue, "id" | "identifier" | "title" | "priority">;
    workspacePath: string;
    running?: RunningEntry | null;
    mode?: string;
    workflow?: SymphonyWorkflowConfig | null;
    now?: Date;
    setArchivedReason?: WorkflowArchivedReason;
  }): Promise<ExportIfExportableResult> {
    if (!this.isEnabled()) {
      return { exported: false, reason: "disabled" };
    }

    if (!(await workspaceDirectoryExists(input.workspacePath))) {
      return { exported: false, reason: "no_workspace" };
    }

    if (
      !(await hasExportableContent(input.workspacePath, input.issue.identifier))
    ) {
      return { exported: false, reason: "empty_workspace" };
    }

    await this.exportIssue(input);
    return { exported: true };
  }

  async #copyLogs(
    workspacePath: string,
    issueIdentifier: string,
  ): Promise<void> {
    const sourceDir = join(workspacePath, ".symphony");
    const targetDir = join(
      this.#store.resolveIssuePath(issueIdentifier),
      "logs",
    );
    try {
      const entries = await readdir(sourceDir, { withFileTypes: true });
      await mkdir(targetDir, { recursive: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.startsWith("cursor-turn-")) {
          continue;
        }
        await cp(join(sourceDir, entry.name), join(targetDir, entry.name), {
          force: true,
        });
      }
    } catch {
      // logs optional
    }
  }

  async #copyWorkflowProofs(
    workspacePath: string,
    issueIdentifier: string,
  ): Promise<void> {
    const sourceDir = join(workspacePath, ".symphony", "workflow");
    const targetDir = join(
      this.#store.resolveIssuePath(issueIdentifier),
      "workflow",
    );
    await cp(sourceDir, targetDir, { force: true, recursive: true }).catch(
      () => undefined,
    );
  }
}

function runtimeFromRunning(
  running: RunningEntry | null | undefined,
): Partial<WorkflowRuntimeSummary> {
  if (running === null || running === undefined) {
    return { status: "archived" };
  }

  return {
    status: "running",
    turn_count: running.turnCount,
    last_message: running.lastCodexMessage,
    last_event: running.lastCodexEvent,
    last_event_at: running.lastCodexTimestamp,
  };
}

function formatPriority(priority: number | null | undefined): string | null {
  if (priority === null || priority === undefined) {
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

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function remapArtifactsForStore(
  artifacts: Awaited<ReturnType<typeof scanOpenspecChangeArtifacts>>,
  issueIdentifier: string,
  changeRef: string,
): typeof artifacts {
  return artifacts.map((entry) => ({
    ...entry,
    path: `openspec/changes/${changeRef}/${entry.name}`,
  }));
}

function remapLogArtifacts(
  artifacts: Awaited<ReturnType<typeof scanSymphonyLogs>>,
  _issueIdentifier: string,
): typeof artifacts {
  return artifacts.map((entry) => ({
    ...entry,
    path: entry.path.startsWith(".symphony/")
      ? `logs/${entry.name}`
      : entry.path,
  }));
}

function remapProofArtifacts(
  artifacts: Awaited<ReturnType<typeof scanPhaseProofArtifacts>>,
  _issueIdentifier: string,
): typeof artifacts {
  return artifacts.map((entry) => ({
    ...entry,
    path: entry.path.replace(/^\.symphony\/workflow\//, "workflow/"),
  }));
}
