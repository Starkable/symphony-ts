import type { Issue } from "../domain/model.js";
import type { StructuredLogger } from "../logging/structured-logger.js";
import { truncateForStructuredLog } from "./backends/cursor/cursor-turn-log.js";

/** Default UTF-8 byte budget for the `prompt` field in structured logs. */
export const DEFAULT_AGENT_PROMPT_LOG_MAX_BYTES = 65_536;

/** Preview byte budget when full prompt logging is disabled. */
const PROMPT_PREVIEW_MAX_BYTES = 4_096;

export interface LogAgentPromptBuiltInput {
  issue: Issue;
  turnNumber: number;
  attempt: number | null;
  workspacePath: string;
  prompt: string;
  /** When true, log up to maxBytes of the full prompt; otherwise a short preview. */
  includeFullPrompt: boolean;
  maxBytes?: number;
}

export function buildAgentPromptLogPayload(
  input: LogAgentPromptBuiltInput,
): Record<string, unknown> {
  const description = input.issue.description?.trim() ?? "";
  const commentsCount = input.issue.trackerComments?.length ?? 0;
  const maxBytes = input.maxBytes ?? DEFAULT_AGENT_PROMPT_LOG_MAX_BYTES;
  const promptBudget = input.includeFullPrompt
    ? maxBytes
    : PROMPT_PREVIEW_MAX_BYTES;

  return {
    issue_id: input.issue.id,
    issue_identifier: input.issue.identifier,
    attempt: input.attempt,
    workspace_path: input.workspacePath,
    turn_number: input.turnNumber,
    prompt_chars: input.prompt.length,
    issue_description_present: description.length > 0,
    issue_description_chars: description.length,
    issue_description_preview:
      description.length > 0
        ? truncateForStructuredLog(description, 800)
        : null,
    tracker_comments_count: commentsCount,
    prompt_has_description_section: input.prompt.includes("## 工单描述"),
    prompt_has_comments_section: input.prompt.includes("## PMS 备注"),
    prompt_include_full: input.includeFullPrompt,
    prompt: truncateForStructuredLog(input.prompt, promptBudget),
  };
}

export async function logAgentPromptBuilt(
  logger: StructuredLogger | null,
  input: LogAgentPromptBuiltInput,
): Promise<void> {
  if (logger === null) {
    return;
  }

  await logger.info(
    "agent_prompt_built",
    "Agent turn prompt assembled.",
    buildAgentPromptLogPayload(input),
  );
}
