import { describe, expect, it } from "vitest";

import {
  mapAgentRunnerEventToHarnessAgentEvent,
  mapCodexEventToHarnessEvent,
} from "../../../../src/agent/backends/codex/codex-event-adapter.js";

describe("codex-event-adapter", () => {
  it("maps codex protocol events into harness-neutral events", () => {
    const mapped = mapCodexEventToHarnessEvent({
      event: "turn_completed",
      timestamp: "2026-03-06T00:00:01.000Z",
      codexAppServerPid: "1001",
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        totalTokens: 5,
      },
      message: "done",
    });

    expect(mapped).toEqual({
      kind: "turn_completed",
      harness: "codex",
      timestamp: "2026-03-06T00:00:01.000Z",
      nativeKind: "turn_completed",
      runtimePid: "1001",
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        totalTokens: 5,
      },
      message: "done",
    });
  });

  it("maps agent runner events with issue context", () => {
    const mapped = mapAgentRunnerEventToHarnessAgentEvent({
      event: "session_started",
      timestamp: "2026-03-06T00:00:02.000Z",
      codexAppServerPid: "1001",
      issueId: "issue-1",
      issueIdentifier: "ISSUE-1",
      attempt: 2,
      workspacePath: "/tmp/workspaces/1",
      turnCount: 1,
    });

    expect(mapped.harness).toBe("codex");
    expect(mapped.kind).toBe("session_started");
    expect(mapped.issueId).toBe("issue-1");
    expect(mapped.turnCount).toBe(1);
  });
});
