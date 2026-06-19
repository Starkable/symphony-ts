import {
  DEFAULT_LINEAR_NETWORK_TIMEOUT_MS,
  DEFAULT_LINEAR_PAGE_SIZE,
  DEFAULT_TRACKER_KIND,
  PMS_TRACKER_KIND,
} from "../config/defaults.js";
import type { ResolvedWorkflowConfig } from "../config/types.js";
import { ERROR_CODES } from "../errors/codes.js";
import { TrackerError } from "./errors.js";
import { LinearTrackerClient } from "./linear-client.js";
import { PmsTrackerClient } from "./pms/pms-client.js";
import type { IssueTracker } from "./tracker.js";

export function createIssueTracker(
  config: ResolvedWorkflowConfig,
): IssueTracker {
  const kind =
    config.tracker.kind?.trim().toLowerCase() ?? DEFAULT_TRACKER_KIND;

  switch (kind) {
    case PMS_TRACKER_KIND:
      return PmsTrackerClient.fromConfig(config);
    case DEFAULT_TRACKER_KIND:
      return new LinearTrackerClient({
        endpoint: config.tracker.endpoint,
        apiKey: config.tracker.apiKey,
        projectSlug: config.tracker.projectSlug,
        activeStates: config.tracker.activeStates,
        pageSize: DEFAULT_LINEAR_PAGE_SIZE,
        networkTimeoutMs: DEFAULT_LINEAR_NETWORK_TIMEOUT_MS,
      });
    default:
      throw new TrackerError(
        ERROR_CODES.unsupportedTrackerKind,
        `tracker.kind '${kind}' is not supported.`,
      );
  }
}
