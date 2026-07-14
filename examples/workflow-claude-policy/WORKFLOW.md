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
    if [ -n "${SYMPHONY_POLICY_ROOT:-}" ] && [ -f "${SYMPHONY_POLICY_ROOT}/bootstrap/install.sh" ]; then
      bash "${SYMPHONY_POLICY_ROOT}/bootstrap/install.sh" "$(pwd)"
    fi
    test -f openspec/config.yaml
    test -f .agents/skills/openspec-new-change/SKILL.md
  before_run: |
    git status --short

agent:
  harness: claude
  max_concurrent_agents: 3
  max_turns: 25

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
  claude:
    command: claude
    permission_mode: acceptEdits
    reuse_policy: per_issue
    turn_timeout_ms: 3600000
    # allowed_tools:
    #   - Bash
    #   - Edit
    #   - Write
    #   - Read

server:
  port: 4321
---

你正在处理工作项 {{ issue.identifier }}：{{ issue.title }}。

{% if attempt %}
续跑上下文：第 {{ attempt }} 次 worker 续派。
{% endif %}

**Mode: v1.2-openspec + Claude Code** — 说明见 `docs/symphony-agent-workflow.md` 与 `docs/agent-harness.md`。

## ChangeRef

- `ChangeRef` = kebab-case(`{{ issue.identifier }}`)
- 仅操作 `openspec/changes/<ChangeRef>/`

## 规则

1. 按 Symphony 注入的 `effective_phase`、`skill` id、`produces` 与 **Skill Instructions** 执行（正文已内联，无需依赖 `.claude/skills` 发现）
2. 进度以产物文件为准
3. 禁止未授权 git push

## Skills

策略包 install 后位于 `.agents/skills/`。完整 after_create 依赖 `bundle-agents-skills-install`。

## Claude 无人值守提示

- 默认 `permission_mode: acceptEdits`（自动批准文件编辑；shell/网络仍可能需 `allowed_tools` 或更宽的权限模式）
- 会话按 `reuse_policy: per_issue` 写入 `.symphony/claude-session.json`，后续 turn 使用 `--resume`
