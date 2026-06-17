import { createSign, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { ERROR_CODES } from "../../errors/codes.js";
import { TrackerError } from "../errors.js";

export interface PmsOAuthCredentials {
  consumerKey: string;
  accessToken: string;
  accessTokenSecret: string;
  privateKeyPem: string;
}

export function loadRsaPrivateKeyPem(keyPath: string): string {
  try {
    const pem = readFileSync(keyPath, "utf8").trim();
    if (pem.length === 0) {
      throw new TrackerError(
        ERROR_CODES.trackerCredentialsMissing,
        "PMS RSA private key file is empty.",
        { details: { keyPath } },
      );
    }
    return pem;
  } catch (error) {
    if (error instanceof TrackerError) {
      throw error;
    }
    throw new TrackerError(
      ERROR_CODES.trackerCredentialsMissing,
      `Failed to read PMS RSA private key from '${keyPath}'.`,
      { cause: error, details: { keyPath } },
    );
  }
}

export function buildOAuthAuthorizationHeader(
  method: string,
  requestUrl: string,
  credentials: PmsOAuthCredentials,
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_token: credentials.accessToken,
    oauth_signature_method: "RSA-SHA1",
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_version: "1.0",
  };

  const url = new URL(requestUrl);
  const baseUrl = `${url.origin}${url.pathname}`;
  const signatureParams: Record<string, string> = { ...oauthParams };
  for (const [key, value] of url.searchParams.entries()) {
    signatureParams[key] = value;
  }

  const paramString = Object.keys(signatureParams)
    .sort()
    .map(
      (key) =>
        `${oauthPercentEncode(key)}=${oauthPercentEncode(signatureParams[key] ?? "")}`,
    )
    .join("&");

  const signatureBaseString = [
    method.toUpperCase(),
    oauthPercentEncode(baseUrl),
    oauthPercentEncode(paramString),
  ].join("&");

  let signature: string;
  try {
    const signer = createSign("RSA-SHA1");
    signer.update(signatureBaseString);
    signer.end();
    signature = signer.sign(credentials.privateKeyPem, "base64");
  } catch (error) {
    throw new TrackerError(
      ERROR_CODES.trackerCredentialsMissing,
      "Failed to sign PMS OAuth request with RSA private key.",
      { cause: error },
    );
  }

  oauthParams.oauth_signature = signature;

  const headerValue = Object.keys(oauthParams)
    .sort()
    .map(
      (key) =>
        `${oauthPercentEncode(key)}="${oauthPercentEncode(oauthParams[key] ?? "")}"`,
    )
    .join(", ");

  return `OAuth ${headerValue}`;
}

function oauthPercentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}
