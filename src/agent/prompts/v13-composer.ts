import type { Issue } from "../../domain/model.js";
import type { WorkflowPhaseConfig } from "../../config/types.js";
import {
  artifactMeaning,
  resolvePhaseOutputs,
  resolvePhaseReadsFrom,
} from "../../workflow/v13-stage-catalog.js";
import { resolveArtifactRelativePath } from "../../workflow/artifact-path-resolver.js";

export const V13_SECTION_TITLE = "## Symphony 工作流 (V1.3)";

export interface ComposeV13PromptInput {
  issue: Issue;
  changeRef: string;
  stage: WorkflowPhaseConfig;
  complete: boolean;
}

export function composeV13WorkflowSection(
  input: ComposeV13PromptInput,
): string {
  if (input.complete) {
    return [
      V13_SECTION_TITLE,
      `- change_ref: ${input.changeRef}`,
      "- 当前阶段: 已完成",
      "- 本 issue 工作流已全部完成，无需继续执行阶段任务。",
    ].join("\n");
  }

  const reads = resolvePhaseReadsFrom(input.stage);
  const outputs = resolvePhaseOutputs(input.stage);
  const primaryOutput = outputs[0] ?? `${input.stage.id}.json`;
  const outputSchema =
    input.stage.outputSchema?.trim() || `${input.stage.id}@v1`;

  const issueBlock = [
    "### 工单",
    `- 标识: ${input.issue.identifier}`,
    `- 标题: ${input.issue.title}`,
    input.issue.description !== null && input.issue.description.length > 0
      ? `- 描述: ${input.issue.description}`
      : "- 描述: （无）",
  ].join("\n");

  const taskBlock = [
    "### 任务",
    `请使用 skill \`${input.stage.skill}\` 完成本阶段操作。`,
    "仅关注本阶段目标，不要跳步或执行未授权推送。",
  ].join("\n");

  const indexLines =
    reads.length === 0
      ? ["（无前置产物，请主要依据工单内容。）"]
      : reads.map((name) => {
          const rel = resolveArtifactRelativePath({
            changeRef: input.changeRef,
            logicalName: name,
          });
          return `- \`${rel}\` — ${artifactMeaning(name)}`;
        });

  const artifactsBlock = [
    "### 前置产物索引",
    "以下内容不在本提示中展开；需要时请自行 Read 下列文件。",
    ...indexLines,
  ].join("\n");

  const deliverableRel = resolveArtifactRelativePath({
    changeRef: input.changeRef,
    logicalName: primaryOutput,
  });

  const deliverableBlock = [
    "### 本阶段交付",
    `- 主要文件: \`${deliverableRel}\`（${artifactMeaning(primaryOutput)}）`,
    outputs.length > 1
      ? `- 其他文件: ${outputs
          .slice(1)
          .map(
            (name) =>
              `\`${resolveArtifactRelativePath({ changeRef: input.changeRef, logicalName: name })}\``,
          )
          .join(", ")}`
      : "",
    `- 格式: ${outputSchema}（JSON）`,
    "完成后请写入或更新上述交付文件。",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  return [
    V13_SECTION_TITLE,
    `- change_ref: ${input.changeRef}`,
    `- 当前阶段: ${input.stage.id}`,
    "",
    issueBlock,
    "",
    taskBlock,
    "",
    artifactsBlock,
    "",
    deliverableBlock,
  ].join("\n");
}
