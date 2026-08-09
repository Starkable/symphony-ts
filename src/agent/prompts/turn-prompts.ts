import type { Issue } from "../../domain/model.js";

/** WORKFLOW body 为空时的默认首轮提示（中性表述，不绑定具体 tracker）。 */
export const DEFAULT_WORKFLOW_PROMPT = "你正在处理一个需求工作项。";

export interface ContinuationPromptInput {
  issue: Issue;
  attempt: number | null;
  turnNumber: number;
  maxTurns: number;
}

/**
 * 组装续跑 turn 的中文提示正文。
 * 入口：turnNumber > 1；返回：可直接作为 turn prompt 的多行文本。
 */
export function buildContinuationPrompt(input: ContinuationPromptInput): string {
  const attemptLine =
    input.attempt === null
      ? "本 worker 会话由首次调度启动。"
      : `本 worker 会话正在执行重试/续跑 attempt ${input.attempt}。`;

  return [
    `继续处理工作项 ${input.issue.identifier}：${input.issue.title}。`,
    `这是当前 worker 会话的续跑 turn ${input.turnNumber} / ${input.maxTurns}。`,
    attemptLine,
    `当前 tracker 状态：${input.issue.state}。`,
    "复用已有 thread 上下文与当前 workspace 状态。",
    "除非确有必要，否则不要重复陈述原始任务提示。",
    "在本工作项上推进下一步最有价值的进展；若本会话已无更多有用工作，则停止。",
  ].join("\n");
}
