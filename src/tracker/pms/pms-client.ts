import {
  DEFAULT_PMS_NETWORK_TIMEOUT_MS,
  DEFAULT_PMS_PAGE_SIZE,
} from "../../config/defaults.js";
import type { ResolvedWorkflowConfig } from "../../config/types.js";
import type { Issue, TrackerComment } from "../../domain/model.js";
import { ERROR_CODES } from "../../errors/codes.js";
import { TrackerError, toTrackerRequestError } from "../errors.js";
import type { IssueStateSnapshot, IssueTracker } from "../tracker.js";
import {
  buildCandidateIssuesJql,
  buildIssueStatesByIdsJql,
  buildIssuesByStatesJql,
} from "./pms-jql.js";
import {
  normalizePmsIssue,
  normalizePmsIssueState,
  resolvePmsBrowseBaseUrl,
  resolvePmsRestBaseUrl,
} from "./pms-normalize.js";
import {
  type PmsOAuthCredentials,
  buildOAuthAuthorizationHeader,
  loadRsaPrivateKeyPem,
} from "./pms-oauth.js";
import {
  type PmsTransitionEntry,
  findTransitionMatch,
} from "./pms-transition.js";

export interface PmsWriteResult {
  ok: boolean;
  status: number;
  errorBody: string;
}

export const DEFAULT_PMS_COMMENT_PROMPT_LIMIT = 10;

const ISSUE_SEARCH_FIELD_LIST = [
  "summary",
  "description",
  "status",
  "labels",
  "priority",
  "created",
  "updated",
];

const ISSUE_SEARCH_FIELDS = ISSUE_SEARCH_FIELD_LIST.join(",");

const STATE_REFRESH_FIELDS = "id,key,status";

interface JiraSearchResponse {
  issues?: unknown;
  total?: unknown;
  startAt?: unknown;
  maxResults?: unknown;
}

function toPmsSearchError(
  status: number,
  jql: string,
  startAt: number,
  errorBody: string,
): TrackerError {
  let message = `PMS search request failed with HTTP ${status}.`;
  try {
    const parsed = JSON.parse(errorBody) as { errorMessages?: unknown };
    if (
      Array.isArray(parsed.errorMessages) &&
      parsed.errorMessages.length > 0
    ) {
      const details = parsed.errorMessages
        .filter((entry): entry is string => typeof entry === "string")
        .join("; ");
      if (details !== "") {
        message += ` ${details}`;
      }
    }
  } catch {
    // Keep generic message when body is not JSON.
  }

  return new TrackerError(ERROR_CODES.trackerHttpError, message, {
    status,
    details: { jql, startAt, body: errorBody.slice(0, 800) },
  });
}

function resolveSearchFieldList(fields: string): string[] {
  return fields
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field !== "");
}

export interface PmsTrackerClientOptions {
  serverUrl: string;
  projectKey: string | null;
  activeStates: string[];
  issueTypes?: string[];
  excludeDraftStatus?: boolean;
  assignees?: string[];
  oauth: PmsOAuthCredentials;
  pageSize?: number;
  networkTimeoutMs?: number;
  fetchFn?: typeof fetch;
  onCommentFetchWarning?: (input: {
    issueKey: string;
    message: string;
  }) => void;
}

export class PmsTrackerClient implements IssueTracker {
  private readonly restBaseUrl: string;
  private readonly browseBaseUrl: string;
  private readonly projectKey: string | null;
  private readonly activeStates: string[];
  private readonly issueTypes: string[];
  private readonly excludeDraftStatus: boolean;
  private readonly assignees: string[];
  private readonly oauth: PmsOAuthCredentials;
  private readonly pageSize: number;
  private readonly networkTimeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly onCommentFetchWarning?: PmsTrackerClientOptions["onCommentFetchWarning"];

  constructor(options: PmsTrackerClientOptions) {
    this.restBaseUrl = resolvePmsRestBaseUrl(options.serverUrl);
    this.browseBaseUrl = resolvePmsBrowseBaseUrl(options.serverUrl);
    this.projectKey = options.projectKey;
    this.activeStates = [...options.activeStates];
    this.issueTypes = [...(options.issueTypes ?? [])];
    this.excludeDraftStatus = options.excludeDraftStatus ?? false;
    this.assignees = [...(options.assignees ?? [])];
    this.oauth = options.oauth;
    this.pageSize = options.pageSize ?? DEFAULT_PMS_PAGE_SIZE;
    this.networkTimeoutMs =
      options.networkTimeoutMs ?? DEFAULT_PMS_NETWORK_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.onCommentFetchWarning = options.onCommentFetchWarning;
  }

  static fromConfig(config: ResolvedWorkflowConfig): PmsTrackerClient {
    const oauthConfig = config.tracker.oauth;
    if (oauthConfig === null) {
      throw new TrackerError(
        ERROR_CODES.trackerCredentialsMissing,
        "PMS tracker OAuth configuration is required.",
      );
    }

    const accessToken = oauthConfig.accessToken?.trim() ?? "";
    const accessTokenSecret = oauthConfig.accessTokenSecret?.trim() ?? "";
    const rsaPrivateKeyPath = oauthConfig.rsaPrivateKeyPath?.trim() ?? "";

    if (
      accessToken === "" ||
      accessTokenSecret === "" ||
      rsaPrivateKeyPath === ""
    ) {
      throw new TrackerError(
        ERROR_CODES.trackerCredentialsMissing,
        "PMS OAuth access token, secret, and RSA private key path are required.",
      );
    }

    return new PmsTrackerClient({
      serverUrl: config.tracker.endpoint,
      projectKey: config.tracker.projectSlug,
      activeStates: config.tracker.activeStates,
      issueTypes: config.tracker.issueTypes,
      excludeDraftStatus: config.tracker.excludeDraftStatus,
      assignees: config.tracker.assignees,
      oauth: {
        consumerKey: oauthConfig.consumerKey,
        accessToken,
        accessTokenSecret,
        privateKeyPem: loadRsaPrivateKeyPem(rsaPrivateKeyPath),
      },
    });
  }

  async validateAuth(): Promise<void> {
    const url = `${this.restBaseUrl}/myself`;
    const response = await this.authenticatedFetch("GET", url);

    if (response.status === 401 || response.status === 403) {
      throw new TrackerError(
        ERROR_CODES.trackerCredentialsMissing,
        `PMS OAuth authentication failed with HTTP ${response.status}.`,
        { status: response.status },
      );
    }

    if (!response.ok) {
      throw new TrackerError(
        ERROR_CODES.trackerHttpError,
        `PMS auth validation failed with HTTP ${response.status}.`,
        { status: response.status },
      );
    }
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    const jql = buildCandidateIssuesJql(
      this.requireProjectKey(),
      this.activeStates,
      this.projectJqlOptions(),
    );
    const issues = await this.searchIssues(jql, ISSUE_SEARCH_FIELDS);
    await this.attachCommentsToIssues(issues);
    return issues;
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    if (stateNames.length === 0) {
      return [];
    }

    const jql = buildIssuesByStatesJql(
      this.requireProjectKey(),
      stateNames,
      this.projectJqlOptions(),
    );
    return this.searchIssues(jql, ISSUE_SEARCH_FIELDS);
  }

  private projectJqlOptions() {
    return {
      issueTypes: this.issueTypes,
      excludeDraftStatus: this.excludeDraftStatus,
      assignees: this.assignees,
    };
  }

  async listIssueComments(issueKey: string): Promise<TrackerComment[]> {
    const url = `${this.restBaseUrl}/issue/${encodeURIComponent(issueKey)}/comment`;
    const response = await this.authenticatedFetch("GET", url);
    const text = await response.text();
    if (!response.ok) {
      throw new TrackerError(
        ERROR_CODES.trackerHttpError,
        `PMS comment list failed with HTTP ${response.status}.`,
        { status: response.status, details: text.slice(0, 800) },
      );
    }

    let parsed: { comments?: unknown };
    try {
      parsed = JSON.parse(text) as { comments?: unknown };
    } catch (error) {
      throw new TrackerError(
        ERROR_CODES.trackerResponseMalformed,
        "PMS comment payload was not JSON.",
        { cause: error },
      );
    }

    if (!Array.isArray(parsed.comments)) {
      return [];
    }

    return parsed.comments
      .map((entry) => normalizePmsComment(entry))
      .filter((entry): entry is TrackerComment => entry !== null);
  }

  async addIssueComment(
    issueKey: string,
    body: string,
  ): Promise<PmsWriteResult> {
    const url = `${this.restBaseUrl}/issue/${encodeURIComponent(issueKey)}/comment`;
    const response = await this.authenticatedFetch("POST", url, { body });
    const responseText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      errorBody: response.ok ? "" : responseText.slice(0, 800),
    };
  }

  async listIssueTransitions(issueKey: string): Promise<PmsTransitionEntry[]> {
    const url = `${this.restBaseUrl}/issue/${encodeURIComponent(issueKey)}/transitions`;
    const response = await this.authenticatedFetch("GET", url);
    const text = await response.text();
    if (!response.ok) {
      throw new TrackerError(
        ERROR_CODES.trackerHttpError,
        `PMS transitions list failed with HTTP ${response.status}.`,
        { status: response.status, details: text.slice(0, 800) },
      );
    }

    const parsed = JSON.parse(text) as { transitions?: unknown };
    if (!Array.isArray(parsed.transitions)) {
      return [];
    }

    return parsed.transitions
      .map((entry) => normalizePmsTransition(entry))
      .filter((entry): entry is PmsTransitionEntry => entry !== null);
  }

  async transitionIssue(
    issueKey: string,
    transitionId: string,
  ): Promise<PmsWriteResult> {
    const url = `${this.restBaseUrl}/issue/${encodeURIComponent(issueKey)}/transitions`;
    const response = await this.authenticatedFetch("POST", url, {
      transition: { id: transitionId },
    });
    const responseText = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      errorBody: response.ok ? "" : responseText.slice(0, 800),
    };
  }

  async transitionIssueByTarget(
    issueKey: string,
    targetSubstr: string,
  ): Promise<PmsWriteResult & { transitionId: string | null }> {
    const transitions = await this.listIssueTransitions(issueKey);
    const match = findTransitionMatch(transitions, targetSubstr);
    if (match === null) {
      return {
        ok: false,
        status: 0,
        errorBody: `No unique transition match for ${JSON.stringify(targetSubstr)}`,
        transitionId: null,
      };
    }

    const result = await this.transitionIssue(issueKey, match.id);
    return { ...result, transitionId: match.id };
  }

  private async attachCommentsToIssues(issues: Issue[]): Promise<void> {
    await Promise.all(
      issues.map(async (issue) => {
        try {
          const comments = await this.listIssueComments(issue.identifier);
          issue.trackerComments = comments;
        } catch (error) {
          issue.trackerComments = [];
          this.onCommentFetchWarning?.({
            issueKey: issue.identifier,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }

  async fetchIssueStatesByIds(
    issueIds: string[],
  ): Promise<IssueStateSnapshot[]> {
    if (issueIds.length === 0) {
      return [];
    }

    const jql = buildIssueStatesByIdsJql(issueIds);
    const nodes = await this.searchIssueNodes(jql, STATE_REFRESH_FIELDS);
    return nodes.map((node) => normalizePmsIssueState(node));
  }

  private async searchIssues(jql: string, fields: string): Promise<Issue[]> {
    const nodes = await this.searchIssueNodes(jql, fields);
    return nodes.map((node) => normalizePmsIssue(node, this.browseBaseUrl));
  }

  private async searchIssueNodes(
    jql: string,
    fields: string,
  ): Promise<unknown[]> {
    const nodes: unknown[] = [];
    let startAt = 0;
    const fieldList = resolveSearchFieldList(fields);

    while (true) {
      const url = `${this.restBaseUrl}/search`;
      const response = await this.authenticatedFetch("POST", url, {
        jql,
        startAt,
        maxResults: this.pageSize,
        fields: fieldList,
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw toPmsSearchError(response.status, jql, startAt, responseText);
      }

      let body: JiraSearchResponse;
      try {
        body = JSON.parse(responseText) as JiraSearchResponse;
      } catch (error) {
        throw new TrackerError(
          ERROR_CODES.trackerResponseMalformed,
          "PMS search returned a non-JSON payload.",
          { cause: error },
        );
      }

      const pageNodes = body.issues;
      if (!Array.isArray(pageNodes)) {
        throw new TrackerError(
          ERROR_CODES.trackerResponseMalformed,
          "PMS search payload was missing issues.",
          { details: body },
        );
      }

      nodes.push(...pageNodes);

      if (pageNodes.length < this.pageSize) {
        break;
      }

      startAt += pageNodes.length;
    }

    return nodes;
  }

  private async authenticatedFetch(
    method: string,
    url: string,
    jsonBody?: Record<string, unknown>,
  ): Promise<Response> {
    const authorization = buildOAuthAuthorizationHeader(
      method,
      url,
      this.oauth,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.networkTimeoutMs);

    try {
      return await this.fetchFn(url, {
        method,
        headers: {
          authorization,
          accept: "application/json",
          ...(jsonBody === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
        ...(jsonBody === undefined ? {} : { body: JSON.stringify(jsonBody) }),
        signal: controller.signal,
      });
    } catch (error) {
      throw toTrackerRequestError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private requireProjectKey(): string {
    if (!this.projectKey || this.projectKey.trim() === "") {
      throw new TrackerError(
        ERROR_CODES.missingTrackerProjectSlug,
        "PMS tracker project key is required.",
      );
    }

    return this.projectKey.trim();
  }
}

function normalizePmsComment(entry: unknown): TrackerComment | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as {
    body?: unknown;
    author?: { displayName?: unknown; name?: unknown };
    created?: unknown;
  };

  const body =
    typeof record.body === "string"
      ? record.body
      : record.body === null || record.body === undefined
        ? ""
        : String(record.body);

  const authorRecord = record.author;
  const authorName =
    authorRecord && typeof authorRecord === "object"
      ? typeof authorRecord.displayName === "string"
        ? authorRecord.displayName
        : typeof authorRecord.name === "string"
          ? authorRecord.name
          : null
      : null;

  return {
    author: authorName,
    body,
    createdAt: typeof record.created === "string" ? record.created : null,
  };
}

function normalizePmsTransition(entry: unknown): PmsTransitionEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as {
    id?: unknown;
    name?: unknown;
    to?: { name?: unknown };
  };

  const id =
    typeof record.id === "string"
      ? record.id
      : typeof record.id === "number"
        ? String(record.id)
        : null;
  const name = typeof record.name === "string" ? record.name : null;
  const toStatus = typeof record.to?.name === "string" ? record.to.name : "";

  if (id === null || name === null) {
    return null;
  }

  return { id, name, toStatus };
}

export async function validatePmsTrackerAuthIfConfigured(
  config: ResolvedWorkflowConfig,
  tracker: IssueTracker,
): Promise<void> {
  if (config.tracker.kind?.trim().toLowerCase() !== "pms") {
    return;
  }

  if (config.tracker.oauth?.validateOnDispatch === false) {
    return;
  }

  if (!(tracker instanceof PmsTrackerClient)) {
    return;
  }

  await tracker.validateAuth();
}
