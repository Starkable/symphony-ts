import { toChangeRef } from "../artifact-store/change-ref.js";

/** Expand `{change_ref}` placeholders in workflow produces paths. */
export function expandChangeRefPath(
  producesPath: string,
  changeRef: string,
): string {
  return producesPath.replace(/\{change_ref\}/g, changeRef);
}

/** Resolve change_ref from issue identifier using kebab-case policy. */
export function resolveChangeRef(issueIdentifier: string): string {
  return toChangeRef(issueIdentifier);
}
