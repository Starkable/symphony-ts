---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: YOUR_PROJECT_SLUG
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Closed
    - Cancelled
    - Canceled
    - Duplicate

polling:
  interval_ms: 30000

workspace:
  root: ~/symphony_workspaces

hooks:
  after_create: |
    git clone --depth 1 'https://github.com/your-org/your-repo.git' .
    pnpm install
    openspec --version
    if [ ! -f openspec/config.yaml ]; then
      openspec init --tools none
    fi
    test -f openspec/config.yaml
  before_run: |
    git status --short

agent:
  harness: cursor
  max_concurrent_agents: 3
  max_turns: 25

# V1.2 artifact-driven workflow（编排仅 dispatch skill；步骤规则在 skill 内）
workflow:
  version: "1.2"
  change_ref: kebab_case_issue_id
  phases:
    - id: clarify
      skill: openspec-new-change
      produces: openspec/changes/{change_ref}/proposal.md
    - id: proposal_review
      skill: openspec-proposal-review
      produces: openspec/changes/{change_ref}/proposal_review.md
      requires_pass: true
    - id: plan
      skill: openspec-continue-change
      produces: openspec/changes/{change_ref}/tasks.md
    - id: execute
      skill: openspec-apply-change
      produces: openspec/changes/{change_ref}/execute.md
      requires_pass: true
    - id: verify
      skill: openspec-verify
      produces: openspec/changes/{change_ref}/verification.md
      requires_pass: true
    - id: archive
      skill: openspec-archive-change
      produces: openspec/changes/{change_ref}/archive.md
      requires_pass: true

harnesses:
  cursor:
    command: agent
    mode: force
    reuse_policy: per_issue
    turn_timeout_ms: 3600000
    turn_log_workspace_artifact: true

server:
  port: 4321
---

你正在处理工作项 {{ issue.identifier }}：{{ issue.title }}。

{% if attempt %}
续跑上下文：第 {{ attempt }} 次 worker 续派。
{% endif %}

**Mode: v1.2-openspec** — 完整说明见 `docs/symphony-agent-workflow.md`。

## ChangeRef（硬绑定）

- `ChangeRef` = `{{ issue.identifier }}` 的 kebab-case（例 `LIN-42` → `lin-42`）
- 仅操作 `openspec/changes/<ChangeRef>/`
- **禁止** AskUserQuestion 选择 change 名称

## 规则

1. 按 Symphony 每 turn 注入的 `effective_phase`、`/{skill}`、`produces` 执行唯一动作
2. 阶段进度以 **产物文件** 为准；步骤细则见对应 Cursor Skill
3. `requires_pass` 阶段须在产物 front matter 写 `status: pass` 后才算完成
4. 禁止未授权 git push

## Skills

策略包（`SYMPHONY_POLICY_ROOT` → `symphony-openspec-bundle`）install 后位于 `.cursor/skills/`。
