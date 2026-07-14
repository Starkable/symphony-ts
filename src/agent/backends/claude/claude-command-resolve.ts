import { accessSync, constants } from "node:fs";
import { execSync } from "node:child_process";
import { isAbsolute } from "node:path";

export interface ClaudeSpawnSpec {
  command: string;
  args: string[];
  resolvedPath: string;
}

export function isClaudeCommandAvailable(command: string): boolean {
  const trimmed = command.trim();
  if (trimmed === "") {
    return false;
  }

  try {
    const resolved = resolveClaudeCommandPath(trimmed);
    accessSync(resolved, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveClaudeCommandPath(configCommand: string): string {
  const trimmed = configCommand.trim();
  if (trimmed === "") {
    throw new Error("Claude CLI command must be non-empty.");
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
      throw new Error(`Claude CLI command '${trimmed}' was not found on PATH.`);
    }
    return firstMatch;
  }

  const output = execSync(`command -v ${quoteForShell(trimmed)}`, {
    encoding: "utf8",
  }).trim();

  if (output === "") {
    throw new Error(`Claude CLI command '${trimmed}' was not found on PATH.`);
  }
  return output;
}

export function resolveClaudeSpawnSpec(
  configCommand: string,
  cliArgs: string[],
): ClaudeSpawnSpec {
  const resolvedPath = resolveClaudeCommandPath(configCommand);

  if (process.platform === "win32" && isWindowsBatchScript(resolvedPath)) {
    const comspec = process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe";
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
