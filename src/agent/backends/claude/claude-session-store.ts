import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SESSION_FILE_NAME = "claude-session.json";

export interface ClaudeSessionRecord {
  sessionId: string | null;
  updatedAt: string;
}

export function claudeSessionFilePath(workspacePath: string): string {
  return join(workspacePath, ".symphony", SESSION_FILE_NAME);
}

export async function readClaudeSession(
  workspacePath: string,
): Promise<ClaudeSessionRecord | null> {
  try {
    const raw = await readFile(claudeSessionFilePath(workspacePath), "utf8");
    const parsed = JSON.parse(raw) as Partial<ClaudeSessionRecord>;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return {
      sessionId:
        typeof parsed.sessionId === "string" && parsed.sessionId.trim().length > 0
          ? parsed.sessionId.trim()
          : null,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.trim() !== ""
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function writeClaudeSession(
  workspacePath: string,
  record: ClaudeSessionRecord,
): Promise<void> {
  const filePath = claudeSessionFilePath(workspacePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function clearClaudeSession(workspacePath: string): Promise<void> {
  await writeClaudeSession(workspacePath, {
    sessionId: null,
    updatedAt: new Date().toISOString(),
  });
}
