# PMS Tracker（只读）

Symphony 支持 `tracker.kind: pms`，从爱奇艺内部 PMS（Jira REST）**只读**拉取工单，驱动 orchestrator 的 poll / dispatch / reconcile。

实现为纯 TypeScript（OAuth 1.0a + RSA-SHA1 + Jira REST），不依赖 Python、pms-opt-skill 或 FSB 运行时调用。

## 配置示例

```yaml
tracker:
  kind: pms
  endpoint: http://pms.qiyi.domain
  project_slug: BASELINEREQ
  active_states: [待开发, 开发中]
  terminal_states: [已关闭, 已取消]
  oauth:
    access_token: $PMS_OAUTH_ACCESS_TOKEN
    access_token_secret: $PMS_OAUTH_ACCESS_TOKEN_SECRET
    rsa_private_key_path: $PMS_JIRA_KEY_PATH
    consumer_key: qa-monitor
    validate_on_dispatch: true
```

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

`active_states` 与 `terminal_states` 必须与 PMS 中显示的中文状态名**完全一致**（包括标点与空格）。配置错误会导致 JQL 无匹配结果，poll 日志中看不到候选工单。

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
4. 核对 `active_states` / `terminal_states` 中文状态名
5. 运行 `pnpm test` 通过本地单元测试
6. 启动 Symphony，检查 structured log 中 poll 是否出现候选工单
7. 验证 running worker 状态 reconcile 与 terminal workspace cleanup

完整 WORKFLOW 样例见 [`examples/workflow-pms/WORKFLOW.md`](../examples/workflow-pms/WORKFLOW.md)。
