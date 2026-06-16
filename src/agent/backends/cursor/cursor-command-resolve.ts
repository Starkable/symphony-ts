import { accessSync, constants } from "node:fs";
import { execSync } from "node:child_process";
import { isAbsolute } from "node:path";

export interface CursorSpawnSpec {
  /** Executable passed to `spawn` (e.g. cmd.exe on Windows batch wrappers). */
  command: string;
  /** Arguments passed to `spawn`. */
  args: string[];
  /** Resolved CLI entry path after PATH / absolute-path lookup. */
  resolvedPath: string;
}

/**
 * Returns true when the configured Cursor CLI command is reachable on this host.
 */
export function isCursorCommandAvailable(command: string): boolean {
  const trimmed = command.trim();
  if (trimmed === "") {
    return false;
  }

  try {
    const resolved = resolveCursorCommandPath(trimmed);
    accessSync(resolved, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a configured Cursor CLI command to an absolute executable path.
 */
export function resolveCursorCommandPath(configCommand: string): string {
  const trimmed = configCommand.trim();
  if (trimmed === "") {
    throw new Error("Cursor CLI command must be non-empty.");
  }

  if (isAbsolute(trimmed) || trimmed.includes("/") || trimmed.includes("\\")) {
    return trimmed;
  }

  if (process.platform === "win32") {
    const output = execSync(`where.exe ${quoteForShell(trimmed)}`, {
      encoding: "utf8",
    });
    const firstMatch = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (firstMatch === undefined) {
      throw new Error(`Cursor CLI command '${trimmed}' was not found on PATH.`);
    }
    return firstMatch;
  }

  const output = execSync(`command -v ${quoteForShell(trimmed)}`, {
    encoding: "utf8",
  }).trim();
  if (output === "") {
    throw new Error(`Cursor CLI command '${trimmed}' was not found on PATH.`);
  }
  return output;
}

/**
 * Builds the spawn target for Cursor CLI, wrapping Windows batch scripts via cmd.exe.
 */
export function resolveCursorSpawnSpec(
  configCommand: string,
  cliArgs: string[],
): CursorSpawnSpec {
  const resolvedPath = resolveCursorCommandPath(configCommand);

  if (process.platform === "win32" && isWindowsBatchScript(resolvedPath)) {
    const comspec =
      process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe";
    return {
      command: comspec,
      args: ["/d", "/s", "/c", resolvedPath, ...cliArgs],
      resolvedPath,
    };
  }

  return {
    command: resolvedPath,
    args: cliArgs,
    resolvedPath,
  };
}

function isWindowsBatchScript(resolvedPath: string): boolean {
  const lower = resolvedPath.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

function quoteForShell(value: string): string {
  if (/^[A-Za-z0-9._-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}
