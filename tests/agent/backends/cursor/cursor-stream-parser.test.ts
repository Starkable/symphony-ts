import { describe, expect, it } from "vitest";

import {
  createCursorStreamParser,
  parseInteractionQueryRequest,
} from "../../../../src/agent/backends/cursor/cursor-stream-parser.js";

const HELLO_SYSTEM = JSON.stringify({
  type: "system",
  subtype: "init",
  session_id: "805f4f21-af74-4491-84db-e085e446041d",
  model: "Composer 2.5 Fast",
});

const HELLO_ASSISTANT = JSON.stringify({
  type: "assistant",
  message: {
    role: "assistant",
    content: [{ type: "text", text: "Hello!" }],
  },
  session_id: "805f4f21-af74-4491-84db-e085e446041d",
});

const HELLO_RESULT = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "Hello!",
  session_id: "805f4f21-af74-4491-84db-e085e446041d",
  usage: { inputTokens: 10, outputTokens: 2 },
});

const TOOL_STARTED = JSON.stringify({
  type: "tool_call",
  subtype: "started",
  tool_call: {
    shellToolCall: {
      args: { command: "dir" },
      description: "List directory",
    },
  },
});

describe("createCursorStreamParser", () => {
  it("maps hello stream to harness events and session id", () => {
    const events: string[] = [];
    let sessionId: string | null = null;

    const parser = createCursorStreamParser({
      onEvent: (event) => {
        events.push(event.kind);
      },
      onSessionId: (id) => {
        sessionId = id;
      },
    });

    parser.handleLine(HELLO_SYSTEM);
    parser.handleLine(HELLO_ASSISTANT);
    parser.handleLine(HELLO_RESULT);

    expect(sessionId).toBe("805f4f21-af74-4491-84db-e085e446041d");
    expect(events).toEqual([
      "notification",
      "other_message",
      "turn_completed",
    ]);
    expect(parser.getState().usage).toEqual({
      inputTokens: 10,
      outputTokens: 2,
      totalTokens: 12,
    });
  });

  it("emits tool_call progress as other_message", () => {
    const messages: string[] = [];
    const parser = createCursorStreamParser({
      onEvent: (event) => {
        if (event.message !== undefined) {
          messages.push(event.message);
        }
      },
    });

    parser.handleLine(TOOL_STARTED);
    expect(messages[0]).toBe("Tool Bash: dir");
  });

  it("buffers thinking until completed", () => {
    const messages: string[] = [];
    const parser = createCursorStreamParser({
      onEvent: (event) => {
        if (event.message !== undefined) {
          messages.push(event.message);
        }
      },
    });

    parser.handleLine(
      JSON.stringify({
        type: "thinking",
        subtype: "delta",
        text: "Running ",
      }),
    );
    parser.handleLine(
      JSON.stringify({
        type: "thinking",
        subtype: "delta",
        text: "dir",
      }),
    );
    parser.handleLine(
      JSON.stringify({
        type: "thinking",
        subtype: "completed",
      }),
    );

    expect(messages).toEqual(["Runningdir"]);
  });
});

describe("parseInteractionQueryRequest", () => {
  it("parses shell interaction_query request", () => {
    const parsed = parseInteractionQueryRequest({
      type: "interaction_query",
      subtype: "request",
      query_type: "shellRequestQuery",
      query: { id: 3 },
    });

    expect(parsed).toEqual({
      queryId: 3,
      queryType: "shellRequestQuery",
    });
  });
});
