/** V1 Policy: ChangeRef = kebab-case(issue.identifier). */
export function toChangeRef(issueIdentifier: string): string {
  return issueIdentifier
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
