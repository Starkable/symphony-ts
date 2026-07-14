# Agent Harness 架构

symphony-ts 通过 **Agent Harness** 将编排器与具体 agent 运行时解耦。编排层只消费中性的 `HarnessRuntimeEvent`，Codex / Cursor / Claude 细节隔离在各自 backend 中。

## 组件关系

```
OrchestratorRuntimeHost
  └─ createAgentHarness()
       ├─ CodexAgentHarness → AgentRunner（冻结，不修改 src/codex/）
       ├─ CursorAgentHarness → Cursor CLI 子进程（每 turn 一次）
       └─ ClaudeAgentHarness → Claude Code CLI 子进程（每 turn 一次）
            └─ HarnessRuntimeEvent → OrchestratorCore.onHarnessRuntimeEvent()
```

## 配置

```yaml
agent:
  harness: codex   # 默认；可选 cursor | claude

harnesses:
  codex:
    command: codex app-server
    # ...
  cursor:
    command: agent
    mode: force
    model: null
    sandbox: null
    reuse_policy: per_issue   # 或 fresh_each_run
    turn_timeout_ms: 3600000
  claude:
    command: claude
    model: null
    permission_mode: acceptEdits
    allowed_tools: null
    reuse_policy: per_issue
    turn_timeout_ms: 3600000
```

旧版顶层 `codex:` 块会自动映射到 `harnesses.codex`。

## Codex + V1.2 Policy

Skill 正文由编排内联（`.agents/skills`），与 Codex 原生 `$skill` 无关。样例：`examples/workflow-codex-policy/WORKFLOW.md`。手工清单：`docs/codex-policy-smoke.md`。联调依赖 bundle 安装到 `.agents/skills`（`bundle-agents-skills-install`）。

## 扩展新 backend

1. 在 `src/agent/backends/<name>/` 实现 `AgentHarness`。
2. 提供 `*-event-adapter.ts` 将原生事件映射为 `HarnessRuntimeEvent`。
3. 在 `harness-factory.ts` 注册 `agent.harness` 分支。
4. 在 `config/types.ts` 与 `config-resolver.ts` 增加 `harnesses.<name>` 解析与 `validateDispatchConfig` 分支。

## 参考

- OpenSymphony：`WorkerBackend` / `WorkerUpdate::RuntimeEvent`
- Cursor Spike：`docs/agent-harness-cursor-spike.md`
- Claude Code headless：https://code.claude.com/docs/en/headless
