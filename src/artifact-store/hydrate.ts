import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ArtifactStore } from "./store.js";

const WORKPAD_PATH = ".symphony/workpad.md";

export async function hydrateWorkspaceFromStore(input: {
  store: ArtifactStore;
  issueIdentifier: string;
  workspacePath: string;
  enabled: boolean;
}): Promise<boolean> {
  if (!input.enabled || !input.store.isEnabled()) {
    return false;
  }

  const manifest = await input.store.readManifest(input.issueIdentifier);
  if (manifest === null) {
    return false;
  }

  await mkdir(join(input.workspacePath, ".symphony"), { recursive: true });

  const storeIssuePath = input.store.resolveIssuePath(input.issueIdentifier);
  const storedWorkpad = join(storeIssuePath, WORKPAD_PATH);
  try {
    const workpad = await readFile(storedWorkpad, "utf8");
    await writeFile(join(input.workspacePath, WORKPAD_PATH), workpad, "utf8");
  } catch {
    // workpad snapshot optional
  }

  const openspecSource = join(
    storeIssuePath,
    "openspec",
    "changes",
    manifest.change_ref,
  );
  const openspecTarget = join(
    input.workspacePath,
    "openspec",
    "changes",
    manifest.change_ref,
  );
  await mkdir(join(openspecTarget, ".."), { recursive: true });
  await cp(openspecSource, openspecTarget, {
    force: true,
    recursive: true,
  }).catch(() => false);

  return true;
}
