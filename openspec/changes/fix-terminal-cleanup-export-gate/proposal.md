## Why

Symphony 启动时会通过 `fetchIssuesByStates(terminal_states)` 清理 PMS 终态工单的 workspace，并在启用 Artifact Store 时对每条命中工单执行 `exportTerminalIssue`。当前实现**不区分本地是否曾运行过 Agent**，导致 assignee 名下所有「已提测」工单（如 BCS-420）被写入空壳 `meta.json`/`manifest.json`，Dashboard Active 列表误显示为活跃工作流。Poll 仍是唯一派活入口，但 startup cleanup 的 export 副作用与「仅持久化 Symphony 真实执行过的工单」的产品预期不符。

## What Changes

- 启动 terminal cleanup **保留** PMS 终态查询与 workspace 删除（符合 `SPEC.upstream.md` §8.6）
- **新增 export 门槛**：仅当本地 workspace 存在且含可导出 Symphony 产物时才写入 Artifact Store
- startup / worker 终态 cleanup export 时写入 `meta.archived_reason = "pms_terminal_cleanup"`，供 Dashboard 归档
- **收紧 Active 列表规则**：排除已设置 `archived_reason` 的 store 条目；History 包含 `archived_reason` 或 OpenSpec 终态
- 无 workspace 或无产物时记录 `startup_terminal_skip_export` 结构化日志
- **不修改** poll JQL、dispatch 逻辑、reconcile 的 `fetchIssueStatesByIds` 行为
- **不自动删除** 历史遗留空壳目录（运维一次性清理）；本 change 仅防止新空壳产生

## Capabilities

### New Capabilities

- `terminal-cleanup-export-gate`：启动 cleanup 与 terminal export 的本地门槛、`hasExportableContent` 判定、`archived_reason` 元数据
- `workflow-dashboard-list-filter`：Active/Archived API 基于 `archived_reason` 与 `terminal_phase` 的列表过滤规则

### Modified Capabilities

（无：`openspec/specs/` 尚无已归档 capability；本 change 以新增 delta spec 为主，语义上扩展 `symphony-workflow-dashboard` change 中的 artifact-store 与 workflow-dashboard 行为。）

## Impact

- **代码**：`src/artifact-store/exporter.ts`、`src/orchestrator/runtime-host.ts`（`cleanupTerminalIssueWorkspaces`、`exportTerminalIssue`）、`src/observability/workflow-service.ts`、`src/artifact-store/types.ts`
- **测试**：`tests/orchestrator/runtime-host.test.ts`、新增 exporter / workflow-service 单元测试
- **文档**：`docs/workflow-dashboard.md`；修正 `docs/pms-field-mapping.md` 中 reconcile 与 `fetchIssuesByStates` 的错误描述
- **配置**：无 WORKFLOW 配置项变更
- **API**：`GET /api/v1/workflows?status=active|archived` 响应集合变化（空壳不再出现在 active）
- **运维**：已有 `F:/tmp/data/` 空壳需手动删除一次
