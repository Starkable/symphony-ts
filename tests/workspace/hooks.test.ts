import { describe, expect, it } from "vitest";

import { resolveHookSpawnSpec } from "../../src/workspace/hooks.js";

describe("resolveHookSpawnSpec", () => {
  it("uses sh on unix-like platforms", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });

    const spec = resolveHookSpawnSpec("echo hello");
    expect(spec.command).toBe("sh");
    expect(spec.args).toEqual(["-lc", "echo hello"]);

    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("uses powershell for ps1 scripts on windows", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    const spec = resolveHookSpawnSpec(
      "& ${env:SYMPHONY_REPO_ROOT}\\docs\\snippets\\materialize-repos.ps1",
    );
    expect(spec.command).toBe("powershell");
    expect(spec.args[0]).toBe("-NoProfile");

    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("uses powershell for bundle install.ps1 after_create on windows", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    const spec = resolveHookSpawnSpec(
      '$PolicyRoot = "F:\\project\\symphony-openspec-bundle"\n& "$PolicyRoot\\bootstrap\\install.ps1" -WorkspacePath (Get-Location).Path',
    );
    expect(spec.command).toBe("powershell");

    Object.defineProperty(process, "platform", { value: originalPlatform });
  });
});
