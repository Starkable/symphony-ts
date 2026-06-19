import { CodexAgentHarness } from "../backends/codex/codex-harness.js";
import { CursorAgentHarness } from "../backends/cursor/cursor-harness.js";
import type {
  AgentHarness,
  AgentHarnessFactoryInput,
} from "./agent-harness.js";

export function createAgentHarness(
  input: AgentHarnessFactoryInput,
): AgentHarness {
  const harness = input.config.agent.harness;
  switch (harness) {
    case "cursor":
      return new CursorAgentHarness(input);
    case "codex":
    default:
      return new CodexAgentHarness(input);
  }
}
