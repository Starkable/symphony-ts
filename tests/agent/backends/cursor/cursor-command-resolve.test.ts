import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execSyncMock = vi.fn();

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: (...args: Parameters<typeof actual.execSync>) =>
      execSyncMock(...args),
  };
});

const accessSyncMock = vi.fn();

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    accessSync: (...args: Parameters<typeof actual.accessSync>) =>
      accessSyncMock(...args),
  };
});

import {
  isCursorCommandAvailable,
  resolveCursorCommandPath,
  resolveCursorSpawnSpec,
} from "../../../../src/agent/backends/cursor/cursor-command-resolve.js";

describe("resolveCursorCommandPath", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    execSyncMock.mockReset();
    accessSyncMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("returns absolute paths unchanged on win32", () => {
    Object.defineProperty(process, "platform", { value: "win32" });

    const path = "C:\\Tools\\agent.cmd";
    expect(resolveCursorCommandPath(path)).toBe(path);
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("resolves bare command names via where.exe on win32", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    execSyncMock.mockReturnValue(
      "C:\\Users\\test\\AppData\\Local\\cursor-agent\\agent.cmd\r\n",
    );

    expect(resolveCursorCommandPath("agent")).toBe(
      "C:\\Users\\test\\AppData\\Local\\cursor-agent\\agent.cmd",
    );
    expect(execSyncMock).toHaveBeenCalledWith("where.exe agent", {
      encoding: "utf8",
    });
  });

  it("resolves bare command names via command -v on unix", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    execSyncMock.mockReturnValue("/usr/local/bin/agent\n");

    expect(resolveCursorCommandPath("agent")).toBe("/usr/local/bin/agent");
    expect(execSyncMock).toHaveBeenCalledWith("command -v agent", {
      encoding: "utf8",
    });
  });
});

describe("resolveCursorSpawnSpec", () => {
  const originalPlatform = process.platform;
  const originalComSpec = process.env.ComSpec;

  beforeEach(() => {
    execSyncMock.mockReset();
    accessSyncMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    if (originalComSpec === undefined) {
      delete process.env.ComSpec;
    } else {
      process.env.ComSpec = originalComSpec;
    }
  });

  it("wraps Windows batch scripts with cmd.exe", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.ComSpec = "C:\\Windows\\System32\\cmd.exe";
    const cliArgs = ["--print", "--", "hello"];
    const resolved = "C:\\Users\\test\\AppData\\Local\\cursor-agent\\agent.cmd";

    const spec = resolveCursorSpawnSpec(resolved, cliArgs);

    expect(spec.resolvedPath).toBe(resolved);
    expect(spec.command).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(spec.args).toEqual(["/d", "/s", "/c", resolved, ...cliArgs]);
  });

  it("spawns Windows exe paths directly", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const cliArgs = ["--print", "--", "hello"];
    const resolved = "C:\\Tools\\agent.exe";

    const spec = resolveCursorSpawnSpec(resolved, cliArgs);

    expect(spec).toEqual({
      command: resolved,
      args: cliArgs,
      resolvedPath: resolved,
    });
  });

  it("spawns unix paths directly", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    execSyncMock.mockReturnValue("/usr/local/bin/agent\n");
    const cliArgs = ["--print", "--", "hello"];

    const spec = resolveCursorSpawnSpec("agent", cliArgs);

    expect(spec).toEqual({
      command: "/usr/local/bin/agent",
      args: cliArgs,
      resolvedPath: "/usr/local/bin/agent",
    });
  });
});

describe("isCursorCommandAvailable", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    execSyncMock.mockReset();
    accessSyncMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("returns false for empty command", () => {
    expect(isCursorCommandAvailable("")).toBe(false);
    expect(isCursorCommandAvailable("   ")).toBe(false);
  });

  it("checks resolved path accessibility", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const resolved = "C:\\Users\\test\\AppData\\Local\\cursor-agent\\agent.cmd";
    execSyncMock.mockReturnValue(`${resolved}\r\n`);
    accessSyncMock.mockImplementation(() => undefined);

    expect(isCursorCommandAvailable("agent")).toBe(true);
    expect(accessSyncMock).toHaveBeenCalledWith(resolved, expect.any(Number));
  });

  it("returns false when resolved path is missing", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    execSyncMock.mockReturnValue(
      "C:\\Users\\test\\AppData\\Local\\cursor-agent\\agent.cmd\r\n",
    );
    accessSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(isCursorCommandAvailable("agent")).toBe(false);
  });
});
