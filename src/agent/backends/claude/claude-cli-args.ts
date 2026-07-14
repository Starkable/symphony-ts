export type ClaudePermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk";

/**
 * Builds Claude Code CLI args for headless stream-json turns.
 * Docs: `claude -p … --output-format stream-json --verbose`
 * Workspace is the process cwd (set by spawn), not a separate flag.
 */
export function buildClaudeCliArgs(input: {
  prompt: string;
  sessionId: string | null;
  model: string | null;
  permissionMode: ClaudePermissionMode;
  allowedTools: readonly string[] | null;
}): string[] {
  const args = [
    "-p",
    input.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    input.permissionMode,
  ];

  if (input.sessionId !== null && input.sessionId.trim() !== "") {
    args.push("--resume", input.sessionId.trim());
  }

  const model = input.model?.trim();
  if (model !== undefined && model !== "") {
    args.push("--model", model);
  }

  if (input.allowedTools !== null) {
    for (const tool of input.allowedTools) {
      const trimmed = tool.trim();
      if (trimmed.length > 0) {
        args.push("--allowedTools", trimmed);
      }
    }
  }

  return args;
}
