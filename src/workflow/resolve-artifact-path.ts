import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const ARCHIVE_ROOT = ["openspec", "changes", "archive"] as const;

/**
 * Resolve the relative path to a phase artifact.
 * Prefers the active change directory; falls back to the latest archived change dir.
 */
export async function resolveArtifactRelativePath(input: {
  workspacePath: string;
  changeRef: string;
  relativePath: string;
}): Promise<string | null> {
  const activeAbsolute = join(input.workspacePath, input.relativePath);
  if (await isFile(activeAbsolute)) {
    return input.relativePath;
  }

  const fileName = input.relativePath.split("/").pop();
  if (fileName === undefined || fileName.length === 0) {
    return null;
  }

  const archivedDirName = await findLatestArchivedChangeDir(
    input.workspacePath,
    input.changeRef,
  );
  if (archivedDirName === null) {
    return null;
  }

  const archivedRelative = [...ARCHIVE_ROOT, archivedDirName, fileName]
    .join("/")
    .replace(/\\/g, "/");

  const archivedAbsolute = join(input.workspacePath, archivedRelative);
  if (await isFile(archivedAbsolute)) {
    return archivedRelative;
  }

  return null;
}

async function findLatestArchivedChangeDir(
  workspacePath: string,
  changeRef: string,
): Promise<string | null> {
  const archiveRoot = join(workspacePath, ...ARCHIVE_ROOT);
  const suffix = `-${changeRef}`;

  try {
    const entries = await readdir(archiveRoot, { withFileTypes: true });
    const matches: Array<{ name: string; mtimeMs: number }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(suffix)) {
        continue;
      }
      const dirPath = join(archiveRoot, entry.name);
      const info = await stat(dirPath);
      matches.push({ name: entry.name, mtimeMs: info.mtimeMs });
    }

    if (matches.length === 0) {
      return null;
    }

    matches.sort((left, right) => {
      const byName = right.name.localeCompare(left.name);
      if (byName !== 0) {
        return byName;
      }
      return right.mtimeMs - left.mtimeMs;
    });

    return matches[0]?.name ?? null;
  } catch {
    return null;
  }
}

async function isFile(absolutePath: string): Promise<boolean> {
  try {
    const info = await stat(absolutePath);
    return info.isFile();
  } catch {
    return false;
  }
}
