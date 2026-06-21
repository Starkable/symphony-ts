import { describe, expect, it } from "vitest";

import { parsePmsProbeArgs } from "../../src/cli/pms-bcs-verify.js";
import { runPmsProbe } from "../../src/cli/pms-probe.js";

describe("pms-probe", () => {
  it("prints help without calling PMS", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      logs.push(String(message));
    };

    try {
      const exitCode = await runPmsProbe(["--help"]);
      expect(exitCode).toBe(0);
      expect(logs.join("\n")).toContain("pms-probe");
    } finally {
      console.log = originalLog;
    }
  });

  it("rejects unknown options", () => {
    expect(() => parsePmsProbeArgs(["--unknown"])).toThrow(
      "Unknown option: --unknown",
    );
  });
});
