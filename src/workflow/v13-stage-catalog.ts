import type { WorkflowPhaseConfig } from "../config/types.js";
import { defaultOutputLogicalName } from "./artifact-path-resolver.js";

/** Chinese descriptions for default V1.3 artifact logical names. */
export const V13_ARTIFACT_MEANINGS: Record<string, string> = {
  "review.json": "工单准入评审结论（是否批准进入发现阶段）",
  "discover.json": "关联服务与 codebase 发现结论",
  "scope.json": "多仓范围与 repo 映射",
  "spec.json": "需求说明与验收标准",
  "spec_review.json": "规格评审记录",
  "implement.json": "实现阶段操作与变更摘要",
  "verify.json": "验证阶段结果记录",
};

const DEFAULT_OUTPUTS_BY_STAGE: Record<string, string[]> = {
  intake_review: ["review.json"],
  discover: ["discover.json", "scope.json"],
  spec: ["spec.json"],
  spec_review: ["spec_review.json"],
  implement: ["implement.json"],
  verify: ["verify.json"],
};

const DEFAULT_READS_BY_STAGE: Record<string, string[]> = {
  intake_review: [],
  discover: ["review.json"],
  spec: ["discover.json", "scope.json"],
  spec_review: ["discover.json", "scope.json", "spec.json"],
  implement: ["discover.json", "scope.json", "spec.json"],
  verify: ["spec.json", "implement.json"],
};

const DEFAULT_GATES_BY_STAGE: Record<
  string,
  import("../config/types.js").WorkflowGateKind[]
> = {
  intake_review: ["schema_valid"],
  discover: ["schema_valid"],
  spec: ["schema_valid"],
  spec_review: ["schema_valid", "manual"],
  implement: ["schema_valid"],
  verify: ["shell"],
};

/** Primary deliverable logical name for V1.3 default `produces` path (aligns with catalog). */
export function defaultV13PrimaryOutputLogicalName(stageId: string): string {
  const defaults = DEFAULT_OUTPUTS_BY_STAGE[stageId];
  if (defaults !== undefined && defaults.length > 0) {
    return defaults[0]!;
  }
  return defaultOutputLogicalName(stageId);
}

export function resolvePhaseOutputs(phase: WorkflowPhaseConfig): string[] {
  if (phase.outputs !== undefined && phase.outputs.length > 0) {
    return [...phase.outputs];
  }
  const defaults = DEFAULT_OUTPUTS_BY_STAGE[phase.id];
  if (defaults !== undefined) {
    return [...defaults];
  }
  return [defaultOutputLogicalName(phase.id)];
}

export function resolvePhaseReadsFrom(phase: WorkflowPhaseConfig): string[] {
  if (phase.readsFrom !== undefined) {
    return [...phase.readsFrom];
  }
  return [...(DEFAULT_READS_BY_STAGE[phase.id] ?? [])];
}

export function resolvePhaseGates(
  phase: WorkflowPhaseConfig,
): import("../config/types.js").WorkflowGateKind[] {
  if (phase.gates !== undefined && phase.gates.length > 0) {
    return [...phase.gates];
  }
  return [...(DEFAULT_GATES_BY_STAGE[phase.id] ?? ["schema_valid"])];
}

export function artifactMeaning(logicalName: string): string {
  return V13_ARTIFACT_MEANINGS[logicalName] ?? "阶段产物文件";
}
