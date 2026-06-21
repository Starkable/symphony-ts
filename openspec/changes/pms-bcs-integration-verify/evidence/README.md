# BCS PMS 集成验证 — 本地联调说明

本目录用于归档 `pms-bcs-integration-verify` change 在**真实 PMS 环境**下的验收结果。

## 前置条件

- 有效 OAuth：`PMS_OAUTH_ACCESS_TOKEN`、`PMS_OAUTH_ACCESS_TOKEN_SECRET`、`PMS_JIRA_KEY_PATH`
- 网络可达 `tracker.endpoint`（默认 `http://pms.qiyi.domain`）
- 可选：`PMS_VERIFY_PROJECT=BCS`、`PMS_VERIFY_ASSIGNEE=shenxianghong_wb`
- 可选：`PMS_PROBE_ISSUE_KEY=BCS-xxxx`（用于 transitions/comments 探测）

## 命令

```bash
pnpm build

# JQL 矩阵（含 BCS assignee / 状态 case）
pnpm pms:verify-jql examples/workflow-pms/WORKFLOW.md

# 完整 probe（statuses + transitions + comments）
pnpm pms:probe examples/workflow-pms/WORKFLOW.md --probe-issue-key BCS-xxxx

# 可选写探测（仅测试工单）
pnpm pms:probe examples/workflow-pms/WORKFLOW.md --probe-issue-key BCS-xxxx --allow-write
```

## 报告

| 文件 | 内容 |
|------|------|
| `tmp/pms-jql-verify-report.json` | 原有 legacy JQL case 结果 |
| `tmp/pms-bcs-verify-report.json` | BCS 集成验证完整/部分报告 |

## 验收检查项

- [x] `bcs-assignee-in-progress` → `jqlValid: true`（HTTP 200，total=2）
- [x] `bcs-status-开发暂停` / `bcs-status-已提测` → `jqlValid: true`（HTTP 200）
- [x] 有匹配工单时 `jqlStatusName` 与 `returnedStatusName` 已记录
- [x] `projectStatuses` 含 BCS 产品需求相关 status 列表（6 issuetype entries）
- [x] `transitions` 含从进行中到目标态的可用动作（BCS-496：暂停开发→开发暂停、提测→已提测）

## 验收结论

| 日期 | 执行人 | 结果 | 备注 |
|------|--------|------|------|
| 2026-06-21 | 本地联调 | **PASS** | probe issue: BCS-496；4/4 BCS JQL valid；写探测未执行 |

### 关键发现

#### 1. JQL 与展示名对照（读侧）

| JQL status 名 | API `fields.status.name` | 匹配工单数 |
|---------------|--------------------------|------------|
| `In Progress` | **进行中** | assignee case: 2；status case: 25 |
| `开发暂停` | 开发暂停 | 4 |
| `已提测` | 已提测 | 10 |

**结论：** poll JQL 应继续使用 `status = "In Progress"`；orchestrator 二次过滤 / `active_states` 比对需兼容展示名 `进行中`（后续 readwrite change 实现）。

#### 2. 目标 transition（写侧，BCS-496 @ 进行中）

| 业务场景 | transition 名 | transition id | 目标 status |
|----------|---------------|---------------|-------------|
| 需求澄清阻塞 | 暂停开发 | 281 | 开发暂停 |
| 归档成功 | 提测 | 221 | 已提测 |

#### 3. 评论 API

- `GET /rest/api/2/issue/BCS-496/comment` → HTTP 200，count=0（读侧可用）
- 写评论 / 写 transition 未在本轮验证（`writeProbe.skipped: true`）

#### 4. Legacy JQL

- `pms:verify-jql` legacy cases：6/8 passed（与 BCS 验证无关，不影响本 change 门禁）

> CI 环境通常无 PMS 凭据，以上步骤需在可信内网机器手动执行。
