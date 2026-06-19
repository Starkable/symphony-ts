import { normalize, resolve, sep } from "node:path";

import { toWorkspaceKey } from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";
import { WorkspacePathError } from "../workspace/path-safety.js";

export function resolveArtifactStoreRoot(storeRoot: string): string {
  return normalize(resolve(storeRoot));
}

export function resolveIssueStorePath(
  storeRoot: string,
  issueIdentifier: string,
): string {
  const normalizedRoot = resolveArtifactStoreRoot(storeRoot);
  const dirKey = toWorkspaceKey(issueIdentifier);
  if (dirKey.length === 0) {
    throw new WorkspacePathError(
      ERROR_CODES.workspacePathInvalid,
      "Issue identifier is empty.",
    );
  }

  const issuePath = normalize(resolve(normalizedRoot, dirKey));
  assertPathWithinRoot(normalizedRoot, issuePath);
  return issuePath;
}

export function resolveArtifactFilePath(input: {
  storeRoot: string;
  issueIdentifier: string;
  relativePath: string;
}): string {
  const issuePath = resolveIssueStorePath(
    input.storeRoot,
    input.issueIdentifier,
  );
  const normalizedRelative = normalize(input.relativePath.replace(/\\/g, "/"));
  if (
    normalizedRelative.startsWith("..") ||
    normalizedRelative.includes(`..${sep}`)
  ) {
    throw new WorkspacePathError(
      ERROR_CODES.workspacePathInvalid,
      "Artifact path must not contain parent segments.",
    );
  }

  const filePath = normalize(resolve(issuePath, normalizedRelative));
  assertPathWithinRoot(issuePath, filePath);
  return filePath;
}

function assertPathWithinRoot(root: string, target: string): void {
  if (target === root || target.startsWith(`${root}${sep}`)) {
    return;
  }

  throw new WorkspacePathError(
    ERROR_CODES.workspaceRootEscape,
    `Path escapes artifact store root: ${target}`,
  );
}
