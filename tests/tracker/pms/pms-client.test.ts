import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { PmsTrackerClient } from "../../../src/tracker/pms/pms-client.js";

function createTestClient(fetchFn: typeof fetch): PmsTrackerClient {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  return new PmsTrackerClient({
    serverUrl: "http://pms.example.com",
    projectKey: "BASELINEREQ",
    activeStates: ["待开发"],
    oauth: {
      consumerKey: "qa-monitor",
      accessToken: "access-token",
      accessTokenSecret: "access-secret",
      privateKeyPem: privateKey
        .export({ type: "pkcs1", format: "pem" })
        .toString(),
    },
    pageSize: 50,
    fetchFn,
  });
}

describe("pms-client", () => {
  it("validates auth against /myself", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ name: "tester" }, { status: 200 }),
    );
    const client = createTestClient(fetchFn);

    await expect(client.validateAuth()).resolves.toBeUndefined();
    expect(fetchFn).toHaveBeenCalledWith(
      "http://pms.example.com/rest/api/2/myself",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetches candidate issues with pagination", async () => {
    const fullPage = Array.from({ length: 50 }, (_, index) => ({
      id: String(index + 1),
      key: `BASELINEREQ-${index + 1}`,
      fields: {
        summary: `Issue ${index + 1}`,
        status: { name: "待开发" },
        labels: [],
      },
    }));

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            issues: fullPage,
            startAt: 0,
            maxResults: 50,
          },
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            issues: [],
            startAt: 50,
            maxResults: 50,
          },
          { status: 200 },
        ),
      );

    const client = createTestClient(fetchFn);
    const issues = await client.fetchCandidateIssues();

    expect(issues).toHaveLength(50);
    expect(issues[0]?.identifier).toBe("BASELINEREQ-1");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("returns empty arrays for empty state or id lists", async () => {
    const fetchFn = vi.fn();
    const client = createTestClient(fetchFn);

    await expect(client.fetchIssuesByStates([])).resolves.toEqual([]);
    await expect(client.fetchIssueStatesByIds([])).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refreshes issue states by numeric id", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json(
        {
          issues: [
            {
              id: "12345",
              key: "BASELINEREQ-99",
              fields: {
                status: { name: "开发中" },
              },
            },
          ],
        },
        { status: 200 },
      ),
    );
    const client = createTestClient(fetchFn);

    await expect(client.fetchIssueStatesByIds(["12345"])).resolves.toEqual([
      {
        id: "12345",
        identifier: "BASELINEREQ-99",
        state: "开发中",
      },
    ]);
  });
});
