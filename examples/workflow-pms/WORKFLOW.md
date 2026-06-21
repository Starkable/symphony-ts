---
tracker:
  kind: pms
  endpoint: http://pms.qiyi.domain
  project_slug: BCS
  active_states: ["In Progress"]
  terminal_states: [已提测]
  issue_types: [产品需求]
  assignee: shenxianghong_wb
  oauth:
    access_token: PLwMOt9tat1kXHcH49nmSS11eOtfX2nD
    access_token_secret: nOFxpEmLEjOmLIRObB0utqKfDh3YE03A
    rsa_private_key_path: E:\key\test.key
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

当前工单来自 PMS（Jira）。请阅读工单描述、PMS 历史备注与代码库，按 WORKFLOW Policy 在 Workpad 中推进阶段。

说明：

- Orchestrator 会在 turn 结束后根据 workpad 信号写回 PMS（澄清失败 → 开发暂停+备注；归档完成 → 已提测）
- 澄清问题请写入 `.symphony/workpad.md`；阻塞时 Symphony 会同步备注到 PMS
- 字段与 JQL 配置说明见 [docs/pms-field-mapping.md](../../docs/pms-field-mapping.md)；联调见 [docs/pms-tracker.md](../../docs/pms-tracker.md)
- BCS 集成验证：`pnpm pms:verify-jql examples/workflow-pms/WORKFLOW.md` 与 `pnpm pms:probe examples/workflow-pms/WORKFLOW.md --probe-issue-key BCS-xxxx`
