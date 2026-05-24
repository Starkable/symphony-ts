import { spawn } from "node:child_process";

import { decodeChildProcessOutput } from "../../../process/decode-child-output.js";

export interface CursorCliOutputChunk {
  stream: "stdout" | "stderr";
  text: string;
}

export interface CursorCliRunInput {
  command: string;
  cwd: string;
  args: string[];
  prompt: string;
  turnTimeoutMs: number;
  signal?: AbortSignal;
  onOutput?: (chunk: CursorCliOutputChunk) => void;
}

export interface CursorCliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type CursorCliRunner = (input: CursorCliRunInput) => Promise<CursorCliRunResult>;

export async function runCursorCli(
  input: CursorCliRunInput,
): Promise<CursorCliRunResult> {
  return await new Promise<CursorCliRunResult>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const finish = (result: CursorCliRunResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      input.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onAbort = () => {
      child.kill("SIGTERM");
      finish({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\naborted`.trim(),
        timedOut: false,
      });
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      finish({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\nturn timed out`.trim(),
        timedOut: true,
      });
    }, input.turnTimeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = decodeChildProcessOutput(chunk);
      stdout += text;
      input.onOutput?.({ stream: "stdout", text });
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = decodeChildProcessOutput(chunk);
      stderr += text;
      input.onOutput?.({ stream: "stderr", text });
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      reject(error);
    });

    child.on("close", (code) => {
      finish({
        exitCode: code ?? 1,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

export function buildCursorCliArgs(input: {
  prompt: string;
  chatId: string | null;
  turnNumber: number;
  outputFormat: string | null;
  sandbox: unknown;
  mode: string | null;
  yolo: boolean;
  trust: boolean;
}): string[] {
  const args: string[] = [];
  if (input.trust) {
    args.push("--trust");
  }
  if (input.yolo) {
    args.push("--yolo");
  }
  args.push("-p", input.prompt);
  if (input.outputFormat !== null && input.outputFormat.trim() !== "") {
    args.push("--output-format", input.outputFormat);
  }
  if (input.mode !== null && input.mode.trim() !== "") {
    args.push("--mode", input.mode);
  }
  if (input.sandbox !== undefined && input.sandbox !== null) {
    args.push("--sandbox", String(input.sandbox));
  }
  if (input.turnNumber > 1) {
    if (input.chatId !== null) {
      args.push(`--resume=${input.chatId}`);
    } else {
      args.push("--continue");
    }
  }
  return args;
}

const CHAT_ID_PATTERNS = [
  /chat[_\s-]?id[:\s]+([A-Za-z0-9_-]+)/i,
  /session[:\s]+([A-Za-z0-9_-]+)/i,
  /"chatId"\s*:\s*"([^"]+)"/i,
];

export function extractChatIdFromCliOutput(output: string): string | null {
  for (const pattern of CHAT_ID_PATTERNS) {
    const match = output.match(pattern);
    if (match?.[1] !== undefined && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }
  return null;
}
