# PMS Tracker（读 + Orchestrator 写回）

Symphony 支持 `tracker.kind: pms`，从爱奇艺内部 PMS（Jira REST）**读取**工单并驱动 orchestrator 的 poll / dispatch / reconcile；worker **正常结束**后由 orchestrator **写回**状态与评论（Agent 不直接写 PMS）。

实现为纯 TypeScript（OAuth 1.0a + RSA-SHA1 + Jira REST），不依赖 Python、pms-opt-skill 或 FSB 运行时调用。

**PMS 字段如何理解（WORKFLOW / Jira / Symphony Issue 对照）**见 [pms-field-mapping.md](./pms-field-mapping.md)。

## 配置示例

```yaml
tracker:
  kind: pms
  endpoint: http://pms.qiyi.domain
  project_slug: CS
  active_states: [Open, "In Progress"]
  terminal_states: [已提测]
  assignee: shenxianghong_wb
  issue_types: [产品需求]
  exclude_draft_status: true
  oauth:
    access_token: $PMS_OAUTH_ACCESS_TOKEN
    access_token_secret: $PMS_OAUTH_ACCESS_TOKEN_SECRET
    rsa_private_key_path: $PMS_JIRA_KEY_PATH
    consumer_key: qa-monitor
    validate_on_dispatch: true
```

可选字段（与 pms-opt-skill JQL 习惯对齐）：

| 字段 | 说明 |
|------|------|
| `issue_types` | JQL `issuetype in (...)`，例如 `[产品需求]` |
| `assignee` | JQL `assignee in (...)`；可用 `PMS_TRACKER_ASSIGNEE` 环境变量覆盖（逗号分隔） |
| `exclude_draft_status` | 为 `true` 时追加 `status not in ("草稿", "审核中")`；`active_states` 为空时还会使用 `statusCategory != Done` |

- `active_states` / `terminal_states` 必须与 **JQL 可用的 status 名**一致（与 UI 展示名可能不同）。详见 [pms-field-mapping.md](./pms-field-mapping.md) 第 3 节；以 `pnpm pms:verify-jql` 实测为准。

## 凭据注入

每个 OAuth 字段均支持三种来源（优先级从高到低）：

1. WORKFLOW 明文值
2. `$ENV_VAR` 引用
3. Canonical 环境变量 fallback

| 配置字段 | Canonical 环境变量 |
|----------|-------------------|
| `oauth.access_token` | `PMS_OAUTH_ACCESS_TOKEN` |
| `oauth.access_token_secret` | `PMS_OAUTH_ACCESS_TOKEN_SECRET` |
| `oauth.rsa_private_key_path` | `PMS_JIRA_KEY_PATH` |
| `endpoint` | `PMS_JIRA_SERVER` |
| `assignee` | `PMS_TRACKER_ASSIGNEE` |

RSA 私钥路径支持 `~` 展开与相对 WORKFLOW.md 的路径解析。

## 状态名注意事项

`active_states` 与 `terminal_states` 配置错误会导致 JQL HTTP 400 或 poll 无候选工单。JQL 状态名与 PMS 界面展示名可能不一致（例如 JQL 写 `In Progress`，返回 `state` 为 `进行中`）。Symphony 内置 **status alias** 用于 dispatch/reconcile 比对，详见 [pms-field-mapping.md](./pms-field-mapping.md) 第 3 节。

- 字段对照与项目差异说明：[pms-field-mapping.md](./pms-field-mapping.md)
- 联调前建议运行：

```bash
pnpm build
pnpm pms:verify-jql examples/workflow-pms/WORKFLOW.md
```

报告输出到 `tmp/pms-jql-verify-report.json`。

## 能力边界

**读（poll / prompt）：**

- `fetchCandidateIssues` / `fetchIssuesByStates` / `fetchIssueStatesByIds`
- 候选工单 **评论读取**（`listIssueComments`），注入 prompt「PMS 备注」节
- 启动时 OAuth 鉴权探测（`GET /rest/api/2/myself`，可通过 `validate_on_dispatch: false` 关闭）
- `assignee` 过滤 + `ORDER BY updated ASC`（启用 assignee 时）

**写（orchestrator 写回，非 Agent）：**

- worker 正常结束后解析 `.symphony/workpad.md`
- `CLARIFY_BLOCKED` → transition **开发暂停** + POST 评论
- `Phase: done` → transition **提测**（目标 **已提测**），不写评论
- 写失败 **pending 重试**（poll tick），不阻塞 dispatch

**不支持：**

- Agent 侧 PMS 写回工具（Codex 不会注入 PMS REST 工具）
- 建单、任意 transition（仅上述两条写回路径）

### 测试分级等 transition 必填字段

BCS 等项目在 **提测** transition 时可能要求「测试分级」等自定义字段。若写回返回 HTTP 400：

1. 在 PMS 中为 OAuth 用户补字段编辑权限或默认值
2. 用 `pnpm pms:probe ... --allow-write --transition-to "提测"` 在测试工单上验证
3. 查 structured log 中 `pms_writeback` 的 HTTP status 与 error body

写回矩阵详见 [pms-field-mapping.md](./pms-field-mapping.md) 第 5 节。

## 联调 Checklist

1. 配置有效 OAuth token / secret 与 RSA 私钥文件
2. 确认 Symphony 运行环境可访问 `tracker.endpoint`
3. 设置正确的 `project_slug`（Jira projectKey）
4. 核对 `active_states` / `terminal_states` 与项目 workflow 一致
5. 运行 `pnpm pms:verify-jql` 与 `pnpm test` 通过
6. 启动 Symphony，检查 structured log 中 poll 是否出现候选工单
7. 验证 running worker 状态 reconcile 与 terminal workspace cleanup

完整 WORKFLOW 样例见 [`examples/workflow-pms/WORKFLOW.md`](../examples/workflow-pms/WORKFLOW.md)。

## 真实环境联调脚本

在不启动完整 orchestrator 的情况下，可用 `pms-smoke` 验证 OAuth 与候选工单拉取：

```bash
# 先编译
pnpm build

# 设置凭据（或在 WORKFLOW 中引用 $ENV）
export PMS_OAUTH_ACCESS_TOKEN=...
export PMS_OAUTH_ACCESS_TOKEN_SECRET=...
export PMS_JIRA_KEY_PATH=/path/to/your.key

# 使用示例 WORKFLOW 或你自己的 WORKFLOW.md
pnpm pms:smoke examples/workflow-pms/WORKFLOW.md

# 只预览前 5 条
pnpm pms:smoke ./WORKFLOW.md --limit 5

# 跳过 GET /myself 鉴权探测（仅当你已确认 search 可用）
pnpm pms:smoke ./WORKFLOW.md --skip-auth

# 对比多种 JQL 与 PMS 返回（验证状态名 / issue_types）
pnpm pms:verify-jql examples/workflow-pms/WORKFLOW.md
```

脚本会输出结构化 JSON，包含 `total`（候选工单总数）与 `preview`（前 N 条摘要）。运行环境须能访问 `tracker.endpoint`。

## BCS 集成验证（前置 spike）

在实现 PMS assignee 过滤、评论读写、状态流转（开发暂停 / 已提测）之前，先运行验证 CLI 收集真实 PMS 证据。

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PMS_VERIFY_PROJECT` | `BCS` | JQL 与 statuses 探测的项目 key |
| `PMS_VERIFY_ASSIGNEE` | `shenxianghong_wb` | assignee JQL case 使用的登录名 |
| `PMS_PROBE_ISSUE_KEY` | （无） | transitions/comments 探测用的工单 key |

### 命令

```bash
pnpm build

# 扩展 JQL 矩阵（含 BCS assignee + 目标状态）
pnpm pms:verify-jql examples/workflow-pms/WORKFLOW.md

# 完整 probe：JQL + project statuses + issue transitions/comments
export PMS_PROBE_ISSUE_KEY=BCS-xxxx
pnpm pms:probe examples/workflow-pms/WORKFLOW.md

# 可选写探测（仅测试工单，显式 opt-in）
pnpm pms:probe examples/workflow-pms/WORKFLOW.md \
  --probe-issue-key BCS-xxxx \
  --allow-write \
  --transition-to "开发暂停"
```

### 报告字段（`tmp/pms-bcs-verify-report.json`）

| 字段 | 说明 |
|------|------|
| `jqlCases[].jqlValid` | JQL search HTTP 200 |
| `jqlCases[].hasMatchingIssues` | `total > 0` |
| `jqlCases[].jqlStatusName` | JQL 中配置的 status 字符串 |
| `jqlCases[].returnedStatusName` | 首条 issue 的 `fields.status.name`（展示名） |
| `projectStatuses` | `GET /project/{key}/statuses` 按 issuetype 分组 |
| `transitions` | 指定工单的可用 transition 列表 |
| `comments` | 指定工单的评论读取结果 |
| `writeProbe` | `--allow-write` 时的 comment/transition 探测结果 |

后续 PMS 读/写 change 启动前，关键 BCS JQL case 应在真实环境 `jqlValid: true`。详见 [`openspec/changes/pms-bcs-integration-verify/evidence/README.md`](../openspec/changes/pms-bcs-integration-verify/evidence/README.md)。
