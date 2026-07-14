import { describe, expect, it, vi } from "vitest";

import { createClaudeStreamParser } from "../../../../src/agent/backends/claude/claude-stream-parser.js";
import type { HarnessRuntimeEvent } from "../../../../src/agent/harness/types.js";

describe("createClaudeStreamParser", () => {
  it("maps system/assistant/result stream-json lines", () => {
    const events: HarnessRuntimeEvent[] = [];
    const onSessionId = vi.fn();
    const parser = createClaudeStreamParser({
      onEvent: (event) => {
        events.push(event);
      },
      onSessionId,
    });

    parser.handleLine(
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "sess-abc",
      }),
    );
    parser.handleLine(
      JSON.stringify({
        type: "assistant",
        session_id: "sess-abc",
        message: {
          content: [{ type: "text", text: "working on it" }],
        },
      }),
    );
    parser.handleLine(
      JSON.stringify({
        type: "result",
        session_id: "sess-abc",
        result: "done",
        usage: { input_tokens: 10, output_tokens: 4 },
      }),
    );

    expect(onSessionId).toHaveBeenCalledWith("sess-abc");
    expect(events.map((event) => event.kind)).toEqual([
      "notification",
      "other_message",
      "turn_completed",
    ]);
    expect(parser.getState().terminalEvent?.kind).toBe("turn_completed");
    expect(parser.getState().usage).toEqual({
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
    });
  });
});
