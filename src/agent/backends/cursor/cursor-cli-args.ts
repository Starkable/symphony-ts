export function buildCursorCliArgs(input: {
  workspace: string;
  prompt: string;
  chatId: string | null;
  model: string | null;
  sandbox?: unknown;
}): string[] {
  const args = ["--print", "--output-format", "stream-json", "--force"];

  if (input.chatId !== null && input.chatId.trim() !== "") {
    args.push("--resume", input.chatId.trim());
  }

  const model = input.model?.trim();
  if (model !== undefined && model !== "") {
    args.push("--model", model);
  }

  if (input.sandbox !== undefined && input.sandbox !== null) {
    args.push("--sandbox", String(input.sandbox));
  }

  args.push("--workspace", input.workspace, "--", input.prompt);
  return args;
}
