import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type ArtifactPassStatus = "pass" | "fail" | null;

export interface ArtifactCompletionResult {
  exists: boolean;
  status: ArtifactPassStatus;
  complete: boolean;
}

/** Parse YAML front matter `status` from a markdown file body. */
export function parseFrontMatterStatus(content: string): ArtifactPassStatus {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return null;
  }

  const closingIndex = trimmed.indexOf("\n---", 3);
  if (closingIndex === -1) {
    return null;
  }

  const frontMatter = trimmed.slice(3, closingIndex);
  const statusMatch = frontMatter.match(/^status:\s*(pass|fail)\s*$/im);
  if (statusMatch === null || statusMatch[1] === undefined) {
    return null;
  }

  return statusMatch[1].toLowerCase() as "pass" | "fail";
}

export async function evaluateArtifactCompletion(input: {
  workspacePath: string;
  relativePath: string;
  requiresPass: boolean;
}): Promise<ArtifactCompletionResult> {
  const absolutePath = join(input.workspacePath, input.relativePath);

  try {
    const info = await stat(absolutePath);
    if (!info.isFile()) {
      return { exists: false, status: null, complete: false };
    }
  } catch {
    return { exists: false, status: null, complete: false };
  }

  if (!input.requiresPass) {
    return { exists: true, status: null, complete: true };
  }

  const content = await readFile(absolutePath, "utf8");
  const status = parseFrontMatterStatus(content);
  return {
    exists: true,
    status,
    complete: status === "pass",
  };
}

export function evaluateArtifactCompletionFromContent(input: {
  content: string;
  requiresPass: boolean;
}): ArtifactCompletionResult {
  if (!input.requiresPass) {
    return { exists: true, status: null, complete: true };
  }

  const status = parseFrontMatterStatus(input.content);
  return {
    exists: true,
    status,
    complete: status === "pass",
  };
}
