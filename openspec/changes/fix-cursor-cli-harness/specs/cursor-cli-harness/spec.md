## ADDED Requirements

### Requirement: Cursor CLI 非交互调用协议

当 `agent.harness` 为 `cursor` 时，系统 MUST 通过子进程调用 Cursor Agent CLI，使用 `--print`、`--output-format stream-json`、`--force`、`--workspace <issue-workspace>`，并将 turn prompt 作为 `--` 之后的 positional 参数传递。系统 MUST NOT 使用 `-p`、`--yolo`、`--trust`、`-force`（单横杠）或 `--continue`。

#### Scenario: 首次 turn 启动 CLI

- **WHEN** Cursor harness 对某 issue 执行 turn 1 且 workspace 已创建
- **THEN** 子进程命令行包含 `--print`、`--output-format stream-json`、`--force`、`--workspace` 及 `-- <prompt>`
- **THEN** 子进程工作目录为 issue workspace 根目录

#### Scenario: 后续 turn 恢复会话

- **WHEN** turn 编号大于 1 且 `.symphony/cursor-session.json` 中存在非空 `chatId`
- **THEN** 子进程命令行包含 `--resume <chatId>`（两参数形式，非 `--resume=<id>`）
- **THEN** 系统 MUST NOT 传递 `--continue`

### Requirement: 无人值守 force 模式配置

`harnesses.cursor.mode` MUST 为 `force`。配置解析与 dispatch 校验 MUST 拒绝 `trust`、`yolo`、`output_format` 字段及 `mode` 的其它取值（含 `agent`、`default`、`plan`、`ask`）。

#### Scenario: 合法 cursor 配置通过校验

- **WHEN** WORKFLOW 中 `harnesses.cursor.mode` 为 `force` 且 `command` 非空可执行
- **THEN** `validateDispatchConfig` 返回成功

#### Scenario: 废弃字段被拒绝

- **WHEN** WORKFLOW 中包含 `harnesses.cursor.trust` 或 `yolo` 或 `output_format`
- **THEN** 配置解析或 dispatch 校验 MUST 失败并给出明确错误信息

### Requirement: 可选模型配置

系统 SHALL 支持 `harnesses.cursor.model` 可选字符串。当非空时，CLI 调用 MUST 包含 `--model <value>`；当为空或省略时，MUST NOT 传递 `--model`。

#### Scenario: 配置 model 时传递 flag

- **WHEN** `harnesses.cursor.model` 设为有效 model id
- **THEN** 子进程命令行包含 `--model` 及该 id

### Requirement: stream-json 流式解析与 Dashboard 进度

系统 MUST 以逐行方式读取 CLI stdout，解析 JSON 事件，并在 turn 进行中将映射后的 `HarnessRuntimeEvent` 实时发送至 Orchestrator（经 `onEvent` → `onHarnessRuntimeEvent`），使 Dashboard `last_message` / `last_event` 随 assistant、thinking、tool_call 更新。

#### Scenario: assistant 文本更新 Dashboard

- **WHEN** CLI 输出 `type: assistant` 且含文本 content
- **THEN** harness 发出 `other_message` 事件且 message 含该文本
- **THEN** 运行中 issue 的 snapshot `last_message` 反映最新 assistant 内容

#### Scenario: tool_call 进度更新 Dashboard

- **WHEN** CLI 输出 `type: tool_call`、`subtype: started`
- **THEN** harness 发出 `other_message` 且 message 标识工具名与输入（如 `Tool Bash: dir`）

#### Scenario: thinking 完成时通知

- **WHEN** CLI 输出 `type: thinking`、`subtype: completed`
- **THEN** harness 发出 `notification` 且 message 含累积的 thinking 文本
- **THEN** `thinking.delta` 期间 MUST NOT 对每条 delta 都触发 Dashboard 更新（允许仅累积）

### Requirement: 会话 ID 持久化与 token 统计

系统 MUST 在收到 `system` 事件且含 `session_id` 时立即写入 `<workspace>/.symphony/cursor-session.json`。系统 MUST 在 `result` 成功事件中将 `usage.inputTokens` 与 `usage.outputTokens` 映射至 `HarnessUsage` 并附于 `turn_completed`。

#### Scenario: 首轮持久化 session_id

- **WHEN** CLI 输出 `system.init` 且 `session_id` 为 UUID
- **THEN** `cursor-session.json` 的 `chatId` 在该 turn 完成前即被更新

#### Scenario: result 填充 usage

- **WHEN** CLI 输出 `result` 且 `usage` 含 inputTokens/outputTokens
- **THEN** `turn_completed` 事件的 usage 字段反映上述 token 数

### Requirement: stdin 与 interaction_query 兜底

子进程 stdin MUST 保持 pipe 连通。当 CLI 输出 `interaction_query` 且 `subtype: request` 时，系统 MUST 经 stdin 写入 approved 响应，以免无人值守场景下权限等待导致挂起或失败。

#### Scenario: interaction_query 自动批准

- **WHEN** 在 force 模式下仍收到 `interaction_query` request
- **THEN** harness 向 stdin 写入 approved 响应 JSON 行
- **THEN** turn 可继续直至 `result` 或进程退出

### Requirement: CLI 命令可执行性预检

当 `agent.harness` 为 `cursor` 时，`validateDispatchConfig` MUST 验证 `harnesses.cursor.command` 在运行环境中可执行（PATH 解析或绝对路径存在），否则 MUST 失败并提示安装或配置绝对路径。

#### Scenario: command 不在 PATH

- **WHEN** `command` 为 `agent` 且运行环境 PATH 中不存在该可执行文件
- **THEN** dispatch 校验失败且错误信息说明如何安装或设置绝对路径

### Requirement: turn 完成与失败判定

系统 MUST 在 CLI 输出 `result` 且 `is_error` 为 false 时发出 `turn_completed`；在进程非零退出、`result.is_error` 为 true 或 turn 超时时发出 `turn_failed` 或 `runtime_error`（超时）。

#### Scenario: 成功 result

- **WHEN** CLI 输出 `result`、`subtype: success`、`is_error: false`
- **THEN** harness 发出 `turn_completed` 且 exitCode 为 0

#### Scenario: turn 超时

- **WHEN** 单次 turn 持续时间超过 `harnesses.cursor.turn_timeout_ms`
- **THEN** 子进程被终止且 harness 发出含 `cursor_turn_timeout` 的 `runtime_error`
