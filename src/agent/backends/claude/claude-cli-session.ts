import { spawn } from "node:child_process";

import type { HarnessRuntimeEvent } from "../../harness/types.js";
import { decodeChildProcessOutput } from "../../../process/decode-child-output.js";
import {
  buildClaudeCliArgs,
  type ClaudePermissionMode,
} from "./claude-cli-args.js";
import { createClaudeStreamParser } from "./claude-stream-parser.js";
import { createClaudeHarnessEvent } from "./claude-event-adapter.js";
import { resolveClaudeSpawnSpec } from "./claude-command-resolve.js";

export interface ClaudeCliRunInput {
  command: string;
  cwd: string;
  prompt: string;
  sessionId: string | null;
  model: string | null;
  permissionMode: ClaudePermissionMode;
  allowedTools: readonly string[] | null;
  turnTimeoutMs: number;
  signal?: AbortSignal;
  onHarnessEvent?: (event: HarnessRuntimeEvent) => void;
  onSessionId?: (sessionId: string) => void | Promise<void>;
}

export interface ClaudeCliRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  sessionId: string | null;
  terminalEvent: HarnessRuntimeEvent | null;
}

export type ClaudeCliRunner = (
  input: ClaudeCliRunInput,
) => Promise<ClaudeCliRunResult>;

export async function runClaudeCli(
  input: ClaudeCliRunInput,
): Promise<ClaudeCliRunResult> {
  const args = buildClaudeCliArgs({
    prompt: input.prompt,
    sessionId: input.sessionId,
    model: input.model,
    permissionMode: input.permissionMode,
    allowedTools: input.allowedTools,
  });

  const spawnSpec = resolveClaudeSpawnSpec(input.command, args);

  return await new Promise<ClaudeCliRunResult>((resolve, reject) => {
    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let stdoutRemainder = "";
    let timedOut = false;
    let settled = false;

    const parser = createClaudeStreamParser({
      onEvent: (event) => {
        input.onHarnessEvent?.(event);
      },
      onSessionId: (sessionId) => {
        void input.onSessionId?.(sessionId);
      },
    });

    const finish = (result: ClaudeCliRunResult) => {
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
      finish(
        buildRunResult({
          exitCode: 1,
          stdout,
          stderr: `${stderr}\naborted`.trim(),
          timedOut: false,
          parser,
        }),
      );
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      const timeoutEvent = createClaudeHarnessEvent({
        kind: "runtime_error",
        nativeKind: "turn_timeout",
        message: "Claude CLI turn timed out",
        errorCode: "claude_turn_timeout",
        sessionId: parser.getState().sessionId,
      });
      input.onHarnessEvent?.(timeoutEvent);
      finish(
        buildRunResult({
          exitCode: 1,
          stdout,
          stderr: `${stderr}\nturn timed out`.trim(),
          timedOut: true,
          parser,
          terminalEvent: timeoutEvent,
        }),
      );
    }, input.turnTimeoutMs);

    const processStdoutLines = (text: string) => {
      stdoutRemainder += text;
      const lines = stdoutRemainder.split(/\r?\n/);
      stdoutRemainder = lines.pop() ?? "";
      for (const line of lines) {
        parser.handleLine(line);
      }
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = decodeChildProcessOutput(chunk, "utf8");
      stdout += text;
      processStdoutLines(text);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = decodeChildProcessOutput(chunk, "utf8");
      stderr += text;
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
      }

      const exitCode = code ?? 1;
      let terminalEvent = parser.getState().terminalEvent;
      if (terminalEvent === null && exitCode !== 0) {
        terminalEvent = createClaudeHarnessEvent({
          kind: "turn_failed",
          nativeKind: `exit_${exitCode}`,
          message: summarizeFailureOutput(stderr, stdout),
          errorCode: `claude_exit_${exitCode}`,
          sessionId: parser.getState().sessionId,
        });
        input.onHarnessEvent?.(terminalEvent);
      }

      finish(
        buildRunResult({
          exitCode,
          stdout,
          stderr,
          timedOut,
          parser,
          terminalEvent,
        }),
      );
    });
  });
}

function buildRunResult(input: {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  parser: ReturnType<typeof createClaudeStreamParser>;
  terminalEvent?: HarnessRuntimeEvent | null;
}): ClaudeCliRunResult {
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

function summarizeFailureOutput(stderr: string, stdout: string): string {
  const trimmed = `${stderr}\n${stdout}`.trim();
  if (trimmed.length === 0) {
    return "claude turn failed";
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.at(-1)?.trim() ?? trimmed;
}

export { buildClaudeCliArgs } from "./claude-cli-args.js";
