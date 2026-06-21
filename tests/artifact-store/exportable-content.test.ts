import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  hasExportableContent,
  workspaceDirectoryExists,
} from "../../src/artifact-store/exportable-content.js";

describe("hasExportableContent", () => {
  it("returns false when workspace directory does not exist", async () => {
    const workspacePath = join(tmpdir(), "symphony-missing-workspace");
    expect(await workspaceDirectoryExists(workspacePath)).toBe(false);
    expect(await hasExportableContent(workspacePath)).toBe(false);
  });

  it("returns false for empty clone-only workspace", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-empty-ws-"));
    expect(await hasExportableContent(workspacePath)).toBe(false);
  });

  it("returns true when proposal.md exists", async () => {
    const workspacePath = await mkdtemp(
      join(tmpdir(), "symphony-proposal-ws-"),
    );
    const changeDir = join(workspacePath, "openspec", "changes", "bcs-420");
    await mkdir(changeDir, { recursive: true });
    await writeFile(join(changeDir, "proposal.md"), "# Proposal\n", "utf8");

    expect(await hasExportableContent(workspacePath, "BCS-420")).toBe(true);
  });

  it("returns true when only turn log exists", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-log-ws-"));
    const symphonyDir = join(workspacePath, ".symphony");
    await mkdir(symphonyDir, { recursive: true });
    await writeFile(
      join(symphonyDir, "cursor-turn-1.log"),
      "turn output\n",
      "utf8",
    );

    expect(await hasExportableContent(workspacePath)).toBe(true);
  });

  it("returns true when workpad is non-empty", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "symphony-workpad-ws-"));
    const symphonyDir = join(workspacePath, ".symphony");
    await mkdir(symphonyDir, { recursive: true });
    await writeFile(
      join(symphonyDir, "workpad.md"),
      "### Meta\n- Phase: clarify\n",
      "utf8",
    );

    expect(await hasExportableContent(workspacePath)).toBe(true);
  });
});
