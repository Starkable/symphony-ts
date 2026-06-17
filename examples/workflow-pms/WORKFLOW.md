---
tracker:
  kind: pms
  endpoint: http://pms.qiyi.domain
  project_slug: BASELINEREQ
  active_states: [待开发]
  terminal_states: [已关闭, 已取消]
  oauth:
    access_token: $PMS_OAUTH_ACCESS_TOKEN
    access_token_secret: $PMS_OAUTH_ACCESS_TOKEN_SECRET
    rsa_private_key_path: $PMS_JIRA_KEY_PATH
    consumer_key: qa-monitor
    validate_on_dispatch: true

polling:
  interval_ms: 30000

workspace:
  root: ./tmp/symphony_workspaces

agent:
  harness: cursor
  max_concurrent_agents: 2
  max_turns: 20

harnesses:
  cursor:
    command: agent
    mode: force
---

你正在处理工作项 {{ issue.identifier }}：{{ issue.title }}。

当前工单来自 PMS（Jira）。请阅读工单描述与代码库，按 WORKFLOW Policy 在 Workpad 中推进阶段。

说明：

- 一期 Symphony 仅从 PMS **读取**工单，不会自动写回评论或变更状态
- 澄清问题请写入 `.symphony/workpad.md`，不要假设 PM 能在 PMS 中看到 Agent 输出
