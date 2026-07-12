import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expandChangeRefPath } from "./change-ref-path.js";
import { resolveArtifactRelativePath } from "./resolve-artifact-path.js";

export interface ScopeRepoEntry {
  repo_key: string;
  mcp_project: string;
  role: string;
  confidence: string;
  evidence: string[];
}

export interface ScopeJsonDocument {
  version: number;
  primary_repo: string;
  affected_repos: ScopeRepoEntry[];
  materialized: boolean;
  materialized_at: string | null;
}

export interface ScopeJsonLoadResult {
  exists: boolean;
  document: ScopeJsonDocument | null;
  valid: boolean;
  errors: string[];
}

const VALID_ROLES = new Set(["primary", "dependency", "frontend", "other"]);
const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

export async function resolveScopeJsonPath(input: {
  workspacePath: string;
  changeRef: string;
}): Promise<string | null> {
  return await resolveArtifactRelativePath({
    workspacePath: input.workspacePath,
    changeRef: input.changeRef,
    relativePath: expandChangeRefPath(
      "openspec/changes/{change_ref}/scope.json",
      input.changeRef,
    ),
  });
}

export async function loadScopeJson(input: {
  workspacePath: string;
  changeRef: string;
}): Promise<ScopeJsonLoadResult> {
  const scopePath = await resolveScopeJsonPath(input);
  if (scopePath === null) {
    return { exists: false, document: null, valid: false, errors: [] };
  }

  let raw: string;
  try {
    raw = await readFile(join(input.workspacePath, scopePath), "utf8");
  } catch {
    return {
      exists: false,
      document: null,
      valid: false,
      errors: ["scope.json path resolved but file unreadable"],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      exists: true,
      document: null,
      valid: false,
      errors: ["scope.json is not valid JSON"],
    };
  }

  const validation = validateScopeJsonDocument(parsed);
  return {
    exists: true,
    document: validation.document,
    valid: validation.valid,
    errors: validation.errors,
  };
}

export function validateScopeJsonDocument(parsed: unknown): {
  valid: boolean;
  document: ScopeJsonDocument | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, document: null, errors: ["scope.json must be an object"] };
  }

  const record = parsed as Record<string, unknown>;
  if (record.version !== 1) {
    errors.push("scope.json version must be 1");
  }
  if (typeof record.primary_repo !== "string" || record.primary_repo.trim() === "") {
    errors.push("scope.json primary_repo is required");
  }
  if (!Array.isArray(record.affected_repos)) {
    errors.push("scope.json affected_repos must be an array");
  }

  const affectedRepos: ScopeRepoEntry[] = [];
  if (Array.isArray(record.affected_repos)) {
    for (const [index, entry] of record.affected_repos.entries()) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`affected_repos[${index}] must be an object`);
        continue;
      }
      const repo = entry as Record<string, unknown>;
      if (typeof repo.repo_key !== "string" || repo.repo_key.trim() === "") {
        errors.push(`affected_repos[${index}].repo_key is required`);
      }
      if (typeof repo.mcp_project !== "string" || repo.mcp_project.trim() === "") {
        errors.push(`affected_repos[${index}].mcp_project is required`);
      }
      if (typeof repo.role !== "string" || !VALID_ROLES.has(repo.role)) {
        errors.push(`affected_repos[${index}].role is invalid`);
      }
      if (
        typeof repo.confidence !== "string" ||
        !VALID_CONFIDENCE.has(repo.confidence)
      ) {
        errors.push(`affected_repos[${index}].confidence is invalid`);
      }
      if (
        !Array.isArray(repo.evidence) ||
        repo.evidence.length === 0 ||
        !repo.evidence.every((item) => typeof item === "string" && item.trim() !== "")
      ) {
        errors.push(`affected_repos[${index}].evidence must be a non-empty string array`);
      }

      if (typeof repo.repo_key === "string") {
        affectedRepos.push({
          repo_key: repo.repo_key,
          mcp_project: String(repo.mcp_project ?? ""),
          role: String(repo.role ?? ""),
          confidence: String(repo.confidence ?? ""),
          evidence: Array.isArray(repo.evidence)
            ? repo.evidence.filter((item): item is string => typeof item === "string")
            : [],
        });
      }
    }
  }

  const materialized = record.materialized === true;
  const materializedAt =
    record.materialized_at === null || record.materialized_at === undefined
      ? null
      : String(record.materialized_at);

  if (errors.length > 0) {
    return { valid: false, document: null, errors };
  }

  return {
    valid: true,
    document: {
      version: 1,
      primary_repo: String(record.primary_repo),
      affected_repos: affectedRepos,
      materialized,
      materialized_at: materializedAt,
    },
    errors: [],
  };
}

export function scopeRequiresMaterialization(scope: ScopeJsonDocument | null): boolean {
  if (scope === null) {
    return false;
  }
  return scope.affected_repos.some((entry) => entry.confidence !== "low");
}

export function isScopeMaterialized(scope: ScopeJsonDocument | null): boolean {
  return scope?.materialized === true;
}

export function phaseRequiresMaterializationGate(phaseId: string): boolean {
  return phaseId === "plan" || phaseId === "execute";
}
