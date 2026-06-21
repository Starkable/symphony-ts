## ADDED Requirements

### Requirement: 可导出内容判定

系统 SHALL 提供 `hasExportableContent(workspacePath)`（或等价实现），用于判断 workspace 是否含有 Symphony 执行证据。当且仅当满足以下**任一**条件时 SHALL 返回 true：

- `openspec/changes/<change_ref>/` 下存在至少一个 V1.2 阶段产物文件（与 `openspec-scan` 扫描规则一致）
- `.symphony/` 下存在至少一个 turn log 文件（与 `scanSymphonyLogs` 规则一致）
- `.symphony/workpad.md` 存在且去除空白后非空

仅含 `after_create` 克隆代码、无上述产物时 SHALL 返回 false。

#### Scenario: 空 workspace 仅 clone

- **WHEN** workspace 目录存在但无 openspec 阶段文件、无 turn log、workpad 为空或不存在
- **THEN** `hasExportableContent` SHALL 返回 false

#### Scenario: 有 OpenSpec 阶段文件

- **WHEN** workspace 内 `openspec/changes/<change_ref>/proposal.md` 存在
- **THEN** `hasExportableContent` SHALL 返回 true

#### Scenario: 仅有 turn log

- **WHEN** workspace 内 `.symphony/cursor-turn-1.log` 存在且无 openspec 文件
- **THEN** `hasExportableContent` SHALL 返回 true

### Requirement: Terminal cleanup export 门槛

当 orchestrator 因 **startup terminal cleanup** 或 **worker 终态退出**（`cleanupWorkspace === true`）即将 export 并 `removeForIssue` 时，系统 SHALL 在 export 前检查：

1. 对应 `workspacePath` 目录存在
2. `hasExportableContent(workspacePath)` 为 true

若任一不满足，系统 SHALL NOT 创建或更新 Artifact Store 条目（无 meta/manifest 写入）。

无论是否 export，startup cleanup SHALL 仍可对命中 issue 调用 `removeForIssue`（与 upstream §8.6 一致）。

#### Scenario: 终态工单无本地 workspace

- **WHEN** startup cleanup 从 PMS 取得终态 issue，且本地 workspace 目录不存在
- **THEN** 系统 SHALL NOT 写入 Artifact Store，且 SHALL 调用 `removeForIssue`（no-op 安全）

#### Scenario: 终态工单 workspace 无产物

- **WHEN** startup cleanup 取得终态 issue，workspace 存在但 `hasExportableContent` 为 false
- **THEN** 系统 SHALL NOT 写入 Artifact Store，且 SHALL 删除 workspace

#### Scenario: 终态工单 workspace 有产物

- **WHEN** startup cleanup 取得终态 issue，workspace 存在且 `hasExportableContent` 为 true
- **THEN** 系统 SHALL 在 `removeForIssue` 前完成全量 export 至 Artifact Store

### Requirement: archived_reason 元数据

`meta.json` SHALL 支持可选字段 `archived_reason: string | null`。当因 PMS 终态触发 startup cleanup export 或 worker 终态 cleanup export 成功写入 store 时，系统 SHALL 将 `archived_reason` 设为 `"pms_terminal_cleanup"`。

OpenSpec 自然终态（`terminal_phase` 为 `done` 或 `failed`）时，系统 MAY 不设置 `archived_reason`。

#### Scenario: Startup cleanup 归档

- **WHEN** startup cleanup 对含产物的终态 issue 完成 export
- **THEN** 写入的 `meta.json` SHALL 包含 `archived_reason: "pms_terminal_cleanup"`

#### Scenario: Worker 终态 cleanup 归档

- **WHEN** reconcile 检测到 running issue 变为 terminal 并执行 export + workspace cleanup
- **THEN** 写入的 `meta.json` SHALL 包含 `archived_reason: "pms_terminal_cleanup"`

### Requirement: 跳过 export 的结构化日志

当 startup cleanup 因门槛跳过 export 时，orchestrator SHALL 记录 `startup_terminal_skip_export` 日志，且 SHALL 包含 `issue_id`、`issue_identifier` 及 `reason`（值为 `no_workspace` 或 `empty_workspace`）。

#### Scenario: 无 workspace 跳过

- **WHEN** 终态 issue 无本地 workspace
- **THEN** 系统 SHALL 记录 `startup_terminal_skip_export` 且 `reason` 为 `no_workspace`

#### Scenario: 空 workspace 跳过

- **WHEN** 终态 issue 有 workspace 但无产物
- **THEN** 系统 SHALL 记录 `startup_terminal_skip_export` 且 `reason` 为 `empty_workspace`

### Requirement: Turn 增量 export 不受门槛限制

当 worker 处于 running 状态且 turn 正常或异常结束时，exporter 的增量 sync SHALL NOT 受 `hasExportableContent` 门槛约束（与现有 turn 结束 export 行为一致）。

#### Scenario: 首次 turn 后建立 store

- **WHEN** running worker 完成首次 turn 且 exporter 执行增量 sync
- **THEN** 系统 MAY 创建 Artifact Store 目录并更新 manifest，无需预先满足 terminal cleanup 门槛
