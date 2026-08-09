import { Liquid } from "liquidjs";

import type {
  Issue,
  TrackerComment,
  WorkflowDefinition,
} from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";
import {
  DEFAULT_WORKFLOW_PROMPT,
  PMS_COMMENTS_SECTION_TITLE,
  WORKFLOW_DONE_MESSAGE,
  WORKFLOW_SECTION_TITLE,
  buildContinuationPrompt,
  buildSkillDeclareGuidance,
  buildSymphonyPolicySection,
} from "./prompts/index.js";

export {
  DEFAULT_WORKFLOW_PROMPT,
  buildContinuationPrompt,
  buildSymphonyPolicySection,
  buildSkillDeclareGuidance,
} from "./prompts/index.js";

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

export function appendWorkflowDispatchSection(
  basePrompt: string,
  dispatch: WorkflowDispatchInjection,
): string {
  const policySection = buildSymphonyPolicySection(dispatch.changeRef);

  if (dispatch.effectivePhaseId === "done") {
    return [
      basePrompt,
      "",
      WORKFLOW_SECTION_TITLE,
      `- change_ref: ${dispatch.changeRef}`,
      "- effective_phase: done",
      `- ${WORKFLOW_DONE_MESSAGE}`,
      "",
      policySection,
    ].join("\n");
  }

  const skillId = dispatch.skill.trim();

  return [
    basePrompt,
    "",
    WORKFLOW_SECTION_TITLE,
    `- change_ref: ${dispatch.changeRef}`,
    `- effective_phase: ${dispatch.effectivePhaseId}`,
    `- skill: ${skillId}`,
    `- produces: ${dispatch.producesPath}`,
    "",
    buildSkillDeclareGuidance({
      skillId,
      producesPath: dispatch.producesPath,
    }),
    "",
    policySection,
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

  return [basePrompt, "", PMS_COMMENTS_SECTION_TITLE, ...lines].join("\n");
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
