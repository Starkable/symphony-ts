## ADDED Requirements

### Requirement: V1.1 时间线 UI

Workflow Dashboard SHALL 使用 V1.1 Phase 顺序渲染总览 Active 卡片与详情页纵向时间线。

#### Scenario: 详情页阶段顺序

- **WHEN** 用户访问 `/issues/:issue_identifier`
- **THEN** 阶段顺序 SHALL 为：需求澄清 → 提案评审 → 方案规划 → 执行实现 → 验证 → 归档

### Requirement: 列表开始时间

Workflow 列表与 Active 卡片 SHALL 优先展示工单 **开始时间**（`started_at` 或 `created_at`），SHALL NOT 将 `updated_at` 作为主时间标签。

#### Scenario: Running 工单时间

- **WHEN** 工单在 running 内存态且无 store manifest
- **THEN** 展示时间 SHALL 来自 orchestrator `startedAt`
- **AND** SHALL NOT 每次请求刷新为当前时刻

#### Scenario: 归档工单时间

- **WHEN** 工单仅存在于 artifact store
- **THEN** 展示时间 SHALL 优先使用 `meta.created_at`

### Requirement: SSE 局部刷新

启用 live updates 时，Workflow 总览页 SHALL NOT 在每次 SSE snapshot 事件触发 `location.reload()`；SHALL 通过 fetch API 局部更新指标与列表。

#### Scenario: SSE snapshot 到达

- **WHEN** 浏览器收到 `/api/v1/events` 的 snapshot 事件
- **THEN** 页面 SHALL 更新 Running/Retry 等指标与 workflow 列表
- **AND** SHALL NOT 整页白屏重载

### Requirement: Markdown Preview

产物 Preview 对 `.md` 扩展名 SHALL 渲染为 HTML（标题、列表、代码块）；`.log` SHALL 保持等宽 pre 展示。

#### Scenario: Preview proposal

- **WHEN** 用户点击 proposal.md 的 Preview
- **THEN** Modal SHALL 展示渲染后的 Markdown 而非纯文本 pre

### Requirement: Dashboard 中文 UI

Workflow 三页 SHALL 使用简体中文作为主要界面文案（指标、按钮、状态 badge、空状态提示）。

#### Scenario: 按钮文案

- **WHEN** 用户查看产物行
- **THEN** 操作按钮 SHALL 显示「预览」「下载」而非 Preview/Download

#### Scenario: 指标卡片

- **WHEN** 用户打开 Workflow 总览
- **THEN** Running/Retry 等指标 SHALL 使用中文标签（如「运行中」「等待重试」）

### Requirement: execute 阶段 UI

详情页 execute 阶段 SHALL NOT 列出 tasks.md 或 cursor-turn log 文件；MAY 显示一行 runtime 摘要（状态、turn 数、最后事件）。

#### Scenario: execute 无产物列表

- **WHEN** manifest 中 execute 阶段 artifacts 为空
- **THEN** UI SHALL 显示 runtime 摘要或简短「执行中/已完成」文案
- **AND** SHALL NOT 显示 turn log 下载列表
