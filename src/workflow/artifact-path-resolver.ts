import { join } from "node:path";

/** Relative path to artifact file under workspace. */
export function resolveArtifactRelativePath(input: {
  changeRef: string;
  logicalName: string;
}): string {
  const safeName = input.logicalName.replace(/\\/g, "/").replace(/^\/+/, "");
  return join("artifacts", input.changeRef, safeName).replace(/\\/g, "/");
}

export function resolveArtifactAbsolutePath(input: {
  workspacePath: string;
  changeRef: string;
  logicalName: string;
}): string {
  return join(
    input.workspacePath,
    resolveArtifactRelativePath({
      changeRef: input.changeRef,
      logicalName: input.logicalName,
    }),
  );
}

/** Default deliverable logical name for a stage when not configured. */
export function defaultOutputLogicalName(stageId: string): string {
  return `${stageId}.json`;
}
