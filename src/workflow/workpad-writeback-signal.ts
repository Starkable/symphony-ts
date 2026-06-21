import { parseWorkpad } from "../artifact-store/workpad-parser.js";

export type WorkpadWritebackSignal =
  | { kind: "clarify_blocked"; commentBody: string }
  | { kind: "done" }
  | { kind: "none" };

const CLARIFY_PREFIX = "CLARIFY_BLOCKED:";
const SYMPHONY_COMMENT_PREFIX = "[Symphony]";

export function parseWorkpadWritebackSignal(
  workpadContent: string,
): WorkpadWritebackSignal {
  const workpad = parseWorkpad(workpadContent);

  if (workpad.phase === "done") {
    return { kind: "done" };
  }

  if (workpad.phase === "failed") {
    const clarifyNotes = workpad.notes.filter((line) =>
      line.includes(CLARIFY_PREFIX),
    );
    if (clarifyNotes.length > 0) {
      return {
        kind: "clarify_blocked",
        commentBody: buildClarifyCommentBody(clarifyNotes),
      };
    }
  }

  return { kind: "none" };
}

function buildClarifyCommentBody(clarifyNotes: string[]): string {
  return [`${SYMPHONY_COMMENT_PREFIX} 需求澄清未通过`, ...clarifyNotes].join(
    "\n",
  );
}

export { SYMPHONY_COMMENT_PREFIX };
