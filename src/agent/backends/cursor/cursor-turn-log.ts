import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SYMPHONY_DIR = ".symphony";
const TRUNCATED_SUFFIX = "...[truncated]";

export function redactCursorCliArgs(
  args: string[],
  input: { includePrompt: boolean; maxPromptChars?: number },
): string[] {
  const redacted: string[] = [];
  let index = 0;

  while (index < args.length) {
    const token = args[index];
    if (token === "--" && index + 1 < args.length) {
      const prompt = args[index + 1] ?? "";
      redacted.push("--");
      if (input.includePrompt) {
        const limit = input.maxPromptChars ?? prompt.length;
        redacted.push(
          prompt.length <= limit
            ? prompt
            : `${prompt.slice(0, limit)}...[prompt truncated]`,
        );
      } else {
        redacted.push(`<prompt chars=${prompt.length}>`);
      }
      index += 2;
      continue;
    }

    if (token === undefined) {
      index += 1;
      continue;
    }

    redacted.push(token);
    index += 1;
  }

  return redacted;
}

export function formatCursorInvocation(
  command: string,
  args: string[],
): string {
  return [command, ...args].join(" ");
}

export function extractThinkingFromCursorOutput(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const fenced = extractFencedThinking(trimmed);
  if (fenced !== null && fenced.length > 0) {
    return fenced;
  }

  const lineBased = extractLineBasedThinking(trimmed);
  if (lineBased !== null && lineBased.length > 0) {
    return lineBased;
  }

  const fromJson = extractThinkingFromJson(trimmed);
  if (fromJson !== null && fromJson.length > 0) {
    return fromJson;
  }

  return null;
}

export function truncateForStructuredLog(
  text: string,
  maxBytes: number,
): string {
  if (maxBytes <= 0) {
    return "";
  }

  const encoded = Buffer.from(text, "utf8");
  if (encoded.length <= maxBytes) {
    return text;
  }

  const suffix = Buffer.from(TRUNCATED_SUFFIX, "utf8");
  const budget = Math.max(maxBytes - suffix.length, 0);
  let sliceEnd = 0;
  let byteCount = 0;

  for (const char of text) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (byteCount + charBytes > budget) {
      break;
    }
    byteCount += charBytes;
    sliceEnd += char.length;
  }

  return `${text.slice(0, sliceEnd)}${TRUNCATED_SUFFIX}`;
}

export function cursorTurnArtifactPath(
  workspacePath: string,
  turnNumber: number,
): string {
  return join(workspacePath, SYMPHONY_DIR, `cursor-turn-${turnNumber}.log`);
}

export async function writeCursorTurnArtifactHeader(input: {
  workspacePath: string;
  turnNumber: number;
  startedAt: string;
  cliInvocation: string;
}): Promise<string> {
  const artifactPath = cursorTurnArtifactPath(
    input.workspacePath,
    input.turnNumber,
  );
  await mkdir(join(input.workspacePath, SYMPHONY_DIR), { recursive: true });
  const header = [
    `# cursor turn ${input.turnNumber}`,
    `started_at=${input.startedAt}`,
    `cli=${input.cliInvocation}`,
    "",
  ].join("\n");
  await writeFile(artifactPath, header, { encoding: "utf8" });
  return artifactPath;
}

export async function appendCursorTurnArtifactChunk(input: {
  artifactPath: string;
  stream: "stdout" | "stderr";
  text: string;
}): Promise<void> {
  if (input.text.length === 0) {
    return;
  }

  await appendFile(input.artifactPath, `[${input.stream}]\n${input.text}`, {
    encoding: "utf8",
  });
}

export async function finalizeCursorTurnArtifact(input: {
  artifactPath: string;
  finishedAt: string;
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  thinking: string | null;
  /** When true, stdout/stderr were streamed during the turn; skip duplicate bodies. */
  streamedOutput?: boolean;
}): Promise<void> {
  const sections: string[] = [
    "",
    `# finished_at=${input.finishedAt}`,
    `exit_code=${input.exitCode}`,
    `timed_out=${input.timedOut}`,
    "",
  ];

  if (input.thinking !== null && input.thinking.trim().length > 0) {
    sections.push("[thinking]", input.thinking, "");
  }

  if (input.streamedOutput !== true) {
    sections.push("[stdout]", input.stdout, "", "[stderr]", input.stderr, "");
  }

  await appendFile(input.artifactPath, sections.join("\n"), {
    encoding: "utf8",
  });
}

function extractFencedThinking(text: string): string | null {
  const patterns = [
    /```thinking\s*([\s\S]*?)```/gi,
    /```reasoning\s*([\s\S]*?)```/gi,
  ];
  const parts: string[] = [];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const body = match[1]?.trim();
      if (body !== undefined && body.length > 0) {
        parts.push(body);
      }
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join("\n\n");
}

function extractLineBasedThinking(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const prefixes = [/^thinking:\s*/i, /^reasoning:\s*/i, /^思考[:：]\s*/];
  const collected: string[] = [];

  for (const line of lines) {
    for (const prefix of prefixes) {
      if (prefix.test(line)) {
        collected.push(line.replace(prefix, "").trim());
        break;
      }
    }
  }

  if (collected.length === 0) {
    return null;
  }

  return collected.join("\n");
}

function extractThinkingFromJson(text: string): string | null {
  const candidates: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      continue;
    }
    candidates.push(trimmed);
  }

  if (candidates.length === 0) {
    candidates.push(text);
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const extracted = extractThinkingFromJsonValue(parsed);
      if (extracted !== null) {
        return extracted;
      }
    } catch {
      // Ignore non-JSON lines.
    }
  }

  return null;
}

function extractThinkingFromJsonValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => extractThinkingFromJsonValue(entry))
      .filter((entry): entry is string => entry !== null);
    return parts.length > 0 ? parts.join("\n") : null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["thinking", "reasoning", "thought"]) {
    const field = record[key];
    if (typeof field === "string" && field.trim().length > 0) {
      return field.trim();
    }
  }

  return null;
}
