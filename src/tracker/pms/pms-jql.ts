function quoteJqlString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function quoteStatusList(states: string[]): string {
  return states.map((state) => quoteJqlString(state)).join(", ");
}

export function buildCandidateIssuesJql(
  projectKey: string,
  activeStates: string[],
): string {
  if (activeStates.length === 0) {
    return `project = ${quoteJqlString(projectKey)} ORDER BY created ASC`;
  }

  return `project = ${quoteJqlString(projectKey)} AND status in (${quoteStatusList(activeStates)}) ORDER BY created ASC`;
}

export function buildIssuesByStatesJql(
  projectKey: string,
  stateNames: string[],
): string {
  if (stateNames.length === 0) {
    return `project = ${quoteJqlString(projectKey)} ORDER BY created ASC`;
  }

  return `project = ${quoteJqlString(projectKey)} AND status in (${quoteStatusList(stateNames)}) ORDER BY created ASC`;
}

export function buildIssueStatesByIdsJql(issueIds: string[]): string {
  const numericIds = issueIds
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));
  if (numericIds.length === 0) {
    return "id in (0)";
  }

  return `id in (${numericIds.join(", ")}) ORDER BY created ASC`;
}
