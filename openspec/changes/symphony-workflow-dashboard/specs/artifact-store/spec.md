## ADDED Requirements

### Requirement: Artifact Store 根路径配置

系统 SHALL 支持通过 workflow 配置项 `artifact_store.root` 指定持久化档案根目录；SHALL 支持 `artifact_store.enabled` 开关。当 `enabled` 为 false 或未配置 `root` 时，Workflow Dashboard 扩展功能 SHALL NOT 激活，现有 Runtime Dashboard SHALL 保持可用。

#### Scenario: 启用 Artifact Store

- **WHEN** 配置 `artifact_store.enabled: true` 且 `artifact_store.root` 解析为有效绝对路径
- **THEN** orchestrator SHALL 在该根目录下按 `issue_identifier` 创建子目录并写入档案

#### Scenario: 未配置 Store

- **WHEN** `artifact_store.root` 未设置或 `enabled` 为 false
- **THEN** GET `/api/v1/workflows` SHALL 返回 503 或空列表并附带明确错误码，且 SHALL NOT 影响 `/api/v1/state`

### Requirement: 按工单标识符目录布局

每个工单的档案 SHALL 存放在 `<artifact_store.root>/<issue_identifier>/` 下。目录 SHALL 包含 `meta.json`、`manifest.json`，并 MAY 包含 `workflow/phases/`、`openspec/changes/<change_ref>/`、`logs/` 子路径。

#### Scenario: 新建工单档案

- **WHEN** 某 `issue_identifier` 首次发生 export
- **THEN** 系统 SHALL 创建 `<issue_identifier>/meta.json` 且 `change_ref` SHALL 等于 `kebab-case(issue_identifier)`

### Requirement: manifest 索引结构

`manifest.json` SHALL 描述：`issue_identifier`、`change_ref`、`current_phase`、`mode`（默认 `v1-openspec`）、`updated_at`、`phases[]`（含 `id`、`status`、`gate`、`artifacts[]`）、`runtime` 摘要（`turn_count`、`last_message` 等）。`phases[].id` SHALL 使用 V1 Policy 定义的 phase 枚举。

#### Scenario: Phase 列表完整

- **WHEN** manifest 为 V1 工单生成
- **THEN** `phases` SHALL 包含 `clarify`、`plan`、`proposal_review`、`execute`、`verify`、`archive` 共六个业务阶段条目，且 MAY 在 `meta` 或顶层标记 `done`/`failed` 终态

### Requirement: Workspace 到 Store 导出

系统 SHALL 在 worker turn 结束、`before_remove` 钩子执行前、以及检测到 workpad Phase 或 Gate Log 变化时，将 workspace 内 `.symphony/workpad.md`、`.symphony/cursor-turn-*.log`、`openspec/changes/<change_ref>/` 及阶段证明 markdown 同步至对应 Artifact Store 目录，并更新 `manifest.json`。

#### Scenario: Turn 结束增量同步

- **WHEN** worker 一次 turn 正常或异常结束
- **THEN** exporter SHALL 更新 manifest 的 runtime 字段并 SHALL 复制最新 turn log 至 store `logs/`

#### Scenario: Terminal cleanup 前全量导出

- **WHEN** orchestrator 因 terminal state 即将 `removeForIssue`
- **THEN** exporter SHALL 在 workspace 删除前完成全量 sync，且 store 内 manifest SHALL 可独立供 Dashboard 读取

### Requirement: 路径安全

Exporter 与 Dashboard 读文件 SHALL 仅允许访问 `artifact_store.root` 下经 sanitize 的 `<issue_identifier>` 子树；SHALL NOT 跟随 symlink 逃出 root；SHALL NOT 接受含 `..` 的 artifact 路径。

#### Scenario: 非法路径拒绝

- **WHEN** 请求 `/api/v1/workflows/BCS-423/artifacts/../../etc/passwd`
- **THEN** 系统 SHALL 返回 400 或 404，且 SHALL NOT 读取 store 外文件

### Requirement: 可选 Hydrate

当配置启用 hydrate 且 store 中已有该 `issue_identifier` 档案、workspace 为新创建时，系统 MAY 在 `after_create` 之后将 store 内 workpad、openspec change 副本复制回 workspace，以支持续跑。

#### Scenario: 重建 workspace 后续跑

- **WHEN** workspace 被删除后同一 issue 再次 dispatch 且 store 存在该工单 manifest
- **THEN** hydrate SHALL 恢复 `.symphony/workpad.md` 与 `openspec/changes/<change_ref>/` 至 workspace
