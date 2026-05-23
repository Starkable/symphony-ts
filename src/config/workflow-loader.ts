import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parse } from "yaml";

import type { WorkflowDefinition } from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";
import { WORKFLOW_FILENAME } from "./defaults.js";

export class WorkflowLoaderError extends Error {
  readonly code: string;
  readonly workflowPath: string;

  constructor(input: { code: string; message: string; workflowPath: string }) {
    super(input.message);
    this.name = "WorkflowLoaderError";
    this.code = input.code;
    this.workflowPath = input.workflowPath;
  }
}

export function resolveWorkflowPath(workflowPath?: string): string {
  if (workflowPath && workflowPath.trim() !== "") {
    return resolve(workflowPath);
  }

  return resolve(process.cwd(), WORKFLOW_FILENAME);
}

// 加载工作流定义：从文件中读取工作流定义
export async function loadWorkflowDefinition(
  workflowPath?: string,
): Promise<WorkflowDefinition & { workflowPath: string }> {
  // 解析工作流路径：如果工作流路径为空，则使用默认的工作流路径
  const resolvedWorkflowPath = resolveWorkflowPath(workflowPath);
  // 读取工作流内容：从文件中读取工作流内容

  let content: string;
  // 读取工作流内容：如果文件不存在，则抛出错误
  try {
    content = await readFile(resolvedWorkflowPath, "utf8");
  } catch (error) {
    // 如果文件不存在，则抛出错误
    const errorCode =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code === "ENOENT"
        ? ERROR_CODES.missingWorkflowFile
        : ERROR_CODES.workflowReadFailed;

    throw new WorkflowLoaderError({
      code: errorCode,
      message: `Unable to read workflow file at ${resolvedWorkflowPath}.`,
      workflowPath: resolvedWorkflowPath,
    });
  }

  // 解析工作流内容：解析工作流内容，即将文本转成内部对象
  const workflow = parseWorkflowContent(content, resolvedWorkflowPath);
  // 返回工作流定义
  return {
    ...workflow, // 工作流定义
    workflowPath: resolvedWorkflowPath, // 工作流路径
  };
}
// 解析工作流内容：解析工作流内容
export function parseWorkflowContent(
  content: string,
  workflowPath = WORKFLOW_FILENAME,
): WorkflowDefinition {
  // 如果工作流内容不以---开头，则返回工作流定义
  if (!content.startsWith("---")) {
    return {
      config: {},
      promptTemplate: content.trim(),
    };
  }

  // 分割前言：分割前言
  const frontMatterResult = splitFrontMatter(content, workflowPath);
  // 解析YAML前言：解析YAML前言
  const parsedConfig = parseYamlFrontMatter(
    frontMatterResult.frontMatter,
    workflowPath,
  );
  // 返回工作流定义
  return {
    config: parsedConfig,
    promptTemplate: frontMatterResult.body.trim(),
  };
}

function splitFrontMatter(
  content: string,
  workflowPath: string,
): {
  frontMatter: string;
  body: string;
} {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");

  if (lines[0] !== "---") {
    return {
      frontMatter: "",
      body: normalizedContent,
    };
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line === "---",
  );
  if (closingIndex === -1) {
    throw new WorkflowLoaderError({
      code: ERROR_CODES.workflowParseError,
      message: "Workflow front matter is missing a closing delimiter.",
      workflowPath,
    });
  }

  return {
    frontMatter: lines.slice(1, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n"),
  };
}

function parseYamlFrontMatter(
  yamlSource: string,
  workflowPath: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = parse(yamlSource);
  } catch (error) {
    const details = error instanceof Error ? ` ${error.message}` : "";
    throw new WorkflowLoaderError({
      code: ERROR_CODES.workflowParseError,
      message: `Workflow front matter could not be parsed as YAML.${details}`,
      workflowPath,
    });
  }

  if (parsed === null) {
    throw new WorkflowLoaderError({
      code: ERROR_CODES.workflowFrontMatterNotAMap,
      message: "Workflow front matter must decode to a map/object.",
      workflowPath,
    });
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkflowLoaderError({
      code: ERROR_CODES.workflowFrontMatterNotAMap,
      message: "Workflow front matter must decode to a map/object.",
      workflowPath,
    });
  }

  return parsed as Record<string, unknown>;
}
