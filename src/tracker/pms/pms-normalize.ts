import type { Issue } from "../../domain/model.js";
import { ERROR_CODES } from "../../errors/codes.js";
import { TrackerError } from "../errors.js";
import type { IssueStateSnapshot } from "../tracker.js";

interface JiraStatus {
  name?: unknown;
}

interface JiraLabel {
  name?: unknown;
}

interface JiraFields {
  summary?: unknown;
  description?: unknown;
  status?: JiraStatus | null;
  labels?: unknown;
  priority?: { name?: unknown } | null;
  created?: unknown;
  updated?: unknown;
}

interface JiraIssueNode {
  id?: unknown;
  key?: unknown;
  fields?: JiraFields | null;
}

export function normalizePmsIssue(node: unknown, browseBaseUrl: string): Issue {
  const issue = asJiraIssueNode(node);
  const id = requireString(issue.id, "issue.id");
  const identifier = requireString(issue.key, "issue.key");
  const fields = issue.fields ?? {};
  const title = requireString(fields.summary, "issue.fields.summary");
  const state = requireString(fields.status?.name, "issue.fields.status.name");

  return {
    id,
    identifier,
    title,
    description: optionalString(fields.description),
    priority: normalizePriority(fields.priority?.name),
    state,
    branchName: null,
    url: `${browseBaseUrl.replace(/\/$/, "")}/${identifier}`,
    labels: normalizeLabels(fields.labels),
    blockedBy: [],
    createdAt: normalizeTimestamp(fields.created),
    updatedAt: normalizeTimestamp(fields.updated),
  };
}

export function normalizePmsIssueState(node: unknown): IssueStateSnapshot {
  const issue = asJiraIssueNode(node);
  const fields = issue.fields ?? {};

  return {
    id: requireString(issue.id, "issue.id"),
    identifier: requireString(issue.key, "issue.key"),
    state: requireString(fields.status?.name, "issue.fields.status.name"),
  };
}

function asJiraIssueNode(node: unknown): JiraIssueNode {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    throw new TrackerError(
      ERROR_CODES.trackerResponseMalformed,
      "PMS issue payload was not an object.",
      { details: node },
    );
  }

  return node as JiraIssueNode;
}

function requireString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  throw new TrackerError(
    ERROR_CODES.trackerResponseMalformed,
    `PMS payload field '${field}' was missing or invalid.`,
    { details: value },
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizePriority(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^P(\d+)$/i.exec(value.trim());
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeLabels(labels: unknown): string[] {
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const name = (entry as JiraLabel).name;
      return typeof name === "string" ? name.toLowerCase() : null;
    })
    .filter((entry): entry is string => entry !== null);
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed.toISOString();
}

export function resolvePmsBrowseBaseUrl(serverUrl: string): string {
  const trimmed = serverUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/browse")) {
    return trimmed;
  }
  return `${trimmed}/browse`;
}

export function resolvePmsRestBaseUrl(serverUrl: string): string {
  const trimmed = serverUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/rest/api/2")) {
    return trimmed;
  }
  return `${trimmed}/rest/api/2`;
}
