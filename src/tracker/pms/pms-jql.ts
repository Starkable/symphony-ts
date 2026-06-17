function quoteJqlString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function quoteJqlList(values: string[]): string {
  return values.map((value) => quoteJqlString(value)).join(", ");
}

export interface PmsProjectJqlOptions {
  issueTypes?: readonly string[];
  excludeDraftStatus?: boolean;
}

function appendProjectScopeClauses(
  parts: string[],
  projectKey: string,
  options: PmsProjectJqlOptions = {},
): void {
  parts.push(`project = ${quoteJqlString(projectKey)}`);

  const issueTypes = options.issueTypes ?? [];
  if (issueTypes.length > 0) {
    parts.push(`issuetype in (${quoteJqlList([...issueTypes])})`);
  }

  if (options.excludeDraftStatus) {
    parts.push('status not in ("草稿", "审核中")');
  }
}

export function buildCandidateIssuesJql(
  projectKey: string,
  activeStates: string[],
  options: PmsProjectJqlOptions = {},
): string {
  const parts: string[] = [];
  appendProjectScopeClauses(parts, projectKey, options);

  if (activeStates.length > 0) {
    parts.push(`status in (${quoteJqlList(activeStates)})`);
  } else if (options.excludeDraftStatus) {
    parts.push("statusCategory != Done");
  }

  const jql = parts.join(" AND ");
  if (jql === "") {
    return `project = ${quoteJqlString(projectKey)} ORDER BY created ASC`;
  }

  return `${jql} ORDER BY created ASC`;
}

export function buildIssuesByStatesJql(
  projectKey: string,
  stateNames: string[],
  options: PmsProjectJqlOptions = {},
): string {
  if (stateNames.length === 0) {
    return `project = ${quoteJqlString(projectKey)} ORDER BY created ASC`;
  }

  const parts: string[] = [];
  appendProjectScopeClauses(parts, projectKey, options);
  parts.push(`status in (${quoteJqlList(stateNames)})`);
  return `${parts.join(" AND ")} ORDER BY created ASC`;
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
