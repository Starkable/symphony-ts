## ADDED Requirements

### Requirement: Workflow 列表 API

Dashboard SHALL 提供 `GET /api/v1/workflows`，支持 query `status=active|archived|all`。响应 SHALL 返回工单摘要数组，每项至少包含：`issue_identifier`、`title`（若 tracker 可得）、`current_phase`、`phase_progress`（已完成阶段数/总业务阶段数）、`runtime.status`（running|archived|retry_queued）、`updated_at`、`artifact_count`。

#### Scenario: 活跃工单列表

- **WHEN** 客户端请求 `GET /api/v1/workflows?status=active`
- **THEN** 响应 SHALL 包含当前 running 与 store 中未归档工单，且 running 工单的 `runtime.status` SHALL 为 `running`

#### Scenario: 历史工单列表

- **WHEN** 客户端请求 `GET /api/v1/workflows?status=archived`
- **THEN** 响应 SHALL 仅包含 store 中已标记 `done` 或 tracker terminal 且 workspace 已 cleanup 的工单

### Requirement: Workflow 详情 API

Dashboard SHALL 提供 `GET /api/v1/workflows/:issue_identifier`，返回完整 `meta.json` 与 `manifest.json` 合并视图，含全部 `phases`、Gate 结果、artifacts 列表及 orchestrator runtime 字段（若仍在 running）。

#### Scenario: 详情含完整 Phase

- **WHEN** 客户端请求某 V1 工单的详情
- **THEN** 响应 `phases` SHALL 包含 `proposal_review` 阶段，且 SHALL NOT 将 plan 与 proposal_review 合并为单一阶段

#### Scenario: 未知工单

- **WHEN** store 与 runtime 均不存在该 `issue_identifier`
- **THEN** 系统 SHALL 返回 404 及 `issue_not_found` 错误码

### Requirement: 产物读取 API

Dashboard SHALL 提供 `GET /api/v1/workflows/:issue_identifier/artifacts/<relative_path>`，从 Artifact Store 读取文件并返回适当 `Content-Type`。Markdown SHALL 使用 `text/markdown`；日志 SHALL 使用 `text/plain`。

#### Scenario: 读取阶段 Markdown

- **WHEN** 请求 store 内存在的 `workflow/phases/verify/verification-report.md`
- **THEN** 系统 SHALL 返回 200 及文件正文

### Requirement: 总览页 UI

根路径 `/`（或 `/dashboard`）在 Workflow 功能启用时 SHALL 渲染总览页：保留 Running/Retry/Token/Runtime 四指标卡片；SHALL 展示 Active Workflows 卡片列表；每卡片 SHALL 含横向时间线（7 业务 Phase 节点）、当前 Phase 高亮（blue-600 pulse）、已完成节点（green check）、产物数量提示；SHALL 含 Rate limits 侧栏与 Recent History 入口。视觉样式 SHALL 参考 symphony-obs 原型（Inter 字体、白卡片、rounded-xl、gray-50 背景），主 accent 色 SHALL 为 blue-600。

#### Scenario: 点击工单进入详情

- **WHEN** 用户点击 Active Workflow 卡片标题链接
- **THEN** 浏览器 SHALL 导航至 `/issues/:issue_identifier` 详情页

### Requirement: 详情页 UI

系统 SHALL 提供 `/issues/:issue_identifier` 页面：顶部工单 meta（identifier、title、priority、当前 phase、总进度条）；纵向时间线 SHALL 每 Phase 一卡片，展示状态 badge（已完成/进行中/待处理/失败）、Gate 信息、阶段产物列表；SHALL 提供 Preview Modal 展示 MD/LOG 内容摘要与 Download。V1 SHALL NOT 展示「Action Required」「Take Task」类人机按钮。

#### Scenario: 进行中阶段 Live 提示

- **WHEN** 某 Phase 状态为 `in_progress` 且存在最新 turn log
- **THEN** 详情页 SHALL 展示 `last_message` 或 log 摘要，并 MAY 通过 SSE 增量更新（若已实现 live 端点）

### Requirement: 历史页 UI

系统 SHALL 提供 `/history` 页面：搜索框（identifier/title）、优先级筛选、阶段完成度筛选、归档列表卡片（含阶段进度点、duration、文件数）。数据 SHALL 来自 Workflow 列表 API `status=archived`。

#### Scenario: 从总览进入历史

- **WHEN** 用户点击 Recent History 的 View All
- **THEN** 浏览器 SHALL 导航至 `/history`

### Requirement: 与现有 Observability 兼容

Workflow UI 启用时 SHALL 保留 `GET /api/v1/state`、`GET /api/v1/events` SSE 快照推送及 `POST /api/v1/refresh`。现有 JSON issue 详情路径 MAY 重定向或并存，但 SHALL NOT 破坏现有测试契约 without 版本说明。

#### Scenario: SSE 仍更新指标

- **WHEN** 客户端连接 `/api/v1/events`
- **THEN** 推送的 snapshot SHALL 仍包含 `counts.running` 与 `codex_totals`，且 MAY 扩展 workflow 摘要字段
