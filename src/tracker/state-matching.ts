import { PMS_TRACKER_KIND } from "../config/defaults.js";
import type { WorkflowTrackerConfig } from "../config/types.js";
import { normalizeIssueState } from "../domain/model.js";
import { issueStateMatchesStates } from "./pms/pms-status-alias.js";

function toNormalizedStateSet(states: readonly string[]): Set<string> {
  return new Set(states.map((state) => normalizeIssueState(state)));
}

export function trackerStateMatches(
  issueState: string,
  configStates: readonly string[],
  tracker: Pick<WorkflowTrackerConfig, "kind" | "stateAliases">,
): boolean {
  if (issueState.trim() === "") {
    return false;
  }

  const kind = tracker.kind?.trim().toLowerCase();
  if (kind === PMS_TRACKER_KIND) {
    return issueStateMatchesStates(
      issueState,
      configStates,
      tracker.stateAliases,
    );
  }

  return toNormalizedStateSet(configStates).has(
    normalizeIssueState(issueState),
  );
}
