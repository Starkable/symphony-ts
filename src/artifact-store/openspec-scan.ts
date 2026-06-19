import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import type { WorkflowArtifactEntry } from "./types.js";

const OPENSPEC_ARTIFACT_FILES = [
  "proposal.md",
  "proposal_review.md",
  "design.md",
  "tasks.md",
  "execute.md",
  "verification.md",
  "archive.md",
] as const;

function fileTypeFromName(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()?.toUpperCase() : null;
  return ext && ext.length > 0 ? ext : "FILE";
}

async function fileArtifact(input: {
  workspacePath: string;
  absolutePath: string;
  label: string;
}): Promise<WorkflowArtifactEntry | null> {
  try {
    const info = await stat(input.absolutePath);
    if (!info.isFile()) {
      return null;
    }

    const rel = relative(input.workspacePath, input.absolutePath).replace(
      /\\/g,
      "/",
    );
    return {
      name: input.label,
      type: fileTypeFromName(input.absolutePath),
      path: rel,
      size_bytes: info.size,
      summary: null,
      updated_at: info.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function scanOpenspecChangeArtifacts(input: {
  workspacePath: string;
  changeRef: string;
}): Promise<WorkflowArtifactEntry[]> {
  const changeDir = join(
    input.workspacePath,
    "openspec",
    "changes",
    input.changeRef,
  );
  const artifacts: WorkflowArtifactEntry[] = [];

  for (const fileName of OPENSPEC_ARTIFACT_FILES) {
    const entry = await fileArtifact({
      workspacePath: input.workspacePath,
      absolutePath: join(changeDir, fileName),
      label: fileName,
    });
    if (entry !== null) {
      artifacts.push(entry);
    }
  }

  const specsDir = join(changeDir, "specs");
  try {
    const specEntries = await readdir(specsDir, { withFileTypes: true });
    for (const entry of specEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      const fileEntry = await fileArtifact({
        workspacePath: input.workspacePath,
        absolutePath: join(specsDir, entry.name),
        label: `specs/${entry.name}`,
      });
      if (fileEntry !== null) {
        artifacts.push(fileEntry);
      }
    }
  } catch {
    // specs directory optional
  }

  const archivedArtifacts = await scanArchivedChangeArtifacts({
    workspacePath: input.workspacePath,
    changeRef: input.changeRef,
  });
  artifacts.push(...archivedArtifacts);

  return artifacts;
}

async function scanArchivedChangeArtifacts(input: {
  workspacePath: string;
  changeRef: string;
}): Promise<WorkflowArtifactEntry[]> {
  const archiveRoot = join(
    input.workspacePath,
    "openspec",
    "changes",
    "archive",
  );
  const artifacts: WorkflowArtifactEntry[] = [];

  try {
    const entries = await readdir(archiveRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(`-${input.changeRef}`)) {
        continue;
      }
      for (const fileName of OPENSPEC_ARTIFACT_FILES) {
        const fileEntry = await fileArtifact({
          workspacePath: input.workspacePath,
          absolutePath: join(archiveRoot, entry.name, fileName),
          label: `archive/${fileName}`,
        });
        if (fileEntry !== null) {
          artifacts.push({
            ...fileEntry,
            path: join(
              "openspec",
              "changes",
              "archive",
              entry.name,
              fileName,
            ).replace(/\\/g, "/"),
          });
        }
      }
    }
  } catch {
    // archive directory optional
  }

  return artifacts;
}

export async function scanSymphonyLogs(input: {
  workspacePath: string;
}): Promise<WorkflowArtifactEntry[]> {
  const symphonyDir = join(input.workspacePath, ".symphony");
  const artifacts: WorkflowArtifactEntry[] = [];

  try {
    const entries = await readdir(symphonyDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith("cursor-turn-")) {
        continue;
      }
      const fileEntry = await fileArtifact({
        workspacePath: input.workspacePath,
        absolutePath: join(symphonyDir, entry.name),
        label: entry.name,
      });
      if (fileEntry !== null) {
        artifacts.push({
          ...fileEntry,
          path: `.symphony/${entry.name}`,
        });
      }
    }
  } catch {
    // .symphony may not exist yet
  }

  return artifacts.sort((left, right) =>
    left.name.localeCompare(right.name, "en"),
  );
}

export async function scanPhaseProofArtifacts(input: {
  workspacePath: string;
}): Promise<WorkflowArtifactEntry[]> {
  const phasesRoot = join(
    input.workspacePath,
    ".symphony",
    "workflow",
    "phases",
  );
  const artifacts: WorkflowArtifactEntry[] = [];

  try {
    const phaseDirs = await readdir(phasesRoot, { withFileTypes: true });
    for (const phaseDir of phaseDirs) {
      if (!phaseDir.isDirectory()) {
        continue;
      }
      const dirPath = join(phasesRoot, phaseDir.name);
      const files = await readdir(dirPath, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile()) {
          continue;
        }
        const fileEntry = await fileArtifact({
          workspacePath: input.workspacePath,
          absolutePath: join(dirPath, file.name),
          label: `${phaseDir.name}/${file.name}`,
        });
        if (fileEntry !== null) {
          artifacts.push({
            ...fileEntry,
            path: `.symphony/workflow/phases/${phaseDir.name}/${file.name}`,
          });
        }
      }
    }
  } catch {
    // optional proof directory
  }

  return artifacts;
}
