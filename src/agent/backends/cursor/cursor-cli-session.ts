import { spawn } from "node:child_process";

import type { HarnessRuntimeEvent } from "../../harness/types.js";
import { decodeChildProcessOutput } from "../../../process/decode-child-output.js";
import { buildCursorCliArgs } from "./cursor-cli-args.js";
import {
  buildInteractionQueryApproval,
  createCursorStreamParser,
  parseInteractionQueryRequest,
} from "./cursor-stream-parser.js";
import { createCursorHarnessEvent } from "./cursor-event-adapter.js";
import { resolveCursorSpawnSpec } from "./cursor-command-resolve.js";

export interface CursorCliOutputChunk {
  stream: "stdout" | "stderr";
  text: string;
}

export interface CursorCliRunInput {
  command: string;
  cwd: string;
  workspace: string;
  prompt: string;
  chatId: string | null;
  model: string | null;
  sandbox?: unknown;
  turnTimeoutMs: number;
  signal?: AbortSignal;
  onOutput?: (chunk: CursorCliOutputChunk) => void;
  onHarnessEvent?: (event: HarnessRuntimeEvent) => void;
  onSessionId?: (sessionId: string) => void | Promise<void>;
}

export interface CursorCliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  sessionId: string | null;
  terminalEvent: HarnessRuntimeEvent | null;
}

export type CursorCliRunner = (input: CursorCliRunInput) => Promise<CursorCliRunResult>;

export async function runCursorCli(
  input: CursorCliRunInput,
): Promise<CursorCliRunResult> {
  const args = buildCursorCliArgs({
    workspace: input.workspace,
    prompt: input.prompt,
    chatId: input.chatId,
    model: input.model,
    sandbox: input.sandbox,
  });

  const spawnSpec = resolveCursorSpawnSpec(input.command, args);

  return await new Promise<CursorCliRunResult>((resolve, reject) => {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let stdoutRemainder = "";
    let timedOut = false;
    let settled = false;

    const parser = createCursorStreamParser({
      onEvent: (event) => {
        input.onHarnessEvent?.(event);
      },
      onSessionId: (sessionId) => {
        void input.onSessionId?.(sessionId);
      },
    });

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
      finish(buildRunResult({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\naborted`.trim(),
        timedOut: false,
        parser,
      }));
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      const timeoutEvent = createCursorHarnessEvent({
        kind: "runtime_error",
        nativeKind: "turn_timeout",
        message: "Cursor CLI turn timed out",
        errorCode: "cursor_turn_timeout",
        sessionId: parser.getState().sessionId,
      });
      input.onHarnessEvent?.(timeoutEvent);
      finish(buildRunResult({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\nturn timed out`.trim(),
        timedOut: true,
        parser,
        terminalEvent: timeoutEvent,
      }));
    }, input.turnTimeoutMs);

    const processStdoutLines = (text: string) => {
      stdoutRemainder += text;
      const lines = stdoutRemainder.split(/\r?\n/);
      stdoutRemainder = lines.pop() ?? "";
      for (const line of lines) {
        parser.handleLine(line);
        maybeApproveInteractionQuery(line, child.stdin);
      }
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = decodeChildProcessOutput(chunk, "utf8");
      stdout += text;
      input.onOutput?.({ stream: "stdout", text });
      processStdoutLines(text);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = decodeChildProcessOutput(chunk, "utf8");
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
      if (stdoutRemainder.trim().length > 0) {
        parser.handleLine(stdoutRemainder);
        maybeApproveInteractionQuery(stdoutRemainder, child.stdin);
      }

      const exitCode = code ?? 1;
      let terminalEvent = parser.getState().terminalEvent;
      if (terminalEvent === null && exitCode !== 0) {
        terminalEvent = createCursorHarnessEvent({
          kind: "turn_failed",
          nativeKind: `exit_${exitCode}`,
          message: summarizeFailureOutput(stderr, stdout),
          errorCode: `cursor_exit_${exitCode}`,
          sessionId: parser.getState().sessionId,
        });
        input.onHarnessEvent?.(terminalEvent);
      }

      finish(buildRunResult({
        exitCode,
        stdout,
        stderr,
        timedOut,
        parser,
        terminalEvent,
      }));
    });
  });
}

function buildRunResult(input: {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  parser: ReturnType<typeof createCursorStreamParser>;
  terminalEvent?: HarnessRuntimeEvent | null;
}): CursorCliRunResult {
  const state = input.parser.getState();
  return {
    exitCode: input.exitCode,
    stdout: input.stdout,
    stderr: input.stderr,
    timedOut: input.timedOut,
    sessionId: state.sessionId,
    terminalEvent: input.terminalEvent ?? state.terminalEvent,
  };
}

function maybeApproveInteractionQuery(
  line: string,
  stdin: NodeJS.WritableStream | null,
): void {
  const trimmed = line.trim();
  if (trimmed === "" || stdin === null) {
    return;
  }

  const writable = stdin as NodeJS.WritableStream & { destroyed?: boolean };
  if (writable.destroyed === true) {
    return;
  }

  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return;
    }
    raw = parsed as Record<string, unknown>;
  } catch {
    return;
  }

  const request = parseInteractionQueryRequest(raw);
  if (request === null) {
    return;
  }

  stdin.write(
    buildInteractionQueryApproval({
      queryId: request.queryId,
      queryType: request.queryType,
    }),
  );
}

function summarizeFailureOutput(stderr: string, stdout: string): string {
  const trimmed = `${stderr}\n${stdout}`.trim();
  if (trimmed.length === 0) {
    return "cursor turn failed";
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.at(-1)?.trim() ?? trimmed;
}

export { buildCursorCliArgs } from "./cursor-cli-args.js";
