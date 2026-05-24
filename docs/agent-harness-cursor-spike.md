# Cursor CLI Harness Spike

本文档记录 symphony-ts `CursorAgentHarness` 对接 [Cursor CLI](https://cursor.com/docs/cli/overview) 时的命令模板、会话策略与已知限制。

## 命令模板

默认命令：`agent`（可通过 `harnesses.cursor.command` 覆盖）。

| 场景 | 命令形态 |
|------|----------|
| 首次 turn | `agent [--trust] [--yolo] -p "<prompt>" [--mode <mode>] [--sandbox <sandbox>] [--output-format <format>]`（`trust` / `yolo` 默认 `true` 时含对应 flag） |
| 同 worker 后续 turn（无 chat id） | 在上述参数后追加 `--continue` |
| 跨 worker 恢复（有 chat id） | 在上述参数后追加 `--resume=<chatId>` |

`--trust`：Cursor CLI 信任/无人值守相关开关（与 **Symphony** 主进程的 `--acknowledge-high-trust-preview` 无关；后者只约束是否启动 Symphony）。可在 `WORKFLOW.md` 中设置 `harnesses.cursor.trust: false` 关闭。不支持该 flag 的旧版 CLI 会非 0 退出。

`--yolo`：Cursor CLI 的 YOLO 模式，工具调用自动批准，适合无人值守。可在 `WORKFLOW.md` 中设置 `harnesses.cursor.yolo: false` 关闭。若已安装的 `agent` 不支持该 flag，会出现非 0 退出（`cursor_exit_*`），请升级 CLI 或关闭 `yolo`。

工作目录：issue workspace 根目录（与 Codex harness 一致）。

## `--continue` vs `--resume` 默认策略

**默认策略（v0）**：

1. `reuse_policy: per_issue`（默认）时，将 chat id 写入 `<workspace>/.symphony/cursor-session.json`。
2. 同一 issue 的 **turn 1** 发送完整 `buildTurnPrompt` 产物。
3. **turn 2+** 且已有 chat id：使用 `--resume=<chatId>` + 简短 continuation 提示（非完整 workflow 模板）。
4. **turn 2+** 但尚无 chat id：使用 `--continue`。
5. `fresh_each_run` 时清空 session 文件，且不使用 resume/continue。

该策略对齐 OpenSymphony「per_issue 会话可跨 worker 复用」语义；continuation retry 仍由 `OrchestratorCore` 调度，harness 不重复实现。

## Chat ID 提取

MVP 从 stdout/stderr 合并输出中用正则提取，支持例如：

- `Chat ID: <id>`
- `chat_id: <id>`
- JSON 片段 `"chatId": "<id>"`

若 CLI 输出格式变更，可通过 Spike 结果扩展 `extractChatIdFromCliOutput`。

## 退出码（暂定）

| 退出码 | Harness 事件 | 说明 |
|--------|--------------|------|
| `0` | `turn_completed` | turn 成功结束 |
| 非 `0` | `turn_failed` | 子进程失败；`errorCode=cursor_exit_<code>` |
| 超时杀进程 | `runtime_error` | `errorCode=cursor_turn_timeout` |

## 每 Turn 日志与思考过程

symphony-ts 在 Cursor harness 中为每个 turn 写入可追踪日志（默认开启）：

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `turn_log_enabled` | `true` | 写入 `symphony.jsonl` 的 `cursor_turn_start` / `cursor_turn_finished` |
| `turn_log_max_bytes` | `32768` | 结构化日志中 stdout/stderr/thinking 单字段 UTF-8 字节上限 |
| `turn_log_include_prompt` | `false` | 为 `true` 时在日志中保留 `-p` 全文（敏感） |
| `turn_log_workspace_artifact` | `true` | 写入 `<workspace>/.symphony/cursor-turn-<N>.log`（UTF-8） |

### 结构化日志事件

- **`cursor_turn_start`**：`cli_command`、`cli_args`（默认脱敏 prompt）、`turn_number`、`chat_id`、`prompt_chars`
- **`cursor_turn_finished`**：`exit_code`、`duration_ms`、`stdout` / `stderr` / `thinking`（截断）、`artifact_path`

子进程输出在 Windows 上经 GBK 解码为 Unicode 后再写入 JSON/文件，避免中文乱码；`symphony.jsonl` 落盘使用 UTF-8。

### Workspace 工件

路径：`<workspace>/.symphony/cursor-turn-1.log`（按 turn 递增）。

- 开头：开始时间、CLI 调用行（脱敏）
- 运行中：增量追加 stdout/stderr 块（中间结果）
- 结尾：`exit_code`、`[thinking]`（若解析到）、若已流式输出则不再重复全文 stdout/stderr

### 思考块（Thinking）

symphony-ts 从 CLI 合并输出中启发式提取 thinking（`` ```thinking ``、`` ```reasoning ``、`Thinking:` 行、JSON `thinking` 字段等）。

**要在 CLI 输出中包含 thinking 块**，需在用户级配置中开启（symphony 无法通过 argv 等价开关）：

```json
{
  "display": {
    "showThinkingBlocks": true
  }
}
```

文件：`~/.cursor/cli-config.json`（修改后重启 CLI / 重新跑 turn）。

## stdout 样例（示意）

```
Chat ID: chat-abc123
Applied edits to src/example.ts
done
```

## Windows 子进程输出编码

Cursor harness 在 Windows 上通过 `shell: true` 调起 cmd，子进程 stderr/stdout 在中文系统上通常为 **GBK（CP936）**。

symphony-ts 在 [`src/process/decode-child-output.ts`](../src/process/decode-child-output.ts) 中统一解码：Windows 使用 `TextDecoder("gbk")`，其它平台使用 UTF-8。解码后的文本经 `summarizeCursorOutput` 写入 `turn_failed` 等结构化日志的 `message` 字段。

**说明**：workspace hooks（`sh -lc`）仍按 UTF-8 处理，与 Cursor cmd 路径分离，避免误解码。

### 常见可读错误（修复乱码后）

| 日志表现 | 含义 | 处理 |
|----------|------|------|
| `'agent' 不是内部或外部命令...` | Cursor CLI 未安装或不在 PATH | 安装 [Cursor CLI](https://cursor.com/docs/cli/overview)，或在 `WORKFLOW.md` 中设置 `harnesses.cursor.command` 为 `where agent` 得到的绝对路径 |
| `error_code=cursor_exit_1`，约数十毫秒内失败 | 多为上述「命令找不到」，而非 turn 超时 | 在同一 PowerShell 中执行 `where.exe agent` 验证 |
| `beforeRun` exit **128** | workspace 内非 Git 仓库或 clone 失败 | 删除对应 `<workspace.root>/<issue-id>` 目录后重跑，确保 `after_create` 的 `git clone` 成功 |

## 待验证（Open Questions）

- `--output-format json` 是否稳定输出可解析 chat id（若稳定可改为 JSON adapter）。
- 消除 Node `DEP0190`（`shell: true` + 分离参数列表）的安全启动方式。
- 与 `agent.stall_timeout_ms` 的关系：v0 仅使用 `harnesses.cursor.turn_timeout_ms`。
- 旧版 Cursor CLI 若不支持 `--yolo`，需在 WORKFLOW 中设置 `yolo: false` 或升级 CLI。
- 旧版 Cursor CLI 若不支持 `--trust`，需在 WORKFLOW 中设置 `trust: false` 或升级 CLI。
