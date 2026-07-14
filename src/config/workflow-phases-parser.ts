import { ERROR_CODES } from "../errors/codes.js";
import { validateSkillNameFormat } from "../workflow/validate-workspace-skills.js";
import type { SymphonyWorkflowConfig, WorkflowPhaseConfig } from "./types.js";

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

    const produces = readNonEmptyString(phaseRecord.produces);
    if (produces === null) {
      throw new WorkflowPhasesParseError(
        `workflow.phases[${index}].produces must be a non-empty string.`,
      );
    }

    phases.push({
      id,
      skill,
      produces,
      requiresPass: readBoolean(phaseRecord.requires_pass) ?? false,
    });
  }

  if (phases.length === 0) {
    throw new WorkflowPhasesParseError(
      "workflow.phases must contain at least one phase when workflow is configured.",
    );
  }

  return {
    version: readString(record.version),
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
