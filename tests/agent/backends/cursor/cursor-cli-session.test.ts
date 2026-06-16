import { describe, expect, it } from "vitest";

import { buildCursorCliArgs } from "../../../../src/agent/backends/cursor/cursor-cli-args.js";

describe("buildCursorCliArgs", () => {
  it("builds print mode args with force and workspace prompt", () => {
    const args = buildCursorCliArgs({
      workspace: "/tmp/ws",
      prompt: "do the thing",
      chatId: null,
      model: null,
    });

    expect(args).toEqual([
      "--print",
      "--output-format",
      "stream-json",
      "--force",
      "--workspace",
      "/tmp/ws",
      "--",
      "do the thing",
    ]);
  });

  it("appends --resume and --model when provided", () => {
    const args = buildCursorCliArgs({
      workspace: "/tmp/ws",
      prompt: "continue",
      chatId: "chat-abc",
      model: "composer-2.5-fast",
    });

    expect(args).toContain("--resume");
    expect(args).toContain("chat-abc");
    expect(args).toContain("--model");
    expect(args).toContain("composer-2.5-fast");
    expect(args.at(-1)).toBe("continue");
  });

  it("passes experimental sandbox when configured", () => {
    const args = buildCursorCliArgs({
      workspace: ".",
      prompt: "x",
      chatId: null,
      model: null,
      sandbox: "enabled",
    });

    expect(args).toContain("--sandbox");
    expect(args).toContain("enabled");
  });
});
