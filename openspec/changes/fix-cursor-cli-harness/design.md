## Context

symphony-ts 通过 `CursorAgentHarness` 对接 Cursor Agent CLI，负责在 Linear issue workspace 中无人值守执行 agent turn。当前实现（`cursor-cli-session.ts`）使用 spike 时期的命令形态（`-p`、`--yolo`、`--trust`、错误的 `-force`），且 `stdio` 将 stdin 设为 `ignore`，无法与当前 CLI 的 `stream-json` 协议配合。

cc-connect 的 `agent/cursor/session.go` 已验证可行的 CLI 协议为：

```bash
agent --print --output-format stream-json --force [--resume <id>] [--model <id>] --workspace <dir> -- <prompt>
```

symphony-ts 与 cc-connect 是不同产品：前者是 issue 编排器，后者是消息桥接。本次**仅借鉴 CLI 调用与 stream-json 解析思路**，保留 symphony 的 `AgentHarness`、`HarnessRuntimeEvent`、Orchestrator、WORKFLOW.md 配置与 `.symphony/cursor-session.json` 会话存储。

### 实测证据（Windows，Cursor CLI login 态）

**hello 场景** — 验证基础协议：

```
system(init) → user → assistant → result(success)
session_id: UUID，result 含 usage.inputTokens/outputTokens
init.permissionMode 为 "default"，但 --force 仍可用
```

**dir 工具场景** — 验证 tool_call：

```
system → user → thinking(delta×N, completed) → assistant → tool_call(started) → tool_call(completed) → result
无 interaction_query（--force 下工具直接执行）
shellToolCall.args.command = "dir"，结构对齐 cc-connect extractToolInfo
```

`--resume` 跨 turn 恢复尚未实测，设计按 cc-connect 两参数形式实现，实现后补测。

## Goals / Non-Goals

**Goals:**

- Cursor harness 在 Windows 开发与 Linux 部署环境下能稳定调起 `agent` 并完成 turn
- WORKFLOW 配置采用方案 B：`mode: force` 唯一合法值；可选 `model`；废弃 `trust`/`yolo`
- 流式解析 `stream-json`，实时向 Orchestrator/Dashboard 推送 `last_message` 更新
- 首轮 `system.init` 即持久化 `session_id`；后续 turn 使用 `--resume <id>`
- `result` 事件映射 token usage 至 `HarnessUsage`
- dispatch 前校验 command 可执行性

**Non-Goals:**

- 不移植 cc-connect Engine、Platform、交互式权限 UI
- 不支持 `mode: plan|ask|default`（symphony 无人值守仅 force）
- 不读取 `~/.cursor/chats` 或实现 cc-connect 式会话列表
- 不新增 Provider/API key 配置层（继承 `process.env`）
- 不修改 Codex harness 或 `src/codex/`

## Decisions

### D1：CLI 参数形态对齐 cc-connect

**决定**：固定使用 `--print --output-format stream-json --force --workspace <cwd> -- <prompt>`；可选 `--model`、 `--resume <chatId>`。

**理由**：两次本地实测验证该形态可输出预期 JSON 行；旧 `-p` 形态无 `--print` 易进入交互模式导致子进程失败。

**替代方案**：保留 `-p` 仅加 `--print` — 拒绝，与 cc-connect 及实测不一致。

### D2：配置方案 B + force 硬约束

**决定**：

- 删除 `trust`、`yolo`、`output_format` 配置项
- `mode` 类型收窄为字面量 `"force"`；`validateDispatchConfig` 拒绝其它值及废弃字段
- 新增 `model: string | null`（可选）

**理由**：无人值守编排必须 force；减少无效 flag 导致秒退；与 cc-connect 语义对齐但配置入口仍为 WORKFLOW.md。

### D3：流式 runner + stdin 兜底

**决定**：`runCursorCli` 使用 `stdio: ['pipe','pipe','pipe']`，逐行读取 stdout；遇 `interaction_query` request 时经 stdin 写 approved 响应。

**理由**：dir 实测在 `--force` 下未出现 `interaction_query`，但 cc-connect 文档强调 stdin EOF 会导致权限自动拒绝；保留兜底防 CLI 版本差异。

**替代方案**：仅依赖 `--force` 不设 stdin — 风险较高，不采用。

### D4：stream-json → HarnessRuntimeEvent 映射

**决定**：不新增 event kind，复用现有类型：

| Cursor 事件 | HarnessRuntimeEvent | Dashboard message |
|-------------|---------------------|-------------------|
| `system` init | `notification` | `Cursor session init (<model>)` |
| `thinking` completed | `notification` | thinking 全文（delta 仅累积） |
| `assistant` | `other_message` | `content[].text` |
| `tool_call` started | `other_message` | `Tool <name>: <input>` |
| `tool_call` completed | `notification` | `Tool <name> completed` |
| `result` success | `turn_completed` | `result` + usage |
| `result` error / 非零退出 | `turn_failed` | stderr/result |

工具名解析借鉴 cc-connect `extractToolInfo`（`shellToolCall` → `Bash` 等）。

### D5：session_id 生命周期

**决定**：`system.init` 收到 `session_id` 后立即 `writeCursorSession`；删除 `--continue`；turn 2+ 使用 `--resume <id>` + 简短 continuation prompt（保持现有 `buildPromptForTurn` 逻辑）。

**理由**：实测首轮即有 UUID；cc-connect 不使用 `--continue`。

### D6：spawn 跨平台

**决定**：`shell: false`；实现 `resolveCursorCommand(command)` 在 dispatch 时预检（Windows `where.exe`，Unix `which` 或绝对路径 `access`）。

**理由**：消除 Windows `DEP0190`；长 prompt 走 `--` positional 避免 shell 引号问题；Linux systemd 环境需文档说明使用绝对路径。

### D7：thinking  Dashboard 节流

**决定**：`thinking.delta` 仅累积 buffer；在 `thinking.completed` 时发一条 `notification`。

**理由**：delta 行数可能很多，避免 SSE 刷屏。

### D8：sandbox 处理

**决定**：默认不传 `--sandbox`；若 WORKFLOW 显式配置 `sandbox`，记录 warn 并传入（标注 experimental）。

**理由**：cc-connect 未使用；未知 flag 可能导致秒退。

### D9：模块拆分

**决定**：

- `cursor-cli-args.ts` — `buildCursorCliArgs`
- `cursor-stream-parser.ts` — 行解析 + 事件映射 + tool 名提取
- `cursor-cli-session.ts` — spawn、readLoop、stdin 交互、超时
- `cursor-harness.ts` — 接线、实时 `emitHarnessEvent`、turn 日志

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| init 报 `permissionMode: default` 但 force 实际生效 | 不依赖该字段判断；始终传 `--force` + stdin 兜底 |
| 某 CLI 版本仍发 `interaction_query` | stdin 自动批准 |
| `model` 配置误用显示名 | 文档要求 `agent models` 的 id |
| Windows stdout GBK 乱码 | 复用 `decodeChildProcessOutput` |
| Linux 服务 PATH 无 `agent` | 预检失败 + 文档要求绝对路径 |
| `--resume` 行为未实测 | 实现后补测；parser 不依赖 resume 响应形态 |
| Breaking WORKFLOW 迁移成本 | `validateDispatchConfig` 明确报错废弃字段 |

## Migration Plan

1. 更新 `WORKFLOW.md`：

```yaml
# 旧（将报错）
cursor:
  mode: agent
  trust: true
  yolo: true
  output_format: text

# 新
cursor:
  command: agent   # 生产建议绝对路径
  mode: force
  model: null      # 或 composer-2.5-fast 等 CLI model id
```

2. 部署前在同一环境执行：

```bash
agent --print --output-format stream-json --force --workspace . -- "hello"
```

3. 回滚：恢复旧代码 + 旧 WORKFLOW 配置（旧实现仍无法可靠工作，仅作紧急回退）。

## Open Questions

- `--resume <uuid>` 跨 turn 实测（实现 Phase 1 末尾由开发者本地验证）
- Linux headless 下 `apiKeySource` 是否仍为 login 或需 `CURSOR_API_KEY`（运维文档，非本 change 代码范围）
