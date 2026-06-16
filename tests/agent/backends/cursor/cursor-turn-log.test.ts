import { describe, expect, it } from "vitest";

import { redactCursorCliArgs } from "../../../../src/agent/backends/cursor/cursor-turn-log.js";

describe("redactCursorCliArgs", () => {
  it("redacts prompt after -- separator", () => {
    const args = [
      "--print",
      "--workspace",
      "/tmp",
      "--",
      "secret prompt",
    ];
    expect(
      redactCursorCliArgs(args, { includePrompt: false }),
    ).toEqual([
      "--print",
      "--workspace",
      "/tmp",
      "--",
      "<prompt chars=13>",
    ]);
    expect(
      redactCursorCliArgs(args, { includePrompt: true, maxPromptChars: 6 }),
    ).toEqual([
      "--print",
      "--workspace",
      "/tmp",
      "--",
      "secret...[prompt truncated]",
    ]);
  });
});
