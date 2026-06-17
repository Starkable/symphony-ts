# PMS Tracker（只读）

Symphony 支持 `tracker.kind: pms`，从爱奇艺内部 PMS（Jira REST）**只读**拉取工单，驱动 orchestrator 的 poll / dispatch / reconcile。

实现为纯 TypeScript（OAuth 1.0a + RSA-SHA1 + Jira REST），不依赖 Python、pms-opt-skill 或 FSB 运行时调用。

**PMS 字段如何理解（WORKFLOW / Jira / Symphony Issue 对照）**见 [pms-field-mapping.md](./pms-field-mapping.md)。

## 配置示例

```yaml
tracker:
  kind: pms
  endpoint: http://pms.qiyi.domain
  project_slug: CS
  active_states: [Open, "In Progress"]
  terminal_states: [Done, Closed]
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

RSA 私钥路径支持 `~` 展开与相对 WORKFLOW.md 的路径解析。

## 状态名注意事项

`active_states` 与 `terminal_states` 配置错误会导致 JQL HTTP 400 或 poll 无候选工单。JQL 状态名与 PMS 界面展示名可能不一致（例如 JQL 写 `In Progress`，返回 `state` 为 `进行中`）。

- 字段对照与项目差异说明：[pms-field-mapping.md](./pms-field-mapping.md)
- 联调前建议运行：

```bash
pnpm build
pnpm pms:verify-jql examples/workflow-pms/WORKFLOW.md
```

报告输出到 `tmp/pms-jql-verify-report.json`。

## 一期能力边界

**支持：**

- `fetchCandidateIssues` / `fetchIssuesByStates` / `fetchIssueStatesByIds`
- 启动时 OAuth 鉴权探测（`GET /rest/api/2/myself`，可通过 `validate_on_dispatch: false` 关闭）

**不支持：**

- 评论写回、状态流转、建单
- Agent 侧 PMS 写回工具（Codex 不会注入 `linear_graphql`，也不会注入 PMS 工具）

`[CLARIFY]` 等澄清内容在一期仅写入 Workpad，不会同步到 PMS 评论。

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
