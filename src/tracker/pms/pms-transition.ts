export interface PmsTransitionEntry {
  id: string;
  name: string;
  toStatus: string;
}

export function findTransitionMatch(
  transitions: readonly PmsTransitionEntry[],
  targetSubstr: string,
): PmsTransitionEntry | null {
  const normalized = targetSubstr.trim().toLowerCase();
  if (normalized === "") {
    return null;
  }

  const matches = transitions.filter(
    (entry) =>
      entry.name.toLowerCase().includes(normalized) ||
      entry.toStatus.toLowerCase().includes(normalized),
  );

  if (matches.length === 1) {
    return matches[0] ?? null;
  }

  return null;
}

/** BCS 澄清失败：匹配「暂停开发」→ 开发暂停 */
export const PMS_CLARIFY_TRANSITION_TARGET = "开发暂停";

/** BCS 归档成功：匹配「提测」→ 已提测 */
export const PMS_DONE_TRANSITION_TARGET = "已提测";

export const PMS_STATE_CLARIFY_BLOCKED = "开发暂停";
export const PMS_STATE_DONE = "已提测";
