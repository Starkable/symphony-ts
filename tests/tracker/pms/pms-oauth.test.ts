import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildOAuthAuthorizationHeader } from "../../../src/tracker/pms/pms-oauth.js";

describe("pms-oauth", () => {
  it("builds an OAuth RSA-SHA1 authorization header", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    const header = buildOAuthAuthorizationHeader(
      "GET",
      "http://pms.example.com/rest/api/2/myself",
      {
        consumerKey: "qa-monitor",
        accessToken: "access-token",
        accessTokenSecret: "access-secret",
        privateKeyPem: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
      },
    );

    expect(header.startsWith("OAuth ")).toBe(true);
    expect(header).toContain('oauth_consumer_key="qa-monitor"');
    expect(header).toContain('oauth_token="access-token"');
    expect(header).toContain('oauth_signature_method="RSA-SHA1"');
    expect(header).toContain('oauth_signature="');
  });

  it("includes query parameters in the signature base string", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const credentials = {
      consumerKey: "qa-monitor",
      accessToken: "access-token",
      accessTokenSecret: "access-secret",
      privateKeyPem: pem,
    };

    const withoutQuery = buildOAuthAuthorizationHeader(
      "GET",
      "http://pms.example.com/rest/api/2/myself",
      credentials,
    );
    const withQuery = buildOAuthAuthorizationHeader(
      "GET",
      "http://pms.example.com/rest/api/2/myself?expand=groups",
      credentials,
    );

    expect(withoutQuery).not.toEqual(withQuery);
  });
});
