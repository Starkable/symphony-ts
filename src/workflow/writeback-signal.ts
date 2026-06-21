import type { SymphonyWorkflowConfig } from "../config/types.js";
import { resolveChangeRef } from "./change-ref-path.js";
import { deriveEffectivePhase } from "./derive-effective-phase.js";
import { parseWorkpadWritebackSignal } from "./workpad-writeback-signal.js";

export type WritebackSignalSource = "workpad" | "artifact_v12" | "none";

export type ResolvedWritebackSignal =
  | { kind: "clarify_blocked"; commentBody: string; source: "workpad" }
  | { kind: "done"; source: "workpad" | "artifact_v12" }
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
