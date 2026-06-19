import { describe, expect, it } from "vitest";

import {
  resolveArtifactFilePath,
  resolveIssueStorePath,
} from "../../src/artifact-store/path-safety.js";
import { WorkspacePathError } from "../../src/workspace/path-safety.js";

describe("artifact store path safety", () => {
  it("resolves issue directories under store root", () => {
    const issuePath = resolveIssueStorePath("C:/symphony-artifacts", "BCS-423");
    expect(issuePath).toContain("BCS-423");
    expect(issuePath.startsWith("C:")).toBe(true);
  });

  it("rejects artifact paths with parent segments", () => {
    expect(() =>
      resolveArtifactFilePath({
        storeRoot: "C:/symphony-artifacts",
        issueIdentifier: "BCS-423",
        relativePath: "../../outside.txt",
      }),
    ).toThrow(WorkspacePathError);
  });
});
