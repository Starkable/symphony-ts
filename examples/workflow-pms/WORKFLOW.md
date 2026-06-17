---
tracker:
  kind: pms
  endpoint: http://pms.qiyi.domain
  project_slug: BCS
  active_states: [Open, "In Progress"]
  terminal_states: [Done, Closed]
  issue_types: [产品需求]
  exclude_draft_status: true
  oauth:
    access_token: 
    access_token_secret: 
    rsa_private_key_path: 
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
- 字段与 JQL 配置说明见 [docs/pms-field-mapping.md](../../docs/pms-field-mapping.md)；联调见 [docs/pms-tracker.md](../../docs/pms-tracker.md)
