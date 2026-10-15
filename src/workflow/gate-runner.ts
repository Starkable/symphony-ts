import { access, readFile } from "node:fs/promises";

import type { WorkflowPhaseConfig } from "../config/types.js";
import { resolveArtifactAbsolutePath } from "./artifact-path-resolver.js";
import {
  resolvePhaseGates,
  resolvePhaseOutputs,
} from "./v13-stage-catalog.js";

export const GATE_INTAKE_REJECTED_MESSAGE = "intake review rejected";

export interface GateRunResult {
  passed: boolean;
  message: string;
  intakeRejected?: boolean;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(path: string): Promise<unknown | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function validateReviewSchema(data: unknown): GateRunResult {
  if (typeof data !== "object" || data === null) {
    return { passed: false, message: "review.json must be a JSON object" };
  }
  const status = (data as { status?: string }).status;
  if (status !== "approved" && status !== "rejected") {
    return {
      passed: false,
      message: "review.json status must be approved or rejected",
    };
  }
  if (status === "rejected") {
    return {
      passed: false,
      message: GATE_INTAKE_REJECTED_MESSAGE,
      intakeRejected: true,
    };
  }
  return { passed: true, message: "intake review approved" };
}

async function runSchemaValidGate(input: {
  workspacePath: string;
  changeRef: string;
  phase: WorkflowPhaseConfig;
}): Promise<GateRunResult> {
  const outputs = resolvePhaseOutputs(input.phase);
  for (const logicalName of outputs) {
    const absolute = resolveArtifactAbsolutePath({
      workspacePath: input.workspacePath,
      changeRef: input.changeRef,
      logicalName,
    });
    if (!(await fileExists(absolute))) {
      return {
        passed: false,
        message: `missing deliverable ${logicalName}`,
      };
    }
    const data = await readJsonFile(absolute);
    if (data === null) {
      return {
        passed: false,
        message: `${logicalName} is not valid JSON`,
      };
    }
    if (input.phase.id === "intake_review" && logicalName === "review.json") {
      const reviewResult = validateReviewSchema(data);
      if (!reviewResult.passed) {
        return reviewResult;
      }
    }
  }
  return { passed: true, message: "schema_valid ok" };
}

async function runShellGate(input: {
  phase: WorkflowPhaseConfig;
}): Promise<GateRunResult> {
  const command = input.phase.shellCommand?.trim();
  if (command === undefined || command.length === 0) {
    return {
      passed: false,
      message: "shell gate requires shell_command on stage",
    };
  }
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  try {
    await execFileAsync(command, { shell: true, timeout: 600_000 });
    return { passed: true, message: "shell gate exit 0" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "shell gate failed";
    return { passed: false, message };
  }
}

function runManualGate(input: {
  stageId: string;
  manualApprovals: Record<string, boolean>;
}): GateRunResult {
  if (input.manualApprovals[input.stageId] === true) {
    return { passed: true, message: "manual approved" };
  }
  return { passed: false, message: "manual approval pending" };
}

export async function runStageGates(input: {
  workspacePath: string;
  changeRef: string;
  phase: WorkflowPhaseConfig;
  manualApprovals: Record<string, boolean>;
}): Promise<GateRunResult> {
  const gates = resolvePhaseGates(input.phase);

  for (const gate of gates) {
    let result: GateRunResult;
    switch (gate) {
      case "schema_valid":
        result = await runSchemaValidGate({
          workspacePath: input.workspacePath,
          changeRef: input.changeRef,
          phase: input.phase,
        });
        break;
      case "shell":
        result = await runShellGate({ phase: input.phase });
        break;
      case "manual":
        result = runManualGate({
          stageId: input.phase.id,
          manualApprovals: input.manualApprovals,
        });
        break;
      case "optional_output":
        result = { passed: true, message: "optional_output" };
        break;
      default:
        result = { passed: false, message: `unknown gate ${gate}` };
    }
    if (!result.passed) {
      return result;
    }
  }

  return { passed: true, message: "all gates passed" };
}
