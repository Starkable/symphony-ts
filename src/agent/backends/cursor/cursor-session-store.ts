import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SESSION_FILE_NAME = "cursor-session.json";

export interface CursorSessionRecord {
  chatId: string | null;
  updatedAt: string;
}

export function cursorSessionFilePath(workspacePath: string): string {
  return join(workspacePath, ".symphony", SESSION_FILE_NAME);
}

export async function readCursorSession(
  workspacePath: string,
): Promise<CursorSessionRecord | null> {
  try {
    const raw = await readFile(cursorSessionFilePath(workspacePath), "utf8");
    const parsed = JSON.parse(raw) as Partial<CursorSessionRecord>;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return {
      chatId:
        typeof parsed.chatId === "string" && parsed.chatId.trim().length > 0
          ? parsed.chatId.trim()
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

export async function writeCursorSession(
  workspacePath: string,
  record: CursorSessionRecord,
): Promise<void> {
  const filePath = cursorSessionFilePath(workspacePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

export async function clearCursorSession(workspacePath: string): Promise<void> {
  await writeCursorSession(workspacePath, {
    chatId: null,
    updatedAt: new Date().toISOString(),
  });
}
