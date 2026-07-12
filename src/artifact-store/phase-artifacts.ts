import type { ResolvedPhaseManifest } from "../workflow/resolve-phase-manifest.js";
import type { V1BusinessPhase, WorkflowArtifactEntry } from "./types.js";
import type { ParsedWorkpad } from "./workpad-parser.js";

export const ARTIFACT_DISPLAY_NAMES: Record<string, string> = {
  "proposal.md": "需求提案",
  "proposal_review.md": "提案评审",
  "tasks.md": "任务清单",
  "execute.md": "执行记录",
  "verification.md": "验证报告",
  "archive.md": "归档说明",
  "评审报告.md": "评审报告",
  "验证报告.md": "验证报告",
  "归档报告.md": "归档说明",
  "synthetic://review-report": "评审报告",
  "synthetic://verification-report": "验证报告",
  "synthetic://archive-report": "归档说明",
};

const V12_PHASE_ARTIFACTS: Record<V1BusinessPhase, string[]> = {
  clarify: ["proposal.md"],
  proposal_review: ["proposal_review.md"],
  plan: ["tasks.md"],
  execute: ["execute.md"],
  verify: ["verification.md"],
  archive: ["archive.md"],
};

export const GATE_LABELS: Record<string, string> = {
  C0: "澄清门禁",
  P1: "规划门禁",
  P2: "评审门禁",
  V1: "验证门禁",
};

export function withDisplayName(
  entry: WorkflowArtifactEntry,
): WorkflowArtifactEntry {
  const displayName =
    entry.display_name ??
    ARTIFACT_DISPLAY_NAMES[entry.name] ??
    ARTIFACT_DISPLAY_NAMES[entry.path] ??
    entry.name;
  return {
    ...entry,
    display_name: displayName,
  };
}

export function synthesizeReportArtifacts(
  workpad: ParsedWorkpad,
): WorkflowArtifactEntry[] {
  const artifacts: WorkflowArtifactEntry[] = [];
  const notesText = workpad.notes.join("\n");

  if (workpad.reviewReport !== null) {
    artifacts.push({
      name: "synthetic://review-report",
      display_name: "评审报告",
      type: "MD",
      path: "synthetic://review-report",
      size_bytes: notesText.length,
      summary: workpad.reviewReport,
      updated_at: null,
    });
  }

  if (workpad.verificationReport !== null) {
    artifacts.push({
      name: "synthetic://verification-report",
      display_name: "验证报告",
      type: "MD",
      path: "synthetic://verification-report",
      size_bytes: notesText.length,
      summary: workpad.verificationReport,
      updated_at: null,
    });
  }

  return artifacts;
}

export function artifactsForPhaseV11(
  phaseId: V1BusinessPhase,
  input: {
    openspecArtifacts: WorkflowArtifactEntry[];
    proofArtifacts: WorkflowArtifactEntry[];
    synthesizedReports: WorkflowArtifactEntry[];
    workpad: ParsedWorkpad;
    useV12Artifacts?: boolean;
  },
): WorkflowArtifactEntry[] {
  if (input.useV12Artifacts ?? hasV12Artifacts(input.openspecArtifacts)) {
    return artifactsForPhaseV12(phaseId, input.openspecArtifacts);
  }

  const proposal = input.openspecArtifacts.find(
    (entry) => entry.name === "proposal.md",
  );
  const tasks = input.openspecArtifacts.find(
    (entry) => entry.name === "tasks.md",
  );
  const reviewProofs = input.proofArtifacts.filter(
    (entry) =>
      entry.path.includes("/phases/proposal_review/") ||
      entry.name.includes("评审报告"),
  );
  const verifyProofs = input.proofArtifacts.filter(
    (entry) =>
      entry.path.includes("/phases/verify/") || entry.name.includes("验证报告"),
  );
  const archiveProofs = input.proofArtifacts.filter(
    (entry) =>
      entry.path.includes("/phases/archive/") ||
      entry.name.includes("归档报告"),
  );
  const reviewSynthetic = input.synthesizedReports.filter((entry) =>
    entry.path.includes("review-report"),
  );
  const verifySynthetic = input.synthesizedReports.filter((entry) =>
    entry.path.includes("verification-report"),
  );

  switch (phaseId) {
    case "clarify":
      return proposal !== undefined ? [withDisplayName(proposal)] : [];
    case "proposal_review":
      return [...reviewProofs, ...reviewSynthetic].map(withDisplayName);
    case "plan":
      return tasks !== undefined ? [withDisplayName(tasks)] : [];
    case "execute":
      return [];
    case "verify":
      return [...verifyProofs, ...verifySynthetic].map(withDisplayName);
    case "archive":
      return archiveProofs.map(withDisplayName);
    default:
      return [];
  }
}

export function artifactsForPhaseFromConfig(
  phaseId: V1BusinessPhase,
  manifest: ResolvedPhaseManifest,
  openspecArtifacts: WorkflowArtifactEntry[],
): WorkflowArtifactEntry[] {
  const phaseEntry = manifest.phases.find((entry) => entry.id === phaseId);
  if (phaseEntry === undefined) {
    return artifactsForPhaseV12(phaseId, openspecArtifacts);
  }

  return openspecArtifacts
    .filter(
      (entry) =>
        entry.name === phaseEntry.primaryArtifactName ||
        entry.path.endsWith(`/${phaseEntry.primaryArtifactName}`),
    )
    .map(withDisplayName);
}

export function artifactsForPhaseV12(
  phaseId: V1BusinessPhase,
  openspecArtifacts: WorkflowArtifactEntry[],
): WorkflowArtifactEntry[] {
  const expectedNames = V12_PHASE_ARTIFACTS[phaseId];
  return openspecArtifacts
    .filter((entry) => expectedNames.includes(entry.name))
    .map(withDisplayName);
}

function hasV12Artifacts(openspecArtifacts: WorkflowArtifactEntry[]): boolean {
  return openspecArtifacts.some((entry) =>
    [
      "proposal_review.md",
      "execute.md",
      "verification.md",
      "archive.md",
    ].includes(entry.name),
  );
}

export function formatGateLabel(gateId: string, result: string): string {
  const label = GATE_LABELS[gateId] ?? gateId;
  const resultLabel =
    result === "pass" ? "已通过" : result === "fail" ? "未通过" : "待通过";
  return `${label} (${gateId})：${resultLabel}`;
}

export function formatRuntimeStatus(status: string): string {
  switch (status) {
    case "running":
      return "运行中";
    case "retry_queued":
      return "等待重试";
    case "archived":
      return "已归档";
    case "idle":
      return "空闲";
    default:
      return status;
  }
}

export function buildSyntheticArtifactContent(
  path: string,
  workpad: ParsedWorkpad,
): string | null {
  if (path.includes("review-report")) {
    if (workpad.reviewReport === null) {
      return null;
    }
    return `# 评审报告\n\n**结论**：${workpad.reviewReport}\n\n## Notes\n\n${workpad.notes.map((line) => `- ${line}`).join("\n")}\n`;
  }
  if (path.includes("verification-report")) {
    if (workpad.verificationReport === null) {
      return null;
    }
    return `# 验证报告\n\n**结论**：${workpad.verificationReport}\n\n## Notes\n\n${workpad.notes.map((line) => `- ${line}`).join("\n")}\n`;
  }
  return null;
}
