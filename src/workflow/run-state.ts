import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SymphonyWorkflowConfig } from "../config/types.js";

export const RUN_STATE_RELATIVE = ".symphony/run-state.json";

export interface StageGateRecord {
  passed: boolean;
  at: string;
  message?: string;
}

export interface WorkflowRunState {
  workflowVersion: string;
  changeRef: string;
  currentStageId: string;
  complete: boolean;
  gates: Record<string, StageGateRecord>;
  manualApprovals: Record<string, boolean>;
  /** Last stage bound to harness session (V1.3 session reset). */
  lastHarnessStageId: string | null;
}

export async function readRunState(
  workspacePath: string,
): Promise<WorkflowRunState | null> {
  const path = join(workspacePath, RUN_STATE_RELATIVE);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as WorkflowRunState;
  } catch {
    return null;
  }
}

export async function writeRunState(input: {
  workspacePath: string;
  state: WorkflowRunState;
}): Promise<void> {
  const path = join(input.workspacePath, RUN_STATE_RELATIVE);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(input.state, null, 2)}\n`, "utf8");
}

export async function ensureRunState(input: {
  workspacePath: string;
  changeRef: string;
  workflow: SymphonyWorkflowConfig;
}): Promise<WorkflowRunState> {
  const existing = await readRunState(input.workspacePath);
  if (existing !== null && existing.changeRef === input.changeRef) {
    return existing;
  }

  const firstStage = input.workflow.phases[0];
  if (firstStage === undefined) {
    throw new Error("workflow has no stages");
  }

  const state: WorkflowRunState = {
    workflowVersion: input.workflow.version ?? "1.3",
    changeRef: input.changeRef,
    currentStageId: firstStage.id,
    complete: false,
    gates: {},
    manualApprovals: {},
    lastHarnessStageId: null,
  };
  await writeRunState({ workspacePath: input.workspacePath, state });
  return state;
}

export function findStageIndex(
  workflow: SymphonyWorkflowConfig,
  stageId: string,
): number {
  return workflow.phases.findIndex((phase) => phase.id === stageId);
}

export function advanceRunStateAfterGate(input: {
  state: WorkflowRunState;
  workflow: SymphonyWorkflowConfig;
  stageId: string;
  gateRecord: StageGateRecord;
}): WorkflowRunState {
  const next: WorkflowRunState = {
    ...input.state,
    gates: {
      ...input.state.gates,
      [input.stageId]: input.gateRecord,
    },
  };

  if (!input.gateRecord.passed) {
    return next;
  }

  const index = findStageIndex(input.workflow, input.stageId);
  if (index < 0) {
    return next;
  }

  const nextPhase = input.workflow.phases[index + 1];
  if (nextPhase === undefined) {
    return {
      ...next,
      complete: true,
      currentStageId: input.stageId,
    };
  }

  return {
    ...next,
    currentStageId: nextPhase.id,
  };
}

export function isRunStateComplete(state: WorkflowRunState): boolean {
  return state.complete;
}
