import { describe, expect, it } from "vitest";

import { decodeChildProcessOutput } from "../../src/process/decode-child-output.js";

describe("decodeChildProcessOutput", () => {
  it("decodes utf8 buffers when platform is not win32", () => {
    if (process.platform === "win32") {
      return;
    }

    const text = decodeChildProcessOutput(Buffer.from("中文输出", "utf8"));
    expect(text).toBe("中文输出");
  });

  it("decodes gbk buffers on win32", () => {
    if (process.platform !== "win32") {
      return;
    }

    const text = decodeChildProcessOutput(
      Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xca, 0xe4, 0xb3, 0xf6]),
    );
    expect(text).toBe("中文输出");
  });

  it("decodes utf8 buffers on win32 when encoding is utf8", () => {
    if (process.platform !== "win32") {
      return;
    }

    const text = decodeChildProcessOutput(
      Buffer.from("中文输出", "utf8"),
      "utf8",
    );
    expect(text).toBe("中文输出");
  });
});
