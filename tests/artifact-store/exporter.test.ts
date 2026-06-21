import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { WorkflowExporter } from "../../src/artifact-store/exporter.js";
import { ArtifactStore } from "../../src/artifact-store/store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  // temp cleanup handled by OS for mkdtemp prefixes
});

describe("workflow exporter", () => {
  it("exports workpad and manifest into artifact store", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "symphony-store-"));
    tempDirs.push(storeRoot);
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-ws-"));
    tempDirs.push(workspacePath);

    await mkdir(join(workspacePath, ".symphony"), { recursive: true });
    await writeFile(
      join(workspacePath, ".symphony", "workpad.md"),
      "### Meta\n- Phase: clarify\n- ChangeRef: bcs-423\n- Mode: v1-openspec\n",
      "utf8",
    );

    const store = new ArtifactStore({
      enabled: true,
      root: storeRoot,
      hydrateOnCreate: false,
    });
    const exporter = new WorkflowExporter(store);

    await exporter.exportIssue({
      issue: {
        id: "1",
        identifier: "BCS-423",
        title: "Test issue",
        priority: 2,
      },
      workspacePath,
      running: null,
    });

    const manifest = await store.readManifest("BCS-423");
    expect(manifest?.issue_identifier).toBe("BCS-423");
    expect(manifest?.current_phase).toBe("clarify");

    const metaRaw = await readFile(
      join(storeRoot, "BCS-423", "meta.json"),
      "utf8",
    );
    expect(JSON.parse(metaRaw).title).toBe("Test issue");
  });

  it("skips export when workspace has no symphony artifacts", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "symphony-store-skip-"));
    tempDirs.push(storeRoot);
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-ws-empty-"));
    tempDirs.push(workspacePath);

    const store = new ArtifactStore({
      enabled: true,
      root: storeRoot,
      hydrateOnCreate: false,
    });
    const exporter = new WorkflowExporter(store);

    const result = await exporter.exportIssueIfExportable({
      issue: {
        id: "2172597",
        identifier: "BCS-420",
        title: "Terminal issue",
        priority: null,
      },
      workspacePath,
      running: null,
      setArchivedReason: "pms_terminal_cleanup",
    });

    expect(result).toEqual({ exported: false, reason: "empty_workspace" });
    expect(await store.readManifest("BCS-420")).toBeNull();
  });

  it("writes archived_reason when terminal cleanup export succeeds", async () => {
    const storeRoot = await mkdtemp(join(tmpdir(), "symphony-store-arch-"));
    tempDirs.push(storeRoot);
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-ws-arch-"));
    tempDirs.push(workspacePath);

    const changeDir = join(workspacePath, "openspec", "changes", "bcs-420");
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, "proposal.md"), "# Proposal\n", "utf8");

    const store = new ArtifactStore({
      enabled: true,
      root: storeRoot,
      hydrateOnCreate: false,
    });
    const exporter = new WorkflowExporter(store);

    const result = await exporter.exportIssueIfExportable({
      issue: {
        id: "2172597",
        identifier: "BCS-420",
        title: "Terminal issue",
        priority: null,
      },
      workspacePath,
      running: null,
      setArchivedReason: "pms_terminal_cleanup",
    });

    expect(result).toEqual({ exported: true });
    const meta = await store.readMeta("BCS-420");
    expect(meta?.archived_reason).toBe("pms_terminal_cleanup");
  });
});
