import { describe, expect, it } from "vitest";

import { buildCursorCliArgs } from "../../../../src/agent/backends/cursor/cursor-cli-session.js";

describe("buildCursorCliArgs", () => {
  const base = {
    prompt: "do the thing",
    chatId: null as string | null,
    turnNumber: 1,
    outputFormat: null as string | null,
    sandbox: null as unknown,
    mode: null as string | null,
    trust: true,
    yolo: true,
  };

  it("prepends --trust then --yolo before -p when both true", () => {
    const args = buildCursorCliArgs(base);
    expect(args[0]).toBe("--trust");
    expect(args[1]).toBe("--yolo");
    expect(args[2]).toBe("-p");
    expect(args[3]).toBe("do the thing");
  });

  it("omits --trust and --yolo when both false", () => {
    const args = buildCursorCliArgs({ ...base, trust: false, yolo: false });
    expect(args.includes("--trust")).toBe(false);
    expect(args.includes("--yolo")).toBe(false);
    expect(args[0]).toBe("-p");
    expect(args[1]).toBe("do the thing");
  });

  it("includes only --trust when yolo is false", () => {
    const args = buildCursorCliArgs({ ...base, yolo: false });
    expect(args[0]).toBe("--trust");
    expect(args.includes("--yolo")).toBe(false);
    expect(args[1]).toBe("-p");
  });

  it("includes only --yolo when trust is false", () => {
    const args = buildCursorCliArgs({ ...base, trust: false });
    expect(args.includes("--trust")).toBe(false);
    expect(args[0]).toBe("--yolo");
    expect(args[1]).toBe("-p");
  });

  it("appends --continue on later turns without chat id", () => {
    const args = buildCursorCliArgs({
      ...base,
      turnNumber: 2,
    });
    expect(args[0]).toBe("--trust");
    expect(args[1]).toBe("--yolo");
    expect(args.at(-1)).toBe("--continue");
  });

  it("appends --resume when chat id is set on later turns", () => {
    const args = buildCursorCliArgs({
      ...base,
      turnNumber: 3,
      chatId: "chat-abc",
    });
    expect(args).toContain("--resume=chat-abc");
  });
});
