import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SymphonyWorkflowConfig } from "../config/types.js";
import { resolveArtifactAbsolutePath } from "./artifact-path-resolver.js";
import { resolveChangeRef } from "./change-ref-path.js";
import { deriveEffectivePhase } from "./derive-effective-phase.js";
import { isV13WorkflowComplete } from "./workflow-dispatch-v13.js";
import { isWorkflowV13 } from "./workflow-version.js";
import { parseWorkpadWritebackSignal } from "./workpad-writeback-signal.js";

export type WritebackSignalSource =
  | "workpad"
  | "artifact_v12"
  | "artifact_v13"
  | "none";

export type ResolvedWritebackSignal =
  | { kind: "clarify_blocked"; commentBody: string; source: "workpad" }
  | {
      kind: "intake_rejected";
      commentBody: string;
      source: "artifact_v13";
    }
  | { kind: "done"; source: "workpad" | "artifact_v12" | "artifact_v13" }
  | { kind: "none"; source: "none" };

export async function resolveWritebackSignal(input: {
  workpadContent: string | null;
  workspacePath: string;
  issueIdentifier: string;
  workflow: SymphonyWorkflowConfig | null;
}): Promise<ResolvedWritebackSignal> {
  if (input.workpadContent !== null) {
    const workpadSignal = parseWorkpadWritebackSignal(input.workpadContent);
    if (workpadSignal.kind === "clarify_blocked") {
      return { ...workpadSignal, source: "workpad" };
    }
    if (workpadSignal.kind === "done") {
      return { kind: "done", source: "workpad" };
    }
  }

  const phases = input.workflow?.phases ?? [];
  if (phases.length === 0) {
    return { kind: "none", source: "none" };
  }

  const changeRef = resolveChangeRef(input.issueIdentifier);

  if (isWorkflowV13(input.workflow)) {
    const rejected = await readIntakeRejectedComment({
      workspacePath: input.workspacePath,
      changeRef,
    });
    if (rejected !== null) {
      return {
        kind: "intake_rejected",
        commentBody: rejected,
        source: "artifact_v13",
      };
    }

    if (
      await isV13WorkflowComplete({ workspacePath: input.workspacePath })
    ) {
      return { kind: "done", source: "artifact_v13" };
    }

    return { kind: "none", source: "none" };
  }

  const derived = await deriveEffectivePhase({
    workspacePath: input.workspacePath,
    changeRef,
    phases,
  });

  if (derived.allComplete) {
    return { kind: "done", source: "artifact_v12" };
  }

  return { kind: "none", source: "none" };
}

export async function isV13IntakeRejected(input: {
  workspacePath: string;
  issueIdentifier: string;
}): Promise<boolean> {
  const changeRef = resolveChangeRef(input.issueIdentifier);
  const comment = await readIntakeRejectedComment({
    workspacePath: input.workspacePath,
    changeRef,
  });
  return comment !== null;
}

async function readIntakeRejectedComment(input: {
  workspacePath: string;
  changeRef: string;
}): Promise<string | null> {
  const path = resolveArtifactAbsolutePath({
    workspacePath: input.workspacePath,
    changeRef: input.changeRef,
    logicalName: "review.json",
  });
  try {
    const raw = await readFile(path, "utf8");
    const data = JSON.parse(raw) as { status?: string; comment?: string };
    if (data.status === "rejected") {
      return data.comment?.trim() || "intake review rejected";
    }
  } catch {
    return null;
  }
  return null;
}
