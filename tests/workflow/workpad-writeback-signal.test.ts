import { describe, expect, it } from "vitest";

import { parseWorkpadWritebackSignal } from "../../src/workflow/workpad-writeback-signal.js";

describe("workpad-writeback-signal", () => {
  it("detects CLARIFY_BLOCKED on failed phase", () => {
    const signal = parseWorkpadWritebackSignal(`
## Agent Workpad
- Phase: failed

### Notes
- CLARIFY_BLOCKED: 需求描述缺少验收标准
`);

    expect(signal.kind).toBe("clarify_blocked");
    if (signal.kind === "clarify_blocked") {
      expect(signal.commentBody).toContain("CLARIFY_BLOCKED");
    }
  });

  it("detects done phase", () => {
    const signal = parseWorkpadWritebackSignal(`
## Agent Workpad
- Phase: done
`);

    expect(signal).toEqual({ kind: "done" });
  });

  it("returns none for in-progress clarify phase", () => {
    const signal = parseWorkpadWritebackSignal(`
## Agent Workpad
- Phase: clarify
`);

    expect(signal).toEqual({ kind: "none" });
  });
});
