import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ArtifactStore } from "../../src/artifact-store/store.js";
import { WorkflowExporter } from "../../src/artifact-store/exporter.js";

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
      `### Meta\n- Phase: clarify\n- ChangeRef: bcs-423\n- Mode: v1-openspec\n`,
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
});
