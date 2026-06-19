import { toChangeRef } from "./change-ref.js";
import {
  artifactsForPhaseV11,
  synthesizeReportArtifacts,
} from "./phase-artifacts.js";
import {
  type GateResult,
  PHASE_LABELS,
  type PhaseStatus,
  type V1BusinessPhase,
  type V1PhaseId,
  V1_BUSINESS_PHASES,
  type WorkflowArtifactEntry,
  type WorkflowGate,
  type WorkflowManifest,
  type WorkflowPhaseEntry,
  type WorkflowRuntimeSummary,
} from "./types.js";
import type { ParsedWorkpad } from "./workpad-parser.js";

/** V1.1 gate mapping: C0 clarify→review, P2 review→plan, P1 plan→execute, V1 verify→archive */
const PHASE_GATE_MAP: Partial<Record<V1BusinessPhase, string>> = {
  clarify: "C0",
  proposal_review: "P2",
  plan: "P1",
  verify: "V1",
};

export function buildWorkflowManifest(input: {
  issueIdentifier: string;
  workpad?: ParsedWorkpad | null;
  currentPhase?: V1PhaseId;
  mode?: string;
  runtime?: Partial<WorkflowRuntimeSummary>;
  openspecArtifacts: WorkflowArtifactEntry[];
  logArtifacts: WorkflowArtifactEntry[];
  proofArtifacts: WorkflowArtifactEntry[];
  now?: Date;
}): WorkflowManifest {
  const now = (input.now ?? new Date()).toISOString();
  const workpad = input.workpad ?? emptyWorkpad();
  const changeRef = workpad.changeRef ?? toChangeRef(input.issueIdentifier);
  const currentPhase = input.currentPhase ?? normalizePhase(workpad.phase);
  const synthesizedReports = synthesizeReportArtifacts(workpad);
  const phases = buildPhaseEntries({
    currentPhase,
    workpad,
    openspecArtifacts: input.openspecArtifacts,
    proofArtifacts: input.proofArtifacts,
    synthesizedReports,
    now: input.now ?? new Date(),
  });

  return {
    issue_identifier: input.issueIdentifier,
    change_ref: changeRef,
    mode: workpad.mode ?? input.mode ?? "v1-openspec",
    current_phase: currentPhase,
    updated_at: now,
    phases,
    runtime: {
      status: input.runtime?.status ?? "idle",
      turn_count: input.runtime?.turn_count ?? null,
      last_message: input.runtime?.last_message ?? null,
      last_event: input.runtime?.last_event ?? null,
      last_event_at: input.runtime?.last_event_at ?? null,
    },
  };
}

function emptyWorkpad(): ParsedWorkpad {
  return {
    phase: null,
    changeRef: null,
    mode: null,
    gates: {},
    notes: [],
    reviewReport: null,
    verificationReport: null,
  };
}

function normalizePhase(phase: string | null): V1PhaseId {
  if (phase === null) {
    return "clarify";
  }
  const normalized = phase.toLowerCase();
  if (
    normalized === "done" ||
    normalized === "failed" ||
    (V1_BUSINESS_PHASES as readonly string[]).includes(normalized)
  ) {
    return normalized as V1PhaseId;
  }
  return "clarify";
}

function buildPhaseEntries(input: {
  currentPhase: V1PhaseId;
  workpad: ParsedWorkpad;
  openspecArtifacts: WorkflowArtifactEntry[];
  proofArtifacts: WorkflowArtifactEntry[];
  synthesizedReports: WorkflowArtifactEntry[];
  now: Date;
}): WorkflowPhaseEntry[] {
  const currentIndex =
    input.currentPhase === "done" || input.currentPhase === "failed"
      ? V1_BUSINESS_PHASES.length
      : V1_BUSINESS_PHASES.indexOf(input.currentPhase as V1BusinessPhase);

  return V1_BUSINESS_PHASES.map((phaseId, index) => {
    const status = derivePhaseStatus(index, currentIndex, input.currentPhase);
    const gate = buildGate(phaseId, input.workpad);
    return {
      id: phaseId,
      label: PHASE_LABELS[phaseId],
      status,
      gate,
      artifacts: artifactsForPhaseV11(phaseId, {
        openspecArtifacts: input.openspecArtifacts,
        proofArtifacts: input.proofArtifacts,
        synthesizedReports: input.synthesizedReports,
        workpad: input.workpad,
      }),
      started_at: derivePhaseStartedAt(phaseId, index, currentIndex, gate),
      completed_at: derivePhaseCompletedAt(status, gate, input.now),
    };
  });
}

function derivePhaseStatus(
  phaseIndex: number,
  currentIndex: number,
  currentPhase: V1PhaseId,
): PhaseStatus {
  if (currentPhase === "failed") {
    if (phaseIndex < currentIndex) {
      return "completed";
    }
    if (phaseIndex === currentIndex) {
      return "failed";
    }
    return "pending";
  }

  if (currentPhase === "done") {
    return "completed";
  }

  if (phaseIndex < currentIndex) {
    return "completed";
  }
  if (phaseIndex === currentIndex) {
    return "in_progress";
  }
  return "pending";
}

function derivePhaseStartedAt(
  _phaseId: V1BusinessPhase,
  _phaseIndex: number,
  _currentIndex: number,
  gate: WorkflowGate | null,
): string | null {
  if (gate?.at !== null && gate?.at !== undefined) {
    return gate.at;
  }
  return null;
}

function derivePhaseCompletedAt(
  status: PhaseStatus,
  gate: WorkflowGate | null,
  now: Date,
): string | null {
  if (status === "completed" && gate?.result === "pass" && gate.at !== null) {
    return gate.at;
  }
  if (status === "completed") {
    return now.toISOString();
  }
  return null;
}

function buildGate(
  phaseId: V1BusinessPhase,
  workpad: ParsedWorkpad,
): WorkflowGate | null {
  const gateId = PHASE_GATE_MAP[phaseId];
  if (gateId === undefined) {
    return null;
  }

  const entry = workpad.gates[gateId];
  const result: GateResult =
    entry?.result === "pass" || entry?.result === "fail"
      ? entry.result
      : "pending";

  return {
    id: gateId,
    result,
    at: entry?.at ?? null,
  };
}
