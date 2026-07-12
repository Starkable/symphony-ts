import { Liquid } from "liquidjs";

import type {
  Issue,
  TrackerComment,
  WorkflowDefinition,
} from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";

export const DEFAULT_WORKFLOW_PROMPT =
  "You are working on an issue from Linear.";

const liquidEngine = new Liquid({
  strictVariables: true,
  strictFilters: true,
  ownPropertyOnly: true,
});

export class PromptTemplateError extends Error {
  readonly code: string;
  readonly kind: "template_parse_error" | "template_render_error";

  constructor(
    kind: "template_parse_error" | "template_render_error",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PromptTemplateError";
    this.code =
      kind === "template_parse_error"
        ? ERROR_CODES.templateParseError
        : ERROR_CODES.templateRenderError;
    this.kind = kind;
  }
}

export const DEFAULT_TRACKER_COMMENT_PROMPT_LIMIT = 10;

export interface RenderPromptInput {
  workflow: Pick<WorkflowDefinition, "promptTemplate">;
  issue: Issue;
  attempt: number | null;
}

export interface WorkflowDispatchInjection {
  effectivePhaseId: string;
  skill: string;
  producesPath: string;
  changeRef: string;
}

export interface BuildTurnPromptInput extends RenderPromptInput {
  turnNumber: number;
  maxTurns: number;
  workflowDispatch?: WorkflowDispatchInjection | null;
}

export function getEffectivePromptTemplate(promptTemplate: string): string {
  const trimmed = promptTemplate.trim();

  return trimmed.length > 0 ? trimmed : DEFAULT_WORKFLOW_PROMPT;
}

export async function renderPrompt(input: RenderPromptInput): Promise<string> {
  const template = getEffectivePromptTemplate(input.workflow.promptTemplate);

  try {
    const parsedTemplate = liquidEngine.parse(template);

    return appendTrackerCommentsSection(
      await liquidEngine.render(parsedTemplate, {
        issue: toTemplateIssue(input.issue),
        attempt: input.attempt,
      }),
      input.issue.trackerComments ?? [],
    );
  } catch (error) {
    throw toPromptTemplateError(error);
  }
}

export async function buildTurnPrompt(
  input: BuildTurnPromptInput,
): Promise<string> {
  const basePrompt =
    input.turnNumber <= 1
      ? await renderPrompt(input)
      : buildContinuationPrompt({
          issue: input.issue,
          attempt: input.attempt,
          turnNumber: input.turnNumber,
          maxTurns: input.maxTurns,
        });

  if (input.workflowDispatch === null || input.workflowDispatch === undefined) {
    return basePrompt;
  }

  return appendWorkflowDispatchSection(basePrompt, input.workflowDispatch);
}

export function buildSymphonyPolicySection(changeRef: string): string {
  return [
    "## Symphony Policy (V1.2)",
    `- 仅操作 openspec/changes/${changeRef}/`,
    "- 禁止 AskUserQuestion 选择 change 或阻塞性确认",
    "- 只执行当前 effective_phase 对应 skill；禁止跳步",
    "- 禁止未授权 git push",
  ].join("\n");
}

export function appendWorkflowDispatchSection(
  basePrompt: string,
  dispatch: WorkflowDispatchInjection,
): string {
  const policySection = buildSymphonyPolicySection(dispatch.changeRef);

  if (dispatch.effectivePhaseId === "done") {
    return [
      basePrompt,
      "",
      "## Symphony Workflow (V1.2)",
      `- change_ref: ${dispatch.changeRef}`,
      "- effective_phase: done",
      "- All workflow artifacts are complete.",
      "",
      policySection,
    ].join("\n");
  }

  const skillCommand = dispatch.skill.startsWith("/")
    ? dispatch.skill
    : `/${dispatch.skill}`;

  return [
    basePrompt,
    "",
    "## Symphony Workflow (V1.2)",
    `- change_ref: ${dispatch.changeRef}`,
    `- effective_phase: ${dispatch.effectivePhaseId}`,
    `- skill: ${skillCommand}`,
    `- handler: ${skillCommand}`,
    `- produces: ${dispatch.producesPath}`,
    "",
    `Run ${skillCommand} for this phase and write the artifact to ${dispatch.producesPath}.`,
    "",
    policySection,
  ].join("\n");
}

export function buildContinuationPrompt(input: {
  issue: Issue;
  attempt: number | null;
  turnNumber: number;
  maxTurns: number;
}): string {
  const attemptLine =
    input.attempt === null
      ? "This worker session started from the initial dispatch."
      : `This worker session is running retry/continuation attempt ${input.attempt}.`;

  return [
    `Continue working on issue ${input.issue.identifier}: ${input.issue.title}.`,
    `This is continuation turn ${input.turnNumber} of ${input.maxTurns} in the current worker session.`,
    attemptLine,
    `Current tracker state: ${input.issue.state}.`,
    "Reuse the existing thread context and current workspace state.",
    "Do not restate the original task prompt unless it is strictly needed.",
    "Make the next best progress on the issue, then stop when this session has no further useful work to do.",
  ].join("\n");
}

function toTemplateIssue(issue: Issue): Record<string, unknown> {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    state: issue.state,
    branch_name: issue.branchName,
    url: issue.url,
    labels: [...issue.labels],
    blocked_by: issue.blockedBy.map((blocker) => ({
      id: blocker.id,
      identifier: blocker.identifier,
      state: blocker.state,
    })),
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
    tracker_comments: (issue.trackerComments ?? []).map((comment) => ({
      author: comment.author,
      body: comment.body,
      created_at: comment.createdAt,
    })),
  };
}

export function appendTrackerCommentsSection(
  basePrompt: string,
  comments: readonly TrackerComment[],
  limit = DEFAULT_TRACKER_COMMENT_PROMPT_LIMIT,
): string {
  if (comments.length === 0) {
    return basePrompt;
  }

  const recent = comments.length <= limit ? comments : comments.slice(-limit);
  const lines = recent.map((comment) => {
    const author = comment.author ?? "unknown";
    const createdAt = comment.createdAt ?? "";
    const prefix =
      createdAt === "" ? `- ${author}: ` : `- ${author} @ ${createdAt}: `;
    return `${prefix}${comment.body}`;
  });

  return [basePrompt, "", "## PMS 备注", ...lines].join("\n");
}

function toPromptTemplateError(error: unknown): PromptTemplateError {
  if (error instanceof PromptTemplateError) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    if (getErrorMessage(error).includes("undefined filter")) {
      return new PromptTemplateError(
        "template_render_error",
        getErrorMessage(error),
        { cause: error },
      );
    }

    if (error.name === "ParseError" || error.name === "TokenizationError") {
      return new PromptTemplateError(
        "template_parse_error",
        getErrorMessage(error),
        { cause: error },
      );
    }
  }

  return new PromptTemplateError(
    "template_render_error",
    getErrorMessage(error),
    {
      cause: error,
    },
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Prompt rendering failed";
}
