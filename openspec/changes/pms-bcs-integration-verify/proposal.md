## Why

Symphony 计划为 BCS 项目扩展 PMS 读/写能力（`assignee` 过滤、评论读写、状态流转至「开发暂停」「已提测」），但多项 Jira 字段名、JQL 合法性、transition 可达性与 OAuth 写权限尚未在真实 PMS 实例上验证。在实现业务功能前，必须先通过可重复执行的联调脚本收集证据，避免方案建立在推断之上。

## What Changes

- 扩展 `pnpm pms:verify-jql`：增加 BCS 专用 JQL 矩阵（含 `assignee`、`In Progress`、`开发暂停`、`已提测` 等 case）
- 新增 `pnpm pms:probe` CLI：对单张工单或项目级 REST 端点执行只读/可选写探测（statuses、transitions、comments）
- 统一输出结构化报告至 `tmp/pms-bcs-verify-report.json`（含 JQL 200/400、返回 `status.name` 与 JQL 名对照、transition 列表摘要）
- 新增 Vitest 单元测试（mock HTTP，验证 probe/verify 逻辑，不依赖 live PMS）
- 更新 `docs/pms-tracker.md`：补充 BCS 验证流程与报告解读说明
- **本 change 不做**：orchestrator 写回、WORKFLOW 新字段落地、Issue 模型扩展

## Capabilities

### New Capabilities

- `pms-bcs-integration-verify`：BCS PMS 集成前置验证 CLI 与 JQL 矩阵，在真实环境收集 assignee/状态/transition/comment 证据

### Modified Capabilities

（无。本 change 为 spike，不修改既有 tracker 运行时行为。）

## Impact

- **代码**：`src/cli/pms-verify-jql.ts`、`src/cli/pms-probe.ts`（新）、`package.json` scripts、`tests/cli/`
- **产物**：`tmp/pms-jql-verify-report.json`（扩展）、`tmp/pms-bcs-verify-report.json`（新）
- **依赖**：复用现有 `PmsTrackerClient` OAuth；probe 仅调用 Jira REST v2
- **前置条件**：有效 OAuth 凭据、网络可达 `tracker.endpoint`、可选环境变量 `PMS_PROBE_ISSUE_KEY`（如 `BCS-xxxx`）
- **后续 change 门禁**：读/写 PMS 功能 change 启动前，本 verify 报告关键 case 须 PASS
