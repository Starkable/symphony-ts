import { ERROR_CODES } from "../errors/codes.js";
import { defaultV13PrimaryOutputLogicalName } from "../workflow/v13-stage-catalog.js";
import { validateSkillNameFormat } from "../workflow/validate-workspace-skills.js";
import type {
  SymphonyWorkflowConfig,
  WorkflowDomain,
  WorkflowGateKind,
  WorkflowPhaseConfig,
} from "./types.js";

export class WorkflowPhasesParseError extends Error {
  readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = "WorkflowPhasesParseError";
    this.code = ERROR_CODES.configInvalid;
  }
}

export function parseSymphonyWorkflowConfig(
  raw: unknown,
): SymphonyWorkflowConfig | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const record = asRecord(raw);
  if (record === null) {
    throw new WorkflowPhasesParseError(
      "workflow must decode to a map/object when present.",
    );
  }

  const phasesRaw = record.phases;
  if (phasesRaw === null || phasesRaw === undefined) {
    return null;
  }

  if (!Array.isArray(phasesRaw)) {
    throw new WorkflowPhasesParseError("workflow.phases must be an array.");
  }

  const version = readString(record.version);
  const isV13 = version === "1.3";

  const phases: WorkflowPhaseConfig[] = [];
  const seenIds = new Set<string>();

  for (const [index, entry] of phasesRaw.entries()) {
    const phaseRecord = asRecord(entry);
    if (phaseRecord === null) {
      throw new WorkflowPhasesParseError(
        `workflow.phases[${index}] must be a map/object.`,
      );
    }

    const id = readNonEmptyString(phaseRecord.id);
    if (id === null) {
      throw new WorkflowPhasesParseError(
        `workflow.phases[${index}].id must be a non-empty string.`,
      );
    }

    if (seenIds.has(id)) {
      throw new WorkflowPhasesParseError(
        `workflow.phases contains duplicate id '${id}'.`,
      );
    }
    seenIds.add(id);

    const skill = readPhaseSkill(phaseRecord, index);
    const skillFormatError = validateSkillNameFormat(skill);
    if (skillFormatError !== null) {
      throw new WorkflowPhasesParseError(
        `workflow.phases[${index}].skill: ${skillFormatError}`,
      );
    }

    const producesRaw = readNonEmptyString(phaseRecord.produces);
    const produces =
      producesRaw ??
      (isV13
        ? `artifacts/{change_ref}/${defaultV13PrimaryOutputLogicalName(id)}`
        : null);
    if (produces === null) {
      throw new WorkflowPhasesParseError(
        `workflow.phases[${index}].produces must be a non-empty string.`,
      );
    }

    const phase: WorkflowPhaseConfig = {
      id,
      skill,
      produces,
      requiresPass: readBoolean(phaseRecord.requires_pass) ?? false,
    };
    if (isV13) {
      const domain = readDomain(phaseRecord.domain);
      if (domain !== undefined) {
        phase.domain = domain;
      }
      const readsFrom = readStringArray(phaseRecord.reads_from);
      if (readsFrom !== undefined) {
        phase.readsFrom = readsFrom;
      }
      const outputSchema = readString(phaseRecord.output_schema);
      if (outputSchema !== null) {
        phase.outputSchema = outputSchema;
      }
      const outputs = readStringArray(phaseRecord.outputs);
      if (outputs !== undefined) {
        phase.outputs = outputs;
      }
      const gates = readGateKinds(phaseRecord.gates);
      if (gates !== undefined) {
        phase.gates = gates;
      }
      const shellCommand = readString(phaseRecord.shell_command);
      if (shellCommand !== null) {
        phase.shellCommand = shellCommand;
      }
    }
    phases.push(phase);
  }

  if (phases.length === 0) {
    throw new WorkflowPhasesParseError(
      "workflow.phases must contain at least one phase when workflow is configured.",
    );
  }

  return {
    version,
    changeRefStrategy: readString(record.change_ref),
    phases,
  };
}

export function validateSymphonyWorkflowConfig(
  workflow: SymphonyWorkflowConfig,
): string | null {
  for (const phase of workflow.phases) {
    if (phase.id.trim() === "") {
      return "workflow phase id must be non-empty.";
    }
    const skillError = validateSkillNameFormat(phase.skill ?? "");
    if (skillError !== null) {
      return skillError;
    }
    if ((phase.skill ?? "").trim() === "") {
      return "workflow phase skill must be non-empty.";
    }
    if (phase.produces.trim() === "") {
      return "workflow phase produces must be non-empty.";
    }
  }
  return null;
}

function readPhaseSkill(
  phaseRecord: Record<string, unknown>,
  index: number,
): string {
  const skill = readNonEmptyString(phaseRecord.skill);
  if (skill !== null) {
    return skill;
  }

  if (readNonEmptyString(phaseRecord.handler) !== null) {
    throw new WorkflowPhasesParseError(
      `workflow.phases[${index}].handler is no longer supported; use skill with an Agent skill id.`,
    );
  }

  throw new WorkflowPhasesParseError(
    `workflow.phases[${index}].skill must be a non-empty string.`,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  return readString(value);
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

function readDomain(value: unknown): WorkflowDomain | undefined {
  if (value === "analysis" || value === "implement") {
    return value;
  }
  return undefined;
}

const GATE_KINDS = new Set<WorkflowGateKind>([
  "schema_valid",
  "shell",
  "manual",
  "optional_output",
]);

function readGateKinds(value: unknown): WorkflowGateKind[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const gates: WorkflowGateKind[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && GATE_KINDS.has(entry as WorkflowGateKind)) {
      gates.push(entry as WorkflowGateKind);
    }
  }
  return gates.length > 0 ? gates : undefined;
}
