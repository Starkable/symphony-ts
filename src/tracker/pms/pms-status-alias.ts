import { normalizeIssueState } from "../../domain/model.js";

/** JQL/config 名 → API 展示名（PMS BCS/CS 常见映射） */
export const PMS_STATE_ALIASES: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    "in progress": ["进行中"],
    open: ["待办"],
  });

export function issueStateMatchesStates(
  issueState: string,
  configStates: readonly string[],
  aliases: Readonly<Record<string, readonly string[]>> = PMS_STATE_ALIASES,
): boolean {
  const normalized = normalizeIssueState(issueState);
  if (normalized === "") {
    return false;
  }

  for (const configState of configStates) {
    const normalizedConfig = normalizeIssueState(configState);
    if (normalizedConfig === normalized) {
      return true;
    }

    const aliasList = aliases[normalizedConfig] ?? [];
    for (const alias of aliasList) {
      if (normalizeIssueState(alias) === normalized) {
        return true;
      }
    }
  }

  return false;
}

export function issueStateMatchesTerminalStates(
  issueState: string,
  terminalStates: readonly string[],
  aliases: Readonly<Record<string, readonly string[]>> = PMS_STATE_ALIASES,
): boolean {
  return issueStateMatchesStates(issueState, terminalStates, aliases);
}
