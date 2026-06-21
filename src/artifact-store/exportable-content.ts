import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { resolveChangeRef } from "../workflow/change-ref-path.js";
import {
  scanOpenspecChangeArtifacts,
  scanSymphonyLogs,
} from "./openspec-scan.js";

const WORKPAD_RELATIVE = ".symphony/workpad.md";

export type ExportSkipReason = "disabled" | "no_workspace" | "empty_workspace";

export interface ExportIfExportableResult {
  exported: boolean;
  reason?: ExportSkipReason;
}

export async function workspaceDirectoryExists(
  workspacePath: string,
): Promise<boolean> {
  try {
    const current = await lstat(workspacePath);
    return current.isDirectory();
  } catch {
    return false;
  }
}

export async function hasExportableContent(
  workspacePath: string,
  issueIdentifier?: string,
): Promise<boolean> {
  if (!(await workspaceDirectoryExists(workspacePath))) {
    return false;
  }

  const workpadContent = await readOptionalFile(
    join(workspacePath, WORKPAD_RELATIVE),
  );
  if (workpadContent !== null && workpadContent.trim().length > 0) {
    return true;
  }

  const logArtifacts = await scanSymphonyLogs({ workspacePath });
  if (logArtifacts.length > 0) {
    return true;
  }

  if (issueIdentifier !== undefined) {
    const changeRef = resolveChangeRef(issueIdentifier);
    const openspecArtifacts = await scanOpenspecChangeArtifacts({
      workspacePath,
      changeRef,
    });
    if (openspecArtifacts.length > 0) {
      return true;
    }
  }

  const changesRoot = join(workspacePath, "openspec", "changes");
  try {
    const entries = await readdir(changesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "archive") {
        continue;
      }
      const openspecArtifacts = await scanOpenspecChangeArtifacts({
        workspacePath,
        changeRef: entry.name,
      });
      if (openspecArtifacts.length > 0) {
        return true;
      }
    }
  } catch {
    // openspec/changes optional
  }

  return false;
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}
