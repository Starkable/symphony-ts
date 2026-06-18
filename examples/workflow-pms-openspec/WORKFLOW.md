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
    access_token: $PMS_OAUTH_ACCESS_TOKEN
    access_token_secret: $PMS_OAUTH_ACCESS_TOKEN_SECRET
    rsa_private_key_path: $PMS_JIRA_KEY_PATH
    consumer_key: qa-monitor
    validate_on_dispatch: true

polling:
  interval_ms: 30000

workspace:
  root: ./tmp/symphony_workspaces

hooks:
  after_create: |
    git clone --depth 1 'https://github.com/your-org/your-repo.git' .
    pnpm install
    openspec --version
    if [ ! -f openspec/config.yaml ]; then
      openspec init --tools none
    fi
    test -f openspec/config.yaml

agent:
  harness: cursor
  max_concurrent_agents: 2
  max_turns: 25

harnesses:
  cursor:
    command: agent
    mode: force
    reuse_policy: per_issue
    turn_timeout_ms: 3600000
---

你正在处理 PMS 工作项 {{ issue.identifier }}：{{ issue.title }}。

{% if attempt %}
续跑：第 {{ attempt }} 次；从 `.symphony/workpad.md` 的 Phase 继续。
{% endif %}

**Mode: v1-openspec** — Policy 见 `docs/symphony-agent-workflow.md`；PMS 配置见 `docs/pms-tracker.md`。

## Tracker 说明

- Symphony **只读** PMS；澄清与报告写入 workpad / openspec，**不会**同步到 PMS 评论
- 字段对照：`docs/pms-field-mapping.md`

## ChangeRef

- `ChangeRef` = `{{ issue.identifier }}` 的 kebab-case（例 `BCS-1234` → `bcs-1234`）
- 仅 `openspec/changes/<ChangeRef>/`；**禁止** AskUserQuestion 选 change

## 首要动作

1. 读/初始化 workpad（`Mode: v1-openspec`）
2. 按 Phase 执行唯一允许动作（**禁止跳步**）
3. 更新 Gate Log

## Phase 路由

| Phase | Skill / 动作 |
|-------|----------------|
| clarify | `openspec-explore` |
| plan | `openspec-ff-change` |
| proposal_review | 自审 → `REVIEW_REPORT` |
| execute | `openspec-apply-change` |
| verify | `tasks.md ## Validation` → `VERIFICATION_REPORT` |
| archive | `openspec-archive-change` |
| done | 结束 |

C0 未过禁止改代码；不可推断 → `failed` + `CLARIFY_BLOCKED`。

## Skills

`.cursor/skills/openspec-{explore,ff-change,apply-change,archive-change}/SKILL.md`  
可选：`.agents/skills/symphony-v1-policy/SKILL.md`
