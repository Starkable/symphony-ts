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
    openspec --version
    if [ ! -f openspec/config.yaml ]; then
      openspec init --tools none
    fi
    if [ -n "${SYMPHONY_POLICY_ROOT:-}" ]; then
      bash "${SYMPHONY_POLICY_ROOT}/bootstrap/install.sh" "$(pwd)"
    fi
    test -f openspec/config.yaml
    test -f .agents/skills/openspec-new-change/SKILL.md
  before_run: |
    if [ -n "${SYMPHONY_REPO_ROOT:-}" ] && [ -f "${SYMPHONY_REPO_ROOT}/docs/snippets/materialize-repos.sh" ]; then
      bash "${SYMPHONY_REPO_ROOT}/docs/snippets/materialize-repos.sh"
    fi
  # Windows 宿主机可改用：
  # before_run: |
  #   if ($env:SYMPHONY_REPO_ROOT) { & "$env:SYMPHONY_REPO_ROOT\docs\snippets\materialize-repos.ps1" }

agent:
  harness: cursor
  max_concurrent_agents: 2
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
  cursor:
    command: agent
    mode: force
    reuse_policy: per_issue
    turn_timeout_ms: 3600000
---

你正在处理 PMS 工作项 {{ issue.identifier }}：{{ issue.title }}。

## 工单描述（PMS）

{% if issue.description %}
{{ issue.description }}
{% else %}
（PMS 描述为空；请结合本 prompt 末尾「PMS 备注」节与 proposal 假设章节补充需求背景。）
{% endif %}

{% if attempt %}
续跑：第 {{ attempt }} 次 worker 续派。
{% endif %}

**Mode: v1.2-openspec-multi-repo** — 多项目编排见 `docs/multi-repo-workspace.md`；Policy 见 `docs/symphony-agent-workflow.md`。

## Tracker 说明

- clarify / plan 须以**工单描述**（见上）与 **PMS 历史备注**为需求来源
- 备注由 orchestrator 在本 prompt **末尾**自动追加 `## PMS 备注` 节（poll 时读取，默认最近 10 条）；若该节缺失表示工单无评论或读评论失败
- Symphony **只读** PMS；产物写入 openspec change 目录，**不会**同步到 PMS 评论
- 字段对照：`docs/pms-field-mapping.md`

## ChangeRef

- `ChangeRef` = `{{ issue.identifier }}` 的 kebab-case（例 `BCS-1234` → `bcs-1234`）
- 仅 `openspec/changes/<ChangeRef>/`；**禁止** AskUserQuestion 选 change

## 规则

1. 按 Symphony 注入的 `effective_phase`、`/{skill}`、`produces` 执行本 turn 唯一动作
2. clarify 用 MCP 分析跨项目 scope；业务代码在 `repos/<repo_key>/`（物化后）
3. 禁止未授权 git push

## Skills

`SYMPHONY_POLICY_ROOT` → **symphony-openspec-bundle**；`install.sh` 以 symlink/junction **引用** skills，非拷贝。
