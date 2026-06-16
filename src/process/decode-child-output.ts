const WINDOWS_CONSOLE_DECODER =
  process.platform === "win32" ? new TextDecoder("gbk") : null;

export type ChildProcessOutputEncoding = "utf8" | "platform";

/**
 * Decode child process stdout/stderr.
 * `platform` (default): GBK on Windows for legacy console tools, UTF-8 elsewhere.
 * `utf8`: always UTF-8 (Cursor CLI stream-json and other UTF-8 pipes).
 */
export function decodeChildProcessOutput(
  chunk: Buffer | string,
  encoding: ChildProcessOutputEncoding = "platform",
): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  if (encoding === "utf8") {
    return chunk.toString("utf8");
  }

  if (WINDOWS_CONSOLE_DECODER !== null) {
    return WINDOWS_CONSOLE_DECODER.decode(chunk);
  }

  return chunk.toString("utf8");
}
