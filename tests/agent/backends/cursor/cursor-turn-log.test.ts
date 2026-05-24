import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  appendCursorTurnArtifactChunk,
  cursorTurnArtifactPath,
  extractThinkingFromCursorOutput,
  finalizeCursorTurnArtifact,
  formatCursorInvocation,
  redactCursorCliArgs,
  truncateForStructuredLog,
  writeCursorTurnArtifactHeader,
} from "../../../../src/agent/backends/cursor/cursor-turn-log.js";

describe("cursor-turn-log", () => {
  it("redacts -p prompt unless includePrompt is enabled", () => {
    const args = ["--trust", "-p", "secret prompt", "--continue"];
    expect(
      redactCursorCliArgs(args, { includePrompt: false }),
    ).toEqual(["--trust", "-p", "<prompt chars=13>", "--continue"]);
    expect(
      redactCursorCliArgs(args, { includePrompt: true, maxPromptChars: 6 }),
    ).toEqual(["--trust", "-p", "secret...[prompt truncated]", "--continue"]);
  });

  it("extracts fenced and line-based thinking", () => {
    const fenced = extractThinkingFromCursorOutput(
      "prefix\n```thinking\n分析中文需求\n```\nsuffix",
    );
    expect(fenced).toContain("分析中文需求");

    const lineBased = extractThinkingFromCursorOutput(
      "Thinking: plan step one\nReasoning: step two",
    );
    expect(lineBased).toContain("plan step one");
    expect(lineBased).toContain("step two");
  });

  it("extracts thinking from json output", () => {
    const thinking = extractThinkingFromCursorOutput(
      '{"thinking":"json 思考内容","chatId":"abc"}',
    );
    expect(thinking).toBe("json 思考内容");
  });

  it("truncates by utf8 bytes without splitting multibyte characters", () => {
    const text = "中文".repeat(20);
    const truncated = truncateForStructuredLog(text, 20);
    expect(Buffer.byteLength(truncated, "utf8")).toBeLessThanOrEqual(20);
    expect(truncated.endsWith("...[truncated]")).toBe(true);
  });

  it("writes utf8 artifact with streamed chunks and finalize footer", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-cursor-log-"));
    const artifactPath = await writeCursorTurnArtifactHeader({
      workspacePath,
      turnNumber: 1,
      startedAt: "2026-05-24T00:00:00.000Z",
      cliInvocation: "agent -p <prompt chars=3>",
    });

    expect(artifactPath).toBe(cursorTurnArtifactPath(workspacePath, 1));

    await appendCursorTurnArtifactChunk({
      artifactPath,
      stream: "stdout",
      text: "输出中文\n",
    });

    await finalizeCursorTurnArtifact({
      artifactPath,
      finishedAt: "2026-05-24T00:01:00.000Z",
      exitCode: 0,
      timedOut: false,
      stdout: "输出中文\n",
      stderr: "",
      thinking: "思考片段",
      streamedOutput: true,
    });

    const raw = await readFile(artifactPath, "utf8");
    expect(raw).toContain("输出中文");
    expect(raw).toContain("思考片段");
    expect(raw.split("[stdout]").length - 1).toBe(1);
  });

  it("formats cli invocation for logs", () => {
    expect(formatCursorInvocation("agent", ["-p", "<prompt chars=1>"])).toBe(
      "agent -p <prompt chars=1>",
    );
  });
});
