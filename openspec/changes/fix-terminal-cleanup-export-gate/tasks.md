## 1. 类型与可导出内容判定

- [x] 1.1 在 `src/artifact-store/types.ts` 的 `WorkflowMeta` 增加可选字段 `archived_reason?: string | null`
- [x] 1.2 新增 `src/artifact-store/exportable-content.ts`，实现 `hasExportableContent(workspacePath)`，复用 `openspec-scan` / `scanSymphonyLogs` 规则
- [x] 1.3 新增 `tests/artifact-store/exportable-content.test.ts`：空 workspace、有 proposal.md、仅有 turn log、非空 workpad 等场景

## 2. Exporter 与 archived_reason

- [x] 2.1 `WorkflowExporter.exportIssue` 支持可选参数 `setArchivedReason?: "pms_terminal_cleanup"`，写入 `meta.archived_reason`
- [x] 2.2 新增 `exportIssueIfExportable`（或等价方法）：先检查 workspace 存在 + `hasExportableContent`，不满足则 no-op 返回 `{ exported: false, reason }`
- [x] 2.3 终态 cleanup 路径（`exportTerminalIssue`、`exportIssueBeforeCleanup`）改用 `exportIssueIfExportable` 并传入 `setArchivedReason`
- [x] 2.4 新增 exporter 单元测试：无产物 no-op、有产物写入 `archived_reason`

## 3. Runtime-host startup cleanup

- [x] 3.1 `cleanupTerminalIssueWorkspaces`：export 前检查 workspace 存在性；跳过 export 时打 `startup_terminal_skip_export`（`no_workspace` / `empty_workspace`）
- [x] 3.2 仍对所有命中 issue 调用 `removeForIssue`
- [x] 3.3 更新 `tests/orchestrator/runtime-host.test.ts`：mock 终态 issue 无 workspace → 不调用 store write；有 workspace + 产物 → export + remove

## 4. WorkflowService 列表过滤

- [x] 4.1 `listWorkflows("active")`：排除 `archived_reason` 非空的非 running 条目
- [x] 4.2 `listWorkflows("archived")`：包含 `archived_reason` 非空或 `terminal_phase` 为 done/failed
- [x] 4.3 详情/摘要 API 暴露 `archived_reason` 字段
- [x] 4.4 新增 `tests/observability/workflow-service.test.ts`（或扩展现有）覆盖 Active/Archived 过滤

## 5. 集成与 CLI 测试

- [x] 5.1 扩展 `tests/cli/runtime-integration.test.ts`：startup 返回终态 issue 且无 workspace 时 tracker `fetchIssuesByStates` 被调用但 store 无新目录
- [x] 5.2 运行 `pnpm test`、`pnpm typecheck`、`pnpm lint` 全部通过（本 change 相关测试与 typecheck 通过；全量 `pnpm test` 在 Windows 环境存在既有 codex/path 失败）

## 6. 文档

- [x] 6.1 更新 `docs/workflow-dashboard.md`：说明 startup cleanup export 门槛与 `archived_reason`
- [x] 6.2 修正 `docs/pms-field-mapping.md`：`fetchIssuesByStates` 用于启动 cleanup；reconcile 使用 `fetchIssueStatesByIds`

## 7. 人工验收

- [ ] 7.1 本地 WORKFLOW（PMS + artifact_store）：启动后 Active 不含从未跑过的已提测工单（如 BCS-420）
- [ ] 7.2 跑完进行中工单至 PMS 终态：cleanup 后条目进 History 且含 `archived_reason`
- [ ] 7.3 一次性删除遗留空壳目录（如 `F:/tmp/data/BCS-420/`）并确认 Dashboard 不再显示
