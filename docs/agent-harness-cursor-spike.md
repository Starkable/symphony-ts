# Cursor CLI Harness

symphony-ts `CursorAgentHarness` 通过 Cursor Agent CLI 在 issue workspace 中无人值守执行 turn。实现借鉴 [cc-connect](https://github.com/chenhg5/cc-connect) 的 **CLI 调用协议**（`--print` + `stream-json`），但保留 Symphony 自身的 Harness / Orchestrator / WORKFLOW 配置模型。

## 命令模板

默认命令：`agent`（可通过 `harnesses.cursor.command` 覆盖；生产环境建议使用绝对路径）。

| 场景 | 命令形态 |
|------|----------|
| 首次 turn | `agent --print --output-format stream-json --force [--model <id>] --workspace <dir> -- <prompt>` |
| 后续 turn（有 session id） | 在上述参数中插入 `--resume <chatId>` |

工作目录与子进程 `cwd` 均为 issue workspace 根目录。

## 配置（Breaking）

```yaml
harnesses:
  cursor:
    command: agent
    mode: force          # 唯一合法值
    model: null          # 可选，如 composer-2.5-fast（用 agent models 查 id）
    reuse_policy: per_issue
    turn_timeout_ms: 3600000
```

已移除：`trust`、`yolo`、`output_format`、`mode: agent`。

### 迁移示例

```yaml
# 旧（将失败）
cursor:
  mode: agent
  trust: true
  yolo: true
  output_format: text

# 新
cursor:
  mode: force
  model: composer-2.5-fast   # 可选
```

## 会话策略

1. `reuse_policy: per_issue`（默认）时，将 `session_id` 写入 `<workspace>/.symphony/cursor-session.json`。
2. **turn 1** 发送完整 `buildTurnPrompt` 产物。
3. **turn 2+** 且已有 chat id：`--resume <chatId>` + 简短 continuation 提示。
4. `fresh_each_run` 时清空 session 文件。

`session_id` 在 CLI 输出第一行 `system.init` 时即持久化（不等 turn 结束）。

## stream-json 与 Dashboard

Harness 逐行解析 stdout，将事件映射为 `HarnessRuntimeEvent` 并实时推送到 Orchestrator / Dashboard：

| Cursor 事件 | Harness 事件 | Dashboard `last_message` |
|-------------|--------------|-------------------------|
| `system` init | `notification` | 会话初始化 |
| `thinking` completed | `notification` | thinking 文本 |
| `assistant` | `other_message` | 助手回复 |
| `tool_call` started | `other_message` | `Tool Bash: ...` |
| `result` success | `turn_completed` | 最终结果 + token usage |

stdin 保持 pipe；若 CLI 发出 `interaction_query`，harness 自动批准（无人值守兜底）。

## 退出码

| 场景 | Harness 事件 | 说明 |
|------|--------------|------|
| `result` 且 `is_error: false` | `turn_completed` | turn 成功 |
| 非 0 退出 / `is_error: true` | `turn_failed` | `errorCode=cursor_exit_<code>` |
| 超时 | `runtime_error` | `errorCode=cursor_turn_timeout` |

## 实测附录（Windows，login 态）

```bash
agent --print --output-format stream-json --force --workspace . -- "hello"
```

输出序列：`system(init)` → `user` → `assistant` → `result(success)`，含 `session_id` UUID 与 `usage.inputTokens/outputTokens`。

工具调用场景（`dir`）：额外出现 `thinking` delta/completed、`tool_call` started/completed；`--force` 下未出现 `interaction_query`。

## 预检与运维

- dispatch 前校验 `harnesses.cursor.command` 可执行；失败时提示安装 CLI 或配置绝对路径。
- **Windows**：可配置 `command: agent`（无需绝对路径）。Symphony 会通过 `where.exe` 解析到 `agent.cmd`，再用 `cmd.exe /d /s /c` 包装启动（与在终端直接运行 `agent` 行为一致）；`shell` 仍为 `false`，长 prompt 走 `--` positional。
- Linux systemd 等服务环境请显式配置 `command` 绝对路径，勿依赖服务 PATH。
- Cursor CLI `stream-json` 管道输出在全部平台（含 Windows）按 **UTF-8** 解码；其它 Windows 子进程默认仍可用 GBK（见 `src/process/decode-child-output.ts`）。

## 待验证

- `--resume <uuid>` 跨 turn 恢复（本地补测）。
- `sandbox` 是否为当前 CLI 稳定支持的 flag（默认不传）。

## 参考

- Cursor CLI 文档：https://cursor.com/docs/cli/overview
- cc-connect 实现：`agent/cursor/session.go`（仅 CLI 层参考）
