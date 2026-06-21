import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkflowArtifactStoreConfig } from "../config/types.js";
import { toChangeRef } from "./change-ref.js";
import {
  resolveArtifactFilePath,
  resolveArtifactStoreRoot,
  resolveIssueStorePath,
} from "./path-safety.js";
import { buildSyntheticArtifactContent } from "./phase-artifacts.js";
import type {
  V1TerminalPhase,
  WorkflowDetail,
  WorkflowManifest,
  WorkflowMeta,
  WorkflowSummary,
} from "./types.js";
import { V1_BUSINESS_PHASES } from "./types.js";
import { parseWorkpad } from "./workpad-parser.js";

export class ArtifactStore {
  readonly root: string;
  readonly enabled: boolean;

  constructor(config: WorkflowArtifactStoreConfig) {
    this.enabled = config.enabled && config.root !== null;
    this.root = config.root ?? resolveArtifactStoreRoot("");
  }

  isEnabled(): boolean {
    return this.enabled && this.root.length > 0;
  }

  resolveIssuePath(issueIdentifier: string): string {
    return resolveIssueStorePath(this.root, issueIdentifier);
  }

  async ensureIssueDirectory(issueIdentifier: string): Promise<string> {
    const issuePath = this.resolveIssuePath(issueIdentifier);
    await mkdir(issuePath, { recursive: true });
    return issuePath;
  }

  async writeMeta(issueIdentifier: string, meta: WorkflowMeta): Promise<void> {
    const issuePath = await this.ensureIssueDirectory(issueIdentifier);
    await writeFile(
      join(issuePath, "meta.json"),
      `${JSON.stringify(meta, null, 2)}\n`,
      "utf8",
    );
  }

  async writeManifest(manifest: WorkflowManifest): Promise<void> {
    const issuePath = await this.ensureIssueDirectory(
      manifest.issue_identifier,
    );
    await writeFile(
      join(issuePath, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }

  async readMeta(issueIdentifier: string): Promise<WorkflowMeta | null> {
    return readJson<WorkflowMeta>(
      join(this.resolveIssuePath(issueIdentifier), "meta.json"),
    );
  }

  async readManifest(
    issueIdentifier: string,
  ): Promise<WorkflowManifest | null> {
    return readJson<WorkflowManifest>(
      join(this.resolveIssuePath(issueIdentifier), "manifest.json"),
    );
  }

  async readArtifactFile(input: {
    issueIdentifier: string;
    relativePath: string;
  }): Promise<{ content: string; contentType: string } | null> {
    if (input.relativePath.startsWith("synthetic://")) {
      const workpadPath = join(
        this.resolveIssuePath(input.issueIdentifier),
        ".symphony/workpad.md",
      );
      try {
        const workpadContent = await readFile(workpadPath, "utf8");
        const parsed = parseWorkpad(workpadContent);
        const synthetic = buildSyntheticArtifactContent(
          input.relativePath,
          parsed,
        );
        if (synthetic === null) {
          return null;
        }
        return {
          content: synthetic,
          contentType: "text/markdown; charset=utf-8",
        };
      } catch {
        return null;
      }
    }

    const filePath = resolveArtifactFilePath({
      storeRoot: this.root,
      issueIdentifier: input.issueIdentifier,
      relativePath: input.relativePath,
    });

    try {
      const content = await readFile(filePath, "utf8");
      return {
        content,
        contentType: contentTypeForPath(filePath),
      };
    } catch {
      return null;
    }
  }

  async listSummaries(): Promise<WorkflowSummary[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const root = resolveArtifactStoreRoot(this.root);
    let entries: string[] = [];
    try {
      entries = await readdir(root);
    } catch {
      return [];
    }

    const summaries: WorkflowSummary[] = [];
    for (const entry of entries) {
      const manifestPath = join(root, entry, "manifest.json");
      const manifest = await readJson<WorkflowManifest>(manifestPath);
      if (manifest === null) {
        continue;
      }
      const meta = await readJson<WorkflowMeta>(join(root, entry, "meta.json"));
      summaries.push(toSummary(manifest, meta));
    }

    return summaries.sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at),
    );
  }

  async getDetail(issueIdentifier: string): Promise<WorkflowDetail | null> {
    const manifest = await this.readManifest(issueIdentifier);
    if (manifest === null) {
      return null;
    }

    const meta =
      (await this.readMeta(issueIdentifier)) ??
      defaultMeta(issueIdentifier, manifest);

    return {
      ...meta,
      manifest,
    };
  }
}

export function toSummary(
  manifest: WorkflowManifest,
  meta: WorkflowMeta | null,
): WorkflowSummary {
  const completed = manifest.phases.filter(
    (phase) => phase.status === "completed",
  ).length;
  const artifactCount = manifest.phases.reduce(
    (total, phase) => total + phase.artifacts.length,
    0,
  );

  return {
    issue_identifier: manifest.issue_identifier,
    title: meta?.title ?? null,
    current_phase: manifest.current_phase,
    phase_progress: {
      completed,
      total: V1_BUSINESS_PHASES.length,
    },
    runtime: manifest.runtime,
    started_at: meta?.created_at ?? manifest.updated_at,
    updated_at: manifest.updated_at,
    artifact_count: artifactCount,
    priority: meta?.priority ?? null,
    terminal_phase:
      meta?.terminal_phase ?? terminalPhase(manifest.current_phase),
    archived_reason: meta?.archived_reason ?? null,
  };
}

function terminalPhase(currentPhase: string): V1TerminalPhase | null {
  if (currentPhase === "done") {
    return "done";
  }
  if (currentPhase === "failed") {
    return "failed";
  }
  return null;
}

function defaultMeta(
  issueIdentifier: string,
  manifest: WorkflowManifest,
): WorkflowMeta {
  return {
    issue_identifier: issueIdentifier,
    issue_id: null,
    change_ref: manifest.change_ref ?? toChangeRef(issueIdentifier),
    mode: manifest.mode,
    title: null,
    priority: null,
    terminal_phase: terminalPhase(manifest.current_phase),
    created_at: manifest.updated_at,
    updated_at: manifest.updated_at,
  };
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function contentTypeForPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".md")) {
    return "text/markdown; charset=utf-8";
  }
  if (lower.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (lower.endsWith(".log") || lower.endsWith(".txt")) {
    return "text/plain; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

export async function countStoreArtifacts(issuePath: string): Promise<number> {
  let count = 0;
  try {
    const manifest = await readJson<WorkflowManifest>(
      join(issuePath, "manifest.json"),
    );
    if (manifest !== null) {
      count = manifest.phases.reduce(
        (total, phase) => total + phase.artifacts.length,
        0,
      );
    }
  } catch {
    // ignore
  }
  return count;
}

export async function storeHasManifest(issuePath: string): Promise<boolean> {
  try {
    const info = await stat(join(issuePath, "manifest.json"));
    return info.isFile();
  } catch {
    return false;
  }
}
