const WINDOWS_CONSOLE_DECODER =
  process.platform === "win32" ? new TextDecoder("gbk") : null;

/**
 * Decode child process stdout/stderr.
 * Windows cmd uses GBK (CP936) on Chinese locales; other platforms use UTF-8.
 */
export function decodeChildProcessOutput(chunk: Buffer | string): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  if (WINDOWS_CONSOLE_DECODER !== null) {
    return WINDOWS_CONSOLE_DECODER.decode(chunk);
  }

  return chunk.toString("utf8");
}
