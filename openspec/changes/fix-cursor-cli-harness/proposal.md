## Why

symphony-ts 的 Cursor harness 基于早期 spike 实现，CLI 调用协议（`-p`、`--yolo`、错误的 `-force`、stdin ignore 等）与当前 Cursor Agent CLI 实际行为不对齐，导致无人值守编排时 `agent` 进程无法正常调起或秒退。cc-connect 已验证 `--print --output-format stream-json --force` 协议在 Windows/Linux 上可用；本次变更借鉴其 **CLI 层思路**，在保持 symphony-ts 自身 Harness/Orchestrator 架构的前提下，使 Cursor backend 可稳定执行 issue turn，并向 Dashboard 提供实时进度。

## What Changes

- **BREAKING**：删除 `harnesses.cursor.trust`、`harnesses.cursor.yolo`、`harnesses.cursor.output_format`；`mode` 仅允许 `force`；废弃 `mode: agent` 等无效值
- **BREAKING**：CLI 参数从 `-p` / `--continue` / `--resume=<id>` 改为 `--print --output-format stream-json --force [--model] [--resume <id>] --workspace <dir> -- <prompt>`
- 新增可选配置 `harnesses.cursor.model`，非空时传递 `--model`
- 重写 `runCursorCli` 为流式 runner：stdin pipe、`stream-json` 逐行解析、实时 `HarnessRuntimeEvent`
- 新增 `cursor-stream-parser`，将 Cursor 原生事件映射为 symphony `notification` / `other_message` / `turn_completed` 等
- `system.init` 时立即持久化 `session_id` 至 `.symphony/cursor-session.json`；`result` 事件填充 token usage
- dispatch 前增加 `agent` 命令可执行性预检（跨平台）
- 更新 `docs/agent-harness-cursor-spike.md`、`docs/WORKFLOW.template.md` 与相关测试

## Capabilities

### New Capabilities

- `cursor-cli-harness`：symphony-ts 通过 Cursor Agent CLI（`--print` + `stream-json`）执行无人值守 issue turn，含配置校验、流式事件、Dashboard 进度与会话恢复

### Modified Capabilities

（无。`openspec/specs/` 下尚无既有 capability spec。）

## Impact

- **配置**：`src/config/types.ts`、`defaults.ts`、`config-resolver.ts`；WORKFLOW.md 需迁移
- **运行时**：`src/agent/backends/cursor/*`（cli-session、harness、新增 stream-parser）
- **观测**：`cursor-event-adapter.ts`、`session-metrics` 间接受益（token / last_message）
- **测试**：`tests/agent/backends/cursor/*`、`tests/config/config-resolver.test.ts`
- **文档**：`docs/agent-harness-cursor-spike.md`、`docs/agent-harness.md`、`docs/WORKFLOW.template.md`
- **非目标**：不引入 cc-connect Engine/Platform；不实现交互式权限 UI；不读取 `~/.cursor/chats`
