import type { SymphonyWorkflowConfig } from "../config/types.js";
import { runStageGates } from "./gate-runner.js";
import {
  advanceRunStateAfterGate,
  readRunState,
  writeRunState,
  type WorkflowRunState,
} from "./run-state.js";

export interface V13TurnEndResult {
  gatePassed: boolean;
  stageAdvanced: boolean;
  workflowComplete: boolean;
  intakeRejected: boolean;
  previousStageId: string | null;
  currentStageId: string | null;
  gateMessage: string;
}

export async function processV13TurnEnd(input: {
  workspacePath: string;
  changeRef: string;
  workflow: SymphonyWorkflowConfig;
}): Promise<V13TurnEndResult> {
  const state = await readRunState(input.workspacePath);
  if (state === null || state.complete) {
    return {
      gatePassed: true,
      stageAdvanced: false,
      workflowComplete: state?.complete === true,
      intakeRejected: false,
      previousStageId: null,
      currentStageId: state?.currentStageId ?? null,
      gateMessage: "no active run state",
    };
  }

  const previousStageId = state.currentStageId;
  const phase = input.workflow.phases.find(
    (entry) => entry.id === state.currentStageId,
  );
  if (phase === undefined) {
    return {
      gatePassed: false,
      stageAdvanced: false,
      workflowComplete: false,
      intakeRejected: false,
      previousStageId,
      currentStageId: state.currentStageId,
      gateMessage: "unknown stage",
    };
  }

  const gateResult = await runStageGates({
    workspacePath: input.workspacePath,
    changeRef: input.changeRef,
    phase,
    manualApprovals: state.manualApprovals,
  });

  const intakeRejected = gateResult.intakeRejected === true;

  if (!gateResult.passed) {
    const failedState: WorkflowRunState = {
      ...state,
      gates: {
        ...state.gates,
        [phase.id]: {
          passed: false,
          at: new Date().toISOString(),
          message: gateResult.message,
        },
      },
    };
    await writeRunState({
      workspacePath: input.workspacePath,
      state: failedState,
    });

    return {
      gatePassed: false,
      stageAdvanced: false,
      workflowComplete: false,
      intakeRejected,
      previousStageId,
      currentStageId: state.currentStageId,
      gateMessage: gateResult.message,
    };
  }

  const advanced = advanceRunStateAfterGate({
    state,
    workflow: input.workflow,
    stageId: phase.id,
    gateRecord: {
      passed: true,
      at: new Date().toISOString(),
      message: gateResult.message,
    },
  });

  const nextState: WorkflowRunState = {
    ...advanced,
    lastHarnessStageId: phase.id,
  };
  await writeRunState({ workspacePath: input.workspacePath, state: nextState });

  const stageAdvanced = nextState.currentStageId !== previousStageId;

  return {
    gatePassed: true,
    stageAdvanced,
    workflowComplete: nextState.complete,
    intakeRejected: false,
    previousStageId,
    currentStageId: nextState.currentStageId,
    gateMessage: gateResult.message,
  };
}
