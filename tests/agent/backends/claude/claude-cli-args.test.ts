import { describe, expect, it } from "vitest";

import { buildClaudeCliArgs } from "../../../../src/agent/backends/claude/claude-cli-args.js";

describe("buildClaudeCliArgs", () => {
  it("builds headless stream-json args with permission mode", () => {
    expect(
      buildClaudeCliArgs({
        prompt: "do the work",
        sessionId: null,
        model: null,
        permissionMode: "acceptEdits",
        allowedTools: null,
      }),
    ).toEqual([
      "-p",
      "do the work",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "acceptEdits",
    ]);
  });

  it("includes resume, model, and allowedTools when set", () => {
    expect(
      buildClaudeCliArgs({
        prompt: "continue",
        sessionId: "sess-1",
        model: "sonnet",
        permissionMode: "dontAsk",
        allowedTools: ["Bash", "Edit"],
      }),
    ).toEqual([
      "-p",
      "continue",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "dontAsk",
      "--resume",
      "sess-1",
      "--model",
      "sonnet",
      "--allowedTools",
      "Bash",
      "--allowedTools",
      "Edit",
    ]);
  });
});
